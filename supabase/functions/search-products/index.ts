import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseEstimatedUnitCost, recordProviderMetric } from "../_shared/provider-metrics.ts";
import { resolveProviderCurrency } from "../_shared/provider-currency.ts";
import { resolveSearchMarket } from "../_shared/search-market.ts";
import { classifySerpApiFailure, describeSerpApiHttpFailure, parseSerpApiShoppingResponse } from "../_shared/serpapi.ts";
import { parseSearXNGResponse, searchSearXNG, toSearXNGCandidates, type SearXNGResult } from "../_shared/searxng.ts";
import { classifySeller, getRetailerDomain } from "../_shared/retailer-discovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const { query, mode, product } = await req.json();
    if (typeof query !== "string" || !query.trim() || query.length > 240) {
      return json({ error: "Enter a product search under 240 characters." }, 400);
    }
    const key = Deno.env.get("SERPAPI_KEY");
    const searxngBaseUrl = Deno.env.get("SEARXNG_URL")?.trim() || null;
    if (!key && !searxngBaseUrl) return json({ configured: false, candidates: [], offers: [] });
    const authorization = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey) return json({ error: "Authentication required." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) return json({ error: "Authentication required." }, 401);
    const { data: preferences, error: preferencesError } = await userClient.from("profiles").select("country,currency,language").eq("id", auth.user.id).maybeSingle();
    if (preferencesError) return json({ error: "Your search preferences could not be loaded." }, 503);
    const market = resolveSearchMarket(preferences?.country, preferences?.currency, preferences?.language);
    const { data: userRequestReserved, error: userRequestError } = await userClient.rpc("reserve_interactive_provider_request", { p_surface: "product_search" });
    if (userRequestError) return json({ error: "Search limits are temporarily unavailable. Try again shortly." }, 503);
    if (userRequestReserved !== true) return json({ error: "Search limit reached. Try again in a minute." }, 429);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json({ error: "Search service is not configured." }, 503);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const runSearXNGFallback = async (primaryError: string | null): Promise<Response | null> => {
      if (!searxngBaseUrl) return null;
      const cacheInput = `searxng|${query.toLowerCase().replace(/\s+/g, " ").trim()}|${market.country}|${market.hl}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cacheInput));
      const queryHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const now = new Date().toISOString();
      const { data: cached } = await admin.from("retailer_search_cache").select("results")
        .eq("query_hash", queryHash).eq("provider", "searxng").gt("expires_at", now).maybeSingle();
      let leads: SearXNGResult[] = Array.isArray(cached?.results)
        ? parseSearXNGResponse({ results: cached.results })
        : [];
      let fallbackError: string | null = null;
      if (!cached) {
        const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(Deno.env.get("SEARXNG_DAILY_SEARCH_LIMIT") || "20", 10) || 20));
        const { data: reserved, error: budgetError } = await admin.rpc("reserve_provider_search", { p_provider: "searxng", p_daily_limit: dailyLimit });
        if (budgetError) fallbackError = "The SearXNG daily search budget could not be checked.";
        else if (reserved !== true) {
          fallbackError = "Wishly reached its configured daily SearXNG search budget. Try again tomorrow.";
          await recordProviderMetric(admin, { provider: "searxng", surface: "interactive", outcome: "budget_exhausted", marketCountry: market.country });
        } else {
          const startedAt = Date.now();
          let statusCode: number | null = null;
          let outcome: "success" | "error" = "error";
          try {
            const result = await searchSearXNG(searxngBaseUrl, query, market.hl);
            statusCode = result.response.status;
            if (!result.response.ok) fallbackError = `SearXNG returned HTTP ${result.response.status}.`;
            else {
              leads = result.results;
              outcome = "success";
              await admin.from("retailer_search_cache").upsert({
                query_hash: queryHash, provider: "searxng", results: leads,
                expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              }, { onConflict: "query_hash" });
            }
          } catch {
            fallbackError = "The configured SearXNG instance could not be reached.";
          } finally {
            await recordProviderMetric(admin, {
              provider: "searxng", surface: "interactive", outcome, durationMs: Date.now() - startedAt,
              resultCount: leads.length, statusCode,
              unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SEARXNG_ESTIMATED_COST_PER_SEARCH_USD")),
              marketCountry: market.country,
            });
          }
        }
      }

      if (mode === "offers") {
        return json({
          configured: true, candidates: [], offers: [], search_sources: ["searxng"],
          error: "SearXNG found public page leads only; Wishly needs an inspected product page before it can report an offer price.",
        });
      }
      const candidates = toSearXNGCandidates(leads);
      return json({
        configured: true, candidates, offers: [], search_sources: ["searxng"],
        error: candidates.length ? null : [primaryError, fallbackError].filter(Boolean).join(" ") || "No retailer page leads were found.",
      });
    };

    if (!key) {
      const fallback = await runSearXNGFallback(null);
      return fallback || json({ configured: false, candidates: [], offers: [] });
    }
    const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(Deno.env.get("SERPAPI_DAILY_SEARCH_LIMIT") || "31", 10) || 31));
    const { data: providerRequestReserved, error: providerBudgetError } = await admin.rpc("reserve_provider_search", { p_provider: "serpapi", p_daily_limit: dailyLimit });
    if (providerBudgetError) {
      const fallback = await runSearXNGFallback("Shopping search budget could not be checked.");
      return fallback || json({ error: "Shopping search budget could not be checked. Try again shortly." }, 503);
    }
    if (providerRequestReserved !== true) {
      const fallback = await runSearXNGFallback("Wishly reached its configured daily Google Shopping search budget.");
      return fallback || json({ configured: true, candidates: [], offers: [], error: "Wishly reached its configured daily Shopping search budget. Try again tomorrow." }, 429);
    }

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("gl", market.gl);
    url.searchParams.set("hl", market.hl);
    url.searchParams.set("api_key", key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    const startedAt = Date.now();
    let statusCode: number | null = null;
    let resultCount = 0;
    let outcome: "success" | "error" = "error";
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome, errorCode: "network_error", durationMs: Date.now() - startedAt, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
      const fallback = await runSearXNGFallback("Google Shopping could not be reached.");
      return fallback || json({ configured: true, candidates: [], offers: [], error: "Shopping search provider could not be reached." }, 502);
    } finally {
      clearTimeout(timeout);
    }
    statusCode = response.status;
    if (!response.ok) {
      const failureBody = await response.text();
      const errorCode = classifySerpApiFailure(response.status, failureBody);
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome, durationMs: Date.now() - startedAt, statusCode, errorCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
      const failure = describeSerpApiHttpFailure(response.status, failureBody);
      const fallback = await runSearXNGFallback(failure);
      return fallback || json({ configured: true, candidates: [], offers: [], error: failure });
    }
    let payload: unknown;
    try { payload = await response.json(); }
    catch {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome, durationMs: Date.now() - startedAt, statusCode, errorCode: "invalid_response", unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
      const fallback = await runSearXNGFallback("SerpAPI returned an unreadable Shopping response.");
      return fallback || json({ configured: true, candidates: [], offers: [], error: "Shopping search provider returned an unreadable response." }, 502);
    }
    const parsed = parseSerpApiShoppingResponse(payload);
    if (parsed.error) {
      const errorCode = classifySerpApiFailure(response.status, JSON.stringify(payload));
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome, durationMs: Date.now() - startedAt, statusCode, errorCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
      const failure = parsed.error === "provider_error"
        ? "SerpAPI rejected this Shopping search. Check SERPAPI_KEY and your SerpAPI account in Supabase Edge Function secrets."
        : "SerpAPI returned an unreadable Shopping response.";
      const fallback = await runSearXNGFallback(failure);
      return fallback || json({ configured: true, candidates: [], offers: [], error: failure });
    }
    const rows = parsed.rows.slice(0, 20) as any[];
    resultCount = rows.length;
    outcome = "success";

    if (!rows.length) {
      const fallback = await runSearXNGFallback(null);
      if (fallback) return fallback;
    }

    if (mode === "offers" && product && typeof product.title === "string") {
      const offers = rows.flatMap((row: any) => {
        const title = String(row.title || "");
        const model = product.model_number || null;
        const titleLower = title.toLowerCase();
        // Product-name similarity is useful for candidates, but not enough to
        // call an offer exact. Require an explicit model or GTIN in listing data.
        const explicitModel = model && titleLower.includes(String(model).toLowerCase());
        const explicitGtin = product.gtin && [row.gtin, row.upc, row.ean].some((id) => id && String(id).replace(/\D/g, "") === String(product.gtin).replace(/\D/g, ""));
        if (!explicitModel && !explicitGtin) return [];
        const price = Number(row.extracted_price);
        const link = typeof row.link === "string" ? row.link : "";
        if (!Number.isFinite(price) || price <= 0 || !/^https?:\/\//i.test(link)) return [];
        const currency = resolveProviderCurrency(String(row.price || ""), market.currency);
        if (!currency) return [];
        return [{
          store: String(row.source || "Retailer"),
          seller_type: classifySeller(getRetailerDomain(link) || ""),
          price,
          currency,
          url: link,
          condition: "unknown",
          availability: "unknown",
          source: "google_shopping",
          last_verified_at: new Date().toISOString(),
          match_basis: explicitGtin ? "gtin" : "model_number",
        }];
      });
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome, durationMs: Date.now() - startedAt, resultCount, statusCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
      return json({ configured: true, offers });
    }

    const candidates = rows.flatMap((row: any) => {
      if (!row.title) return [];
      const price = Number(row.extracted_price);
      const currency = resolveProviderCurrency(String(row.price || ""), market.currency);
      return [{
        title: String(row.title),
        brand: null,
        image_url: row.thumbnail || null,
        price: Number.isFinite(price) && price > 0 && currency ? price : null,
        currency: currency || undefined,
        store: row.source || null,
        url: typeof row.link === "string" && /^https?:\/\//i.test(row.link) ? row.link : null,
        confidence: 0.5,
        match_reason: "Shopping search candidate; confirm the product and variant before saving.",
        source: "google_shopping",
      }];
    });
    await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome, durationMs: Date.now() - startedAt, resultCount, statusCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
    return json({ configured: true, candidates });
  } catch {
    return json({ error: "Could not complete product search." }, 500);
  }
});
