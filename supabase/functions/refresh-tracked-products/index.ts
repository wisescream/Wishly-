import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getResearchRetryDelayMs } from "../_shared/research-schedule.ts";
import { extractRetailerCitations, parseWebSnippetPrice } from "../_shared/web-search.ts";
import { getTitleCoverage } from "../_shared/title-match.ts";
import { confirmsGenderVariant, getGenderVariant } from "../_shared/gender-variant.ts";
import { calculateTotalPurchaseCost, parseShippingEstimate } from "../_shared/offer-cost.ts";
import { addOfferCurrencyConversions } from "../_shared/exchange-rate.ts";
import { parseEstimatedUnitCost, parseOpenRouterWebSearchCount, recordProviderMetric, type ProviderErrorCode } from "../_shared/provider-metrics.ts";
import { classifySerpApiFailure, parseSerpApiShoppingResponse } from "../_shared/serpapi.ts";
import { resolveProviderCurrency } from "../_shared/provider-currency.ts";
import { buildProductSearchQueries } from "../_shared/product-search.ts";
import { deferPersistenceRetry, recordOfferPriceObservations } from "../_shared/research-persistence.ts";
import { findProductVariantColor, inspectAndVerifyRetailerProductPage } from "../_shared/retailer-page-verification.ts";
import { classifySeller, getRetailerDomain, inferRetailerCountry } from "../_shared/retailer-discovery.ts";
import { inspectRetailerCatalog } from "../_shared/retailer-catalog-inspection.ts";
import { compareProductConditions, normalizeProductCondition } from "../_shared/product-condition.ts";
import { resolveSearchMarket } from "../_shared/search-market.ts";
import { buildRetailerQueries, parseTavilyResponse, searchTavily } from "../_shared/tavily.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-price-check-secret" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const capacity = (value: string) => value.match(/\b\d+\s*(?:gb|tb|mb)\b/i)?.[0].replace(/\s/g, "").toLowerCase() || null;
const sizeVariant = (value: unknown) => {
  const text = String(value || "");
  const match = text.match(/\b(US\s*(?:men'?s|women'?s)|EU|UK|CM|MM)\s*[:#-]?\s*(XXS|XS|S|M|L|XL|XXL|\d{1,3}(?:\.\d)?)\b/i)
    || text.match(/\b(?:shoe\s+)?size\s*[:#-]?\s*(XXS|XS|S|M|L|XL|XXL|\d{1,3}(?:\.\d)?)\b/i)
    || text.trim().match(/^(XXS|XS|S|M|L|XL|XXL|\d{1,3}(?:\.\d)?)$/i);
  if (!match) return null;
  const hasSystem = /^(US|EU|UK|CM|MM)/i.test(match[0]);
  return { label: (hasSystem ? match[2] : match[1]).toUpperCase(), system: hasSystem ? match[1].replace(/\s+/g, " ").toUpperCase() : null };
};
const providerCondition = (providerValue: unknown, title: string) => {
  const condition = normalizeProductCondition(providerValue);
  return condition === "unknown" ? normalizeProductCondition(title) : condition;
};
const retailerDns = (hostname: string, recordType: "A" | "AAAA") => Deno.resolveDns(hostname, recordType);
const retailerTransport = {
  connect: (address: string, port: number) => Deno.connect({ hostname: address, port }),
  startTls: (socket: any, hostname: string) => Deno.startTls(socket, { hostname }),
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("SERPAPI_KEY");
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    const tavilyKey = Deno.env.get("TAVILY_API_KEY");
    const tavilyEnabled = Boolean(tavilyKey);
    if (!url || !serviceKey) return json({ error: "Service is not configured." }, 503);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = req.headers.get("x-price-check-secret");
    if (!token || token.length > 256) return json({ error: "Unauthorized scheduled invocation." }, 401);
    const { data: authorized, error: authError } = await admin.rpc("is_valid_price_check_secret", { p_candidate: token });
    if (authError || authorized !== true) return json({ error: "Unauthorized scheduled invocation." }, 401);
    if (!apiKey && !openRouterKey && !tavilyEnabled) {
      const retryAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
      await admin.from("items").update({
        next_offer_search_at: retryAt,
        enrichment_status: "failed",
        enrichment_error: "No research provider is configured. Add SERPAPI_KEY for Shopping results, or explicitly enable scheduled OpenRouter search in Supabase Edge Function secrets.",
      }).eq("status", "wanted").or(`next_offer_search_at.is.null,next_offer_search_at.lte.${new Date().toISOString()}`);
      return json({ error: "No research provider is configured. Add SERPAPI_KEY or explicitly enable scheduled OpenRouter search in Supabase Edge Function secrets." }, 503);
    }
    const startedAt = Date.now();
    let retailerSeedsInspected = 0;
    let retailerSeedsValidated = 0;

    const now = new Date();
    const { data: due, error } = await admin.from("items")
      .select("id,wishlist_id,title,brand,model_number,gtin,variant_label,condition,category,product_id,variant_id,currency,last_offer_search_at,next_offer_search_at,offer_search_attempts,target_price,priority,status")
      .eq("status", "wanted").or(`next_offer_search_at.is.null,next_offer_search_at.lte.${now.toISOString()}`)
      .order("next_offer_search_at", { ascending: true, nullsFirst: true })
      .order("target_price", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(24);
    if (error) throw error;
    const dueItemIds = (due || []).map((item) => item.id);
    if (dueItemIds.length) {
      const { error: statusError } = await admin.from("items")
        .update({ enrichment_status: "searching_offers", enrichment_error: null })
        .in("id", dueItemIds).eq("status", "wanted");
      if (statusError) console.error(JSON.stringify({ event: "research_status_update_failed", item_count: dueItemIds.length }));
    }
    const preferenceByWishlist = new Map<string, { currency: string | null; country: string | null; language: string | null }>();
    const wishlistIds = [...new Set((due || []).map((item) => item.wishlist_id))];
    if (wishlistIds.length) {
      const { data: wishlists } = await admin.from("wishlists").select("id,owner_id").in("id", wishlistIds);
      const ownerIds = [...new Set((wishlists || []).map((wishlist) => wishlist.owner_id))];
      let profiles: Array<{ id: string; currency: string; country: string; language: string }> = [];
      if (ownerIds.length) {
        const { data: rows } = await admin.from("profiles").select("id,currency,country,language").in("id", ownerIds);
        profiles = rows || [];
      }
      const preferencesByOwner = new Map(profiles.map((profile) => [profile.id, { currency: profile.currency, country: profile.country, language: profile.language }]));
      for (const wishlist of wishlists || []) {
        const preference = preferencesByOwner.get(wishlist.owner_id);
        if (preference) preferenceByWishlist.set(wishlist.id, preference);
      }
    }
    let searched = 0;
    let webSearches = 0;
    let tavilySearches = 0;
    let providerFailures = 0;
    let offersSaved = 0;
    let shoppingRowsReceived = 0;
    let shoppingCandidateEvaluations = 0;
    let shoppingCandidatesAccepted = 0;
    const shoppingCandidateRejections = {
      identity: 0,
      conflicting_identifier: 0,
      replacement_or_accessory: 0,
      capacity_unconfirmed: 0,
      capacity_mismatch: 0,
      color_unconfirmed: 0,
      color_mismatch: 0,
      gender_unconfirmed: 0,
      gender_mismatch: 0,
      size_unconfirmed: 0,
      size_mismatch: 0,
      invalid_price_or_url: 0,
      currency: 0,
    };
    const shoppingConditionComparisons = { exact: 0, alternative: 0, unconfirmed: 0 };
    let retailerPagesVerified = 0;
    let dailyBudgetReached = false;
    let skipped = 0;
    const groups = new Map<string, typeof due>();
    for (const item of due || []) {
      const model = String(item.model_number || "").trim();
      const preferences = preferenceByWishlist.get(item.wishlist_id);
      const signature = [item.product_id || `${String(item.brand || "").toLowerCase()}:${model.toLowerCase()}:${String(item.title).toLowerCase()}`, item.variant_id || String(item.variant_label || "").toLowerCase(), item.currency, preferences?.currency, preferences?.country].join("|");
      const list = groups.get(signature) || [];
      list.push(item);
      groups.set(signature, list);
    }

    // Bound provider use per schedule tick and share one query across identical tracked products.
    // One product identity per tick keeps the three-query fallback within the
    // scheduled request timeout. The frequent schedule drains the due queue.
    for (const items of [...groups.values()].slice(0, 1)) {
      const seed = items[0];
      const seedPreference = preferenceByWishlist.get(seed.wishlist_id);
      const targetCountry = String(seedPreference?.country || "").toUpperCase();
      const market = resolveSearchMarket(targetCountry, seed.currency, seedPreference?.language);
      const checkedAt = new Date().toISOString();
      const seedGtin = digits(seed.gtin);
      const queries = buildProductSearchQueries({
        gtin: seedGtin,
        brand: seed.brand,
        modelNumber: seed.model_number,
        title: seed.title,
        variant: seed.variant_label,
      });
      const shoppingRows: any[] = [];
      let failedSearches = 0;
      let searchBudgetReached = false;
      for (const query of apiKey ? [...new Set(queries)].slice(0, 3) : []) {
        const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(Deno.env.get("SERPAPI_DAILY_SEARCH_LIMIT") || "31", 10) || 31));
        const { data: reserved, error: budgetError } = await admin.rpc("reserve_provider_search", { p_provider: "serpapi", p_daily_limit: dailyLimit });
        if (budgetError) throw budgetError;
        if (reserved !== true) {
          searchBudgetReached = true;
          dailyBudgetReached = true;
          await recordProviderMetric(admin, { provider: "serpapi", surface: "scheduled", outcome: "budget_exhausted", marketCountry: targetCountry });
          break;
        }
        const search = new URL("https://serpapi.com/search.json");
        search.searchParams.set("engine", "google_shopping");
        search.searchParams.set("q", query);
        search.searchParams.set("gl", market.gl);
        search.searchParams.set("hl", market.hl);
        search.searchParams.set("api_key", apiKey!);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25_000);
        const searchStartedAt = Date.now();
        let statusCode: number | null = null;
        let resultCount = 0;
        let outcome: "success" | "error" = "error";
        let errorCode: ProviderErrorCode | null = null;
        let exactIdentifierFound = false;
        let response: Response;
        try { response = await fetch(search, { signal: controller.signal }); }
        catch {
          failedSearches++; providerFailures++; searched++;
          await recordProviderMetric(admin, {
            provider: "serpapi", surface: "scheduled", outcome, errorCode: "network_error", durationMs: Date.now() - searchStartedAt,
            unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: targetCountry,
          });
          continue;
        }
        finally { clearTimeout(timeout); }
        searched++;
        statusCode = response.status;
        if (!response.ok) {
          failedSearches++; providerFailures++;
          const responseBody = await response.text();
          errorCode = classifySerpApiFailure(response.status, responseBody);
          await recordProviderMetric(admin, {
            provider: "serpapi", surface: "scheduled", outcome, durationMs: Date.now() - searchStartedAt,
            statusCode, errorCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: targetCountry,
          });
          continue;
        }
        try {
          const payload = await response.json();
          const parsed = parseSerpApiShoppingResponse(payload);
          if (parsed.error) {
            failedSearches++;
            providerFailures++;
            errorCode = classifySerpApiFailure(response.status, JSON.stringify(payload));
          } else {
            const rows = parsed.rows as any[];
            resultCount = rows.length;
            outcome = "success";
            shoppingRows.push(...rows);
            exactIdentifierFound = Boolean(seedGtin && rows.some((row: any) => [row.gtin, row.upc, row.ean].map(digits).includes(seedGtin)));
          }
        } catch { failedSearches++; providerFailures++; errorCode = "invalid_response"; }
        await recordProviderMetric(admin, {
          provider: "serpapi", surface: "scheduled", outcome, durationMs: Date.now() - searchStartedAt,
          resultCount, statusCode, errorCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")),
          marketCountry: targetCountry,
        });
        if (exactIdentifierFound) break;
      }
      const hasStrongShoppingMatch = items.some((item) => shoppingRows.some((row: any) => {
        const title = String(row.title || "");
        const ids = [row.gtin, row.upc, row.ean].map(digits).filter(Boolean);
        const identity = digits(item.gtin);
        const gtinMatch = Boolean(identity && ids.includes(identity));
        if (identity && ids.length && !gtinMatch) return false;
        const model = String(item.model_number || "").trim();
        const modelMatch = Boolean(model && new RegExp(`(^|\\W)${escapeRegex(model)}($|\\W)`, "i").test(title));
        if (!gtinMatch && !(modelMatch && (!item.brand || title.toLowerCase().includes(String(item.brand).toLowerCase())))) return false;
        if (/\b(replacement|compatible|case for|cover for)\b/i.test(title)) return false;
        if (compareProductConditions(item.condition, providerCondition(row.condition, title)) !== "exact") return false;
        const target = `${item.title} ${item.variant_label || ""}`;
        if (capacity(target) && capacity(title) !== capacity(target)) return false;
        const targetColor = findProductVariantColor(target, item.brand);
        if (targetColor && findProductVariantColor(title, item.brand) !== targetColor) return false;
        const targetGender = getGenderVariant(target);
        const foundGender = getGenderVariant(title);
        if (!confirmsGenderVariant(targetGender, foundGender)) return false;
        const targetSize = sizeVariant(item.variant_label);
        if (targetSize) {
          const rowSize = String(row.size || row.extensions?.find?.((value: unknown) => typeof value === "string" && /\b(?:size|shoe\s+size|EU|UK|US|CM|MM)\b/i.test(value)) || "");
          const foundSize = sizeVariant(rowSize) || sizeVariant(title);
          if (!foundSize || targetSize.label !== foundSize.label || (targetSize.system && foundSize.system && targetSize.system !== foundSize.system)) return false;
        }
        return true;
      }));

      let citations: ReturnType<typeof extractRetailerCitations> = [];
      let citationProvider: "openrouter_web_search" | "tavily_web_search" = "openrouter_web_search";
      let citationQueryHash: string | null = null;
      let webSearchError: string | null = null;
      if (!hasStrongShoppingMatch && openRouterKey && Deno.env.get("OPENROUTER_ALLOW_SCHEDULED_SEARCH") === "true") {
        const openRouterLimit = Deno.env.get("OPENROUTER_DAILY_REQUEST_LIMIT") || Deno.env.get("OPENROUTER_DAILY_SEARCH_LIMIT") || "8";
        const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(openRouterLimit, 10) || 8));
        const { data: reserved, error: budgetError } = await admin.rpc("reserve_provider_search", { p_provider: "openrouter", p_daily_limit: dailyLimit });
        if (budgetError) throw budgetError;
        if (reserved !== true) {
          searchBudgetReached = true;
          dailyBudgetReached = true;
          webSearchError = "Wishly reached its configured daily web-search budget. Research will retry tomorrow.";
          await recordProviderMetric(admin, { provider: "openrouter", surface: "scheduled", outcome: "budget_exhausted", marketCountry: targetCountry });
        } else {
        webSearches++;
        const webSearchStartedAt = Date.now();
        let webStatusCode: number | null = null;
        let webResultCount = 0;
        let webSearchCount: number | null = null;
        let webOutcome: "success" | "error" = "error";
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);
        try {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              model: Deno.env.get("OPENROUTER_MODEL") || "openai/gpt-4o-mini",
              tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", max_results: 6, max_total_results: 8, max_uses: 2, search_context_size: "low" } }],
              max_tool_calls: 2,
              messages: [
                { role: "system", content: "Search for direct retailer pages for the exact product below. Use web search. Do not invent prices, currency, availability, condition, shipping, or variants. Return source citations; the application will validate visible product identifiers and price text." },
                { role: "user", content: `Find direct retailer listings for this exact product and requested variant: ${JSON.stringify({ brand: seed.brand, model: seed.model_number, gtin: seed.gtin, title: seed.title, variant: seed.variant_label }).slice(0, 1000)}.` },
              ],
            }),
          });
          webStatusCode = response.status;
          if (!response.ok) {
            failedSearches++;
            providerFailures++;
            webSearchError = response.status === 401 ? "OpenRouter rejected its API key; check OPENROUTER_API_KEY." : response.status === 402 ? "OpenRouter has insufficient credits for web search." : "OpenRouter web search is temporarily unavailable.";
          } else {
            const result = await response.json();
            webSearchCount = parseOpenRouterWebSearchCount(result.usage?.server_tool_use);
            citations = extractRetailerCitations(result.choices?.[0]?.message?.annotations);
            webResultCount = citations.length;
            webOutcome = "success";
          }
        } catch {
          failedSearches++;
          providerFailures++;
          webSearchError = "OpenRouter web search could not be reached.";
        } finally {
          clearTimeout(timeout);
          await recordProviderMetric(admin, {
            provider: "openrouter", surface: "scheduled", outcome: webOutcome, durationMs: Date.now() - webSearchStartedAt,
            resultCount: webResultCount, searchCount: webSearchCount, statusCode: webStatusCode,
            unitCostUsd: parseEstimatedUnitCost(Deno.env.get("OPENROUTER_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: targetCountry,
          });
        }
        }
      }

      // Tavily is the paid-search fallback when Shopping and optional OpenRouter
      // discovery do not produce retailer citations. It is disabled unless both
      // a server-side key and explicit project opt-in are present.
      if (!hasStrongShoppingMatch && citations.length === 0 && tavilyEnabled) {
        const tavilyQuery = buildRetailerQueries({
          title: seed.title, brand: seed.brand, model: seed.model_number,
          gtin: seed.gtin, variant: seed.variant_label, category: seed.category,
          country: targetCountry, language: seedPreference?.language,
        })[0];
        if (tavilyQuery) {
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tavilyQuery.toLowerCase().replace(/\s+/g, " ").trim()));
          const queryHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
          citationQueryHash = queryHash;
          const checkedAt = new Date().toISOString();
          const { data: cached } = await admin.from("retailer_search_cache").select("results")
            .eq("query_hash", queryHash).eq("provider", "tavily").gt("expires_at", checkedAt).maybeSingle();
          if (Array.isArray(cached?.results)) {
            const parsed = parseTavilyResponse({ results: cached.results });
            citations = extractRetailerCitations(parsed.results.map((result) => ({
              type: "url_citation", url_citation: { url: result.url, title: result.title, content: result.content },
            })));
            citationProvider = "tavily_web_search";
          } else {
            const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(Deno.env.get("TAVILY_DAILY_SEARCH_LIMIT") || "4", 10) || 4));
            const { data: reserved, error: budgetError } = await admin.rpc("reserve_provider_search", { p_provider: "tavily", p_daily_limit: dailyLimit });
            if (budgetError) throw budgetError;
            if (reserved !== true) {
              searchBudgetReached = true;
              dailyBudgetReached = true;
              webSearchError = "Wishly reached its configured daily Tavily search budget. Research will retry tomorrow.";
              await recordProviderMetric(admin, { provider: "tavily", surface: "scheduled", outcome: "budget_exhausted", marketCountry: targetCountry });
            } else {
              tavilySearches++;
              let outcome: "success" | "error" = "error";
              let statusCode: number | null = null;
              let resultCount = 0;
              const searchStartedAt = Date.now();
              try {
                const result = await searchTavily(tavilyKey!, tavilyQuery);
                statusCode = result.response.status;
                if (!result.response.ok) {
                  failedSearches++;
                  providerFailures++;
                  webSearchError = result.response.status === 401 ? "Tavily rejected its API key; check TAVILY_API_KEY." : result.response.status === 429 ? "Tavily rate limit reached." : "Tavily web search is temporarily unavailable.";
                } else {
                  const retailerResults = result.data.results.filter((entry) => {
                    try { return ["http:", "https:"].includes(new URL(entry.url).protocol); } catch { return false; }
                  });
                  resultCount = retailerResults.length;
                  citations = extractRetailerCitations(retailerResults.map((entry) => ({
                    type: "url_citation", url_citation: { url: entry.url, title: entry.title, content: entry.content },
                  })));
                  citationProvider = "tavily_web_search";
                  outcome = "success";
                  await admin.from("retailer_search_cache").upsert({
                    query_hash: queryHash, provider: "tavily", results: retailerResults,
                    expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
                  }, { onConflict: "query_hash" });
                }
              } catch {
                failedSearches++;
                providerFailures++;
                webSearchError = "Tavily web search could not be reached.";
              } finally {
                await recordProviderMetric(admin, {
                  provider: "tavily", surface: "scheduled", outcome, durationMs: Date.now() - searchStartedAt,
                  resultCount, searchCount: 1, statusCode,
                  unitCostUsd: parseEstimatedUnitCost(Deno.env.get("TAVILY_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: targetCountry,
                });
              }
            }
          }
        }
      }

      if (shoppingRows.length === 0 && citations.length === 0 && failedSearches > 0) {
        for (const item of items) {
          const attempts = Number(item.offer_search_attempts || 0) + 1;
          const retryDelayMs = getResearchRetryDelayMs(attempts);
          await admin.from("items").update({
            last_offer_search_at: checkedAt,
            next_offer_search_at: new Date(Date.now() + retryDelayMs).toISOString(),
            offer_search_attempts: attempts,
            enrichment_status: "failed",
            enrichment_error: "Configured product search sources were temporarily unavailable; saved offers were retained and research will retry.",
          }).eq("id", item.id);
        }
        continue;
      }
      shoppingRowsReceived += shoppingRows.length;
      for (const item of items) {
        const identity = digits(item.gtin);
        const model = String(item.model_number || "").trim();
        const title = `${item.title} ${item.variant_label || ""}`.trim();
        const targetCapacity = capacity(title);
        const targetColor = findProductVariantColor(title, item.brand);
        const targetSize = sizeVariant(item.variant_label);
        const targetGender = getGenderVariant(title);
        const matches = [...new Map(shoppingRows.flatMap((row: any) => {
          shoppingCandidateEvaluations++;
          const reject = (reason: keyof typeof shoppingCandidateRejections) => {
            shoppingCandidateRejections[reason]++;
            return [];
          };
          const candidateTitle = String(row.title || "");
          const candidateColor = findProductVariantColor(candidateTitle, item.brand);
          const candidateLower = candidateTitle.toLowerCase();
          const candidateIds = [row.gtin, row.upc, row.ean].map(digits).filter(Boolean);
          const gtinMatch = Boolean(identity && candidateIds.includes(identity));
          const modelMatch = Boolean(model && new RegExp(`(^|\\W)${escapeRegex(model)}($|\\W)`, "i").test(candidateTitle));
          const titleCoverage = getTitleCoverage(item.title, candidateTitle);
          const titleMatch = titleCoverage >= 0.75 && (!item.brand || candidateLower.includes(String(item.brand).toLowerCase()));
          if (identity && candidateIds.length && !gtinMatch) return reject("conflicting_identifier");
          if (!gtinMatch && !(modelMatch && (!item.brand || candidateLower.includes(String(item.brand).toLowerCase()))) && !titleMatch) return reject("identity");
          if (/\b(replacement|compatible|case for|cover for)\b/i.test(candidateTitle)) return reject("replacement_or_accessory");
          const candidateCapacity = capacity(candidateTitle);
          if (targetCapacity && !candidateCapacity) return reject("capacity_unconfirmed");
          if (targetCapacity && candidateCapacity !== targetCapacity) return reject("capacity_mismatch");
          if (targetColor && !candidateColor) return reject("color_unconfirmed");
          if (targetColor && candidateColor !== targetColor) return reject("color_mismatch");
          const rowSizeText = String(row.size || row.extensions?.find?.((value: unknown) => typeof value === "string" && /\b(?:size|shoe\s+size|EU|UK|US|CM|MM)\b/i.test(value)) || "");
          const candidateSize = sizeVariant(rowSizeText) || sizeVariant(candidateTitle);
          const candidateGender = getGenderVariant(candidateTitle);
          if (!confirmsGenderVariant(targetGender, candidateGender)) return reject(candidateGender ? "gender_mismatch" : "gender_unconfirmed");
          if (targetSize && !candidateSize) return reject("size_unconfirmed");
          if (targetSize && (targetSize.label !== candidateSize!.label || (targetSize.system && candidateSize!.system && targetSize.system !== candidateSize!.system))) return reject("size_mismatch");
          const candidateCondition = providerCondition(row.condition, candidateTitle);
          const conditionMatch = compareProductConditions(item.condition, candidateCondition);
          const price = Number(row.extracted_price);
          const oldPriceRaw = row.extracted_old_price ?? (typeof row.old_price === "number" ? row.old_price : null);
          const oldPriceText = String(oldPriceRaw ?? "").replace(/[^\d.,-]/g, "");
          const oldPriceNormalized = oldPriceText.includes(".") && oldPriceText.includes(",")
            ? (oldPriceText.lastIndexOf(",") > oldPriceText.lastIndexOf(".") ? oldPriceText.replace(/\./g, "").replace(",", ".") : oldPriceText.replace(/,/g, ""))
            : oldPriceText.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
          const originalPrice = Number(oldPriceNormalized);
          const offerUrl = typeof row.link === "string" ? row.link : "";
          if (!Number.isFinite(price) || price <= 0 || !/^https?:\/\//i.test(offerUrl)) return reject("invalid_price_or_url");
          const rowPrice = String(row.price || "");
          const currency = resolveProviderCurrency(rowPrice, market.currency);
          if (!currency) return reject("currency");
          const delivery = parseShippingEstimate(row.delivery, currency);
          const taxesKnown = false;
          const taxes = 0;
          const totalPrice = calculateTotalPurchaseCost({ price, shippingCost: delivery.amount, taxes, shippingKnown: delivery.known, taxesKnown });
          const condition = candidateCondition;
          shoppingConditionComparisons[conditionMatch]++;
          const identityConfidence = gtinMatch ? 1 : modelMatch ? 0.9 : Math.min(0.84, 0.62 + titleCoverage * 0.22);
          const conditionConfidence = conditionMatch === "alternative" ? Math.min(0.72, identityConfidence) : conditionMatch === "unconfirmed" ? Math.min(0.84, identityConfidence) : identityConfidence;
          const sizeInfo = candidateSize;
          return [{
            item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
            store: String(row.source || "Retailer").slice(0, 120), seller: String(row.source || "Retailer").slice(0, 120),
            listing_title: candidateTitle, image_url: typeof row.thumbnail === "string" ? row.thumbnail : null,
            size_label: sizeInfo?.label || null, size_system: sizeInfo?.system || null,
            color_label: candidateColor,
            product_match_confidence: conditionConfidence,
            match_type: conditionMatch === "alternative" ? `condition_alternative_${condition}` : conditionMatch === "unconfirmed" ? "condition_unconfirmed" : gtinMatch ? "gtin" : modelMatch ? "brand_model_variant" : "title_similarity_possible",
            price, currency, url: offerUrl, shipping_cost: delivery.amount, taxes, total_price: totalPrice,
            delivery_estimate: delivery.evidence,
            original_price: Number.isFinite(originalPrice) && originalPrice > price ? originalPrice : null,
            discount_percent: Number.isFinite(originalPrice) && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : null,
            shipping_known: delivery.known, taxes_known: taxesKnown, total_is_estimated: totalPrice == null,
            condition, availability: "unknown", source: "google_shopping", last_verified_at: checkedAt,
          }];
        }).map((offer: any) => [`${offer.source}:${offer.url}`, offer])).values()].sort((a: any, b: any) => b.product_match_confidence - a.product_match_confidence).slice(0, 8);
        shoppingCandidatesAccepted += matches.length;

        const webMatches = citations.flatMap((citation) => {
          const evidence = `${citation.title} ${citation.content}`;
          const lowerEvidence = evidence.toLowerCase();
          const targetGtin = digits(item.gtin);
          const gtinMatch = Boolean(targetGtin && digits(evidence).includes(targetGtin));
          if (targetGtin && /\b\d{8,14}\b/.test(evidence) && !gtinMatch) return [];
          const modelMatch = Boolean(model && new RegExp(`(^|\\W)${escapeRegex(model)}($|\\W)`, "i").test(evidence));
          const brandMatch = !item.brand || lowerEvidence.includes(String(item.brand).toLowerCase());
          const titleCoverage = getTitleCoverage(item.title, citation.title);
          if (!brandMatch || (!gtinMatch && !modelMatch && titleCoverage < 0.75)) return [];
          const candidateCapacity = capacity(evidence);
          const candidateColor = findProductVariantColor(evidence, item.brand);
          if (targetCapacity && candidateCapacity && targetCapacity !== candidateCapacity) return [];
          if (targetColor && candidateColor && targetColor !== candidateColor) return [];
          const candidateGender = getGenderVariant(evidence);
          if (!confirmsGenderVariant(targetGender, candidateGender)) return [];
          const candidateSize = sizeVariant(evidence);
          if (targetSize && candidateSize && (targetSize.label !== candidateSize.label || (targetSize.system && candidateSize.system && targetSize.system !== candidateSize.system))) return [];
          const parsedPrice = parseWebSnippetPrice(evidence, market.currency);
          if (!parsedPrice) return [];
          const store = new URL(citation.url).hostname.replace(/^www\./, "");
          const variantComplete = (!targetCapacity || targetCapacity === candidateCapacity)
            && (!targetColor || targetColor === candidateColor)
            && (!targetGender || targetGender === candidateGender)
            && (!targetSize || Boolean(candidateSize));
          const baseConfidence = gtinMatch || modelMatch
            ? variantComplete ? 0.88 : 0.76
            : Math.min(0.84, 0.62 + titleCoverage * 0.22);
          const conditionMatch = compareProductConditions(item.condition, evidence);
          const confidence = conditionMatch === "alternative" ? Math.min(0.72, baseConfidence) : Math.min(conditionMatch === "unconfirmed" ? 0.84 : 1, baseConfidence);
          const candidateCondition = normalizeProductCondition(evidence);
          return [{
            item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
            store: store.slice(0, 120), seller: store.slice(0, 120),
            listing_title: (citation.title || store).slice(0, 300), image_url: null,
            size_label: candidateSize?.label || null, size_system: candidateSize?.system || null,
            color_label: candidateColor,
            product_match_confidence: confidence,
            match_type: gtinMatch || modelMatch ? "web_citation_possible_match" : "web_citation_title_possible_match",
            price: parsedPrice.amount, currency: parsedPrice.currency, url: citation.url,
            original_price: null, discount_percent: null, shipping_cost: 0, taxes: 0, total_price: null,
            shipping_known: false, taxes_known: false, total_is_estimated: true,
            condition: candidateCondition, availability: "unknown", source: citationProvider, last_verified_at: checkedAt,
          }];
        });
        const allMatches = [...new Map([...matches, ...webMatches].map((offer: any) => [`${offer.source}:${offer.url}`, offer])).values()].sort((a: any, b: any) => b.product_match_confidence - a.product_match_confidence).slice(0, 8);

        const verifiedRows: any[] = [];
        const verifyTransport = {
          connect: async (address: string, port: number) => await Deno.connect({ hostname: address, port }),
          startTls: async (socket: unknown, hostname: string) => await Deno.startTls(socket as Deno.TcpConn, { hostname }),
        };
        const queryDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode([...new Set(queries)].join("|").toLowerCase().replace(/\s+/g, " ").trim()));
        const queryHash = Array.from(new Uint8Array(queryDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const discoveryQueryHash = citationQueryHash || queryHash;
        const preference = preferenceByWishlist.get(item.wishlist_id);
        for (const candidate of allMatches.slice(0, 2)) {
          try {
            const domain = getRetailerDomain(candidate.url);
            if (!domain) continue;
            const countryCode = inferRetailerCountry(domain);
            const { data: foundRetailers } = await admin.from("retailers")
              .select("id,name,seller_type,is_supported,validation_status,reliability_score,last_successful_at")
              .eq("canonical_domain", domain).eq("country_code", countryCode).limit(1);
            let retailer = foundRetailers?.[0] || null;
            if (!retailer) {
              const { data: created, error: createError } = await admin.from("retailers").insert({
                name: candidate.store || domain, domain, canonical_domain: domain, country_code: countryCode,
                validation_status: "pending_inspection", seller_type: classifySeller(domain),
                categories: [item.category || "fashion"], languages: preference?.language ? [preference.language] : [],
                discovery_source: candidate.source === "tavily_web_search" ? "tavily" : candidate.source === "openrouter_web_search" ? "openrouter" : "serpapi",
                discovered_by_query: discoveryQueryHash, is_supported: false,
              }).select("id,name,seller_type,is_supported,validation_status,reliability_score,last_successful_at").maybeSingle();
              retailer = created || null;
              if (!retailer && createError?.code === "23505") {
                const { data: raced } = await admin.from("retailers")
                  .select("id,name,seller_type,is_supported,validation_status,reliability_score,last_successful_at")
                  .eq("canonical_domain", domain).eq("country_code", countryCode).limit(1).maybeSingle();
                retailer = raced || null;
              }
            }
            const sourceProvider = candidate.source === "tavily_web_search" ? "tavily" : candidate.source === "openrouter_web_search" ? "openrouter" : "serpapi";
            await admin.from("retailer_discovery_events").insert({
              retailer_id: retailer?.id || null, canonical_domain: domain, product_id: item.product_id || null,
              source_provider: sourceProvider, source_query: discoveryQueryHash, source_url: candidate.url,
              outcome: "discovered", evidence: { result_title: candidate.listing_title, source: candidate.source, match_confidence: candidate.product_match_confidence },
            });
            const attempt = await inspectAndVerifyRetailerProductPage(candidate.url, {
              itemId: seed.id,
              productId: seed.product_id,
              variantId: seed.variant_id,
              title: seed.title,
              brand: seed.brand,
              modelNumber: seed.model_number,
              gtin: seed.gtin,
              variantLabel: seed.variant_label,
              condition: seed.condition,
              currency: seed.currency,
            }, (hostname, type) => Deno.resolveDns(hostname, type), verifyTransport);
            if (attempt.offer) {
              verifiedRows.push(attempt.offer);
              retailerPagesVerified++;
            } else {
              const errorCode = attempt.errorCode || "product_identity_not_confirmed";
              const restricted = errorCode === "robots_restricted";
              const unavailable = errorCode.startsWith("http_") || ["fetch_failed", "response_truncated"].includes(errorCode);
              if (retailer?.id) await admin.from("retailers").update({
                validation_status: retailer.validation_status === "validated" ? "validated" : restricted ? "restricted" : unavailable ? "temporarily_unavailable" : "discovered",
                last_inspected_at: checkedAt, last_error: errorCode,
                retry_after: new Date(Date.now() + (restricted ? 7 : unavailable ? 1 : 0.25) * 24 * 60 * 60 * 1000).toISOString(),
                reliability_score: Math.max(0, Number(retailer.reliability_score ?? 0.5) - (restricted ? 0.05 : unavailable ? 0.02 : 0)),
              }).eq("id", retailer.id);
            }
            const errorCode = attempt.errorCode;
            const outcome = attempt.offer ? "inspection_succeeded" : errorCode === "robots_restricted" ? "restricted" : "inspection_failed";
            await admin.from("retailer_discovery_events").insert({
              retailer_id: retailer?.id || null, canonical_domain: domain, product_id: item.product_id || null,
              source_provider: sourceProvider, source_query: discoveryQueryHash, source_url: attempt.finalUrl,
              outcome, error_code: errorCode,
              evidence: { ...attempt.evidence, status: attempt.status, ...(attempt.offer ? { match_type: attempt.offer.match_type, match_confidence: attempt.offer.product_match_confidence } : {}) },
            });
          } catch (error) {
            const details = error && typeof error === "object" ? error as { name?: unknown } : {};
            console.error(JSON.stringify({
              event: "wishly_retailer_page_verification_failed",
              item_id: seed.id,
              error_name: typeof details.name === "string" ? details.name.slice(0, 40) : "unknown_error",
            }));
          }
        }
        if (verifiedRows.length) {
          for (const verified of verifiedRows) {
            const domain = getRetailerDomain(verified.url);
            if (!domain) continue;
            const countryCode = inferRetailerCountry(domain);
            const { data: retailerRows } = await admin.from("retailers")
              .select("id,name,seller_type,is_supported,reliability_score,categories,languages,extraction_capabilities,trust_evidence")
              .eq("canonical_domain", domain).eq("country_code", countryCode).limit(1);
            let retailer = retailerRows?.[0] || null;
            const sellerType = classifySeller(domain);
            const observedAt = verified.last_verified_at || checkedAt;
            if (retailer) {
              const { data: updatedRetailer } = await admin.from("retailers").update({
                validation_status: "validated", is_supported: true, last_inspected_at: observedAt,
                last_successful_at: observedAt, last_error: null,
                retry_after: new Date(Date.parse(observedAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
                seller_type: retailer.seller_type === "unknown" ? sellerType : retailer.seller_type,
                categories: [...new Set([...(retailer.categories || []), item.category || "fashion"])],
                languages: [...new Set([...(retailer.languages || []), ...(preference?.language ? [preference.language] : [])])],
                reliability_score: Math.min(1, Number(retailer.reliability_score ?? 0.5) + 0.02),
                extraction_capabilities: { ...(retailer.extraction_capabilities || {}), title: true, image: Boolean(verified.image_url), price: true, currency: true },
                trust_evidence: retailer.trust_evidence || "Public product page confirmed product identity, a current price, and currency; this does not establish seller authorization or authenticity.",
              }).eq("id", retailer.id).select("id,name,seller_type").maybeSingle();
              retailer = updatedRetailer || retailer;
            } else {
              const { data: createdRetailer, error: createError } = await admin.from("retailers").insert({
                name: verified.store || domain, domain, canonical_domain: domain, country_code: countryCode,
                validation_status: "validated", seller_type: sellerType, categories: [item.category || "fashion"],
                languages: preference?.language ? [preference.language] : [], discovery_source: "serpapi",
                discovered_by_query: discoveryQueryHash, trust_evidence: "Public product page confirmed product identity, a current price, and currency; this does not establish seller authorization or authenticity.",
                extraction_capabilities: { title: true, image: Boolean(verified.image_url), price: true, currency: true },
                first_discovered_at: observedAt, last_inspected_at: observedAt, last_successful_at: observedAt,
                reliability_score: 0.75, is_supported: true,
                retry_after: new Date(Date.parse(observedAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
              }).select("id,name,seller_type").maybeSingle();
              retailer = createdRetailer || null;
              if (!retailer && createError?.code === "23505") {
                const { data: racedRetailer } = await admin.from("retailers")
                  .select("id,name,seller_type,is_supported,reliability_score,categories,languages,extraction_capabilities,trust_evidence")
                  .eq("canonical_domain", domain).eq("country_code", countryCode).limit(1).maybeSingle();
                retailer = racedRetailer || null;
                if (retailer) await admin.from("retailers").update({
                  validation_status: "validated", is_supported: true, last_inspected_at: observedAt, last_successful_at: observedAt,
                  last_error: null, retry_after: new Date(Date.parse(observedAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  categories: [...new Set([...(retailer.categories || []), item.category || "fashion"])],
                  languages: [...new Set([...(retailer.languages || []), ...(preference?.language ? [preference.language] : [])])],
                  reliability_score: Math.min(1, Number(retailer.reliability_score ?? 0.5) + 0.02),
                  extraction_capabilities: { ...(retailer.extraction_capabilities || {}), title: true, image: Boolean(verified.image_url), price: true, currency: true },
                  trust_evidence: retailer.trust_evidence || "Public product page confirmed product identity, a current price, and currency; this does not establish seller authorization or authenticity.",
                }).eq("id", retailer.id);
              }
            }
          }
        }
        const persistenceMatches = [...new Map([...allMatches, ...verifiedRows].map((offer: any) => [`${offer.source}:${offer.url}`, offer])).values()]
          .sort((a: any, b: any) => Number(b.is_verified === true) - Number(a.is_verified === true) || b.product_match_confidence - a.product_match_confidence)
          .slice(0, 8);

        if (persistenceMatches.length) {
          const preference = preferenceByWishlist.get(item.wishlist_id);
          const convertedMatches = await addOfferCurrencyConversions(
            persistenceMatches.map((offer) => ({ ...offer, destination_country: preference?.country || null })),
            String(preference?.currency || item.currency || "USD"),
          );
          const { data: saved, error: saveError } = await admin.from("store_offers").upsert(convertedMatches, { onConflict: "item_id,source,url" }).select("id,store,price,currency,source,url,availability,last_verified_at,is_verified");
          if (saveError) {
            await deferPersistenceRetry(admin, item, checkedAt, "offer_upsert");
            continue;
          }
          offersSaved += saved?.length || 0;
          // The database recorder deduplicates unchanged prices per UTC day,
          // while still preserving observations on later monitoring days.
          if (saved?.length) {
            const observations = await recordOfferPriceObservations(admin, item.id, saved, checkedAt);
            if (observations.failed) {
              await deferPersistenceRetry(admin, item, checkedAt, "price_history");
              continue;
            }
          }
        }
        const hasExactMatch = verifiedRows.length > 0;
        const status = hasExactMatch ? (failedSearches ? "partial" : "offers_available") : allMatches.length ? "partial" : failedSearches ? "failed" : "no_matches";
        const searchError = failedSearches
          ? webSearchError || "Some configured product searches failed; these results may be incomplete."
          : allMatches.length && !hasExactMatch
            ? "Found retailer-search candidates, but no product page has confirmed the current price and exact variant yet."
            : null;
        const attempts = failedSearches ? Number(item.offer_search_attempts || 0) + 1 : 0;
        const retryDelayMs = searchBudgetReached ? 24 * 60 * 60 * 1000 : failedSearches ? getResearchRetryDelayMs(attempts) : item.target_price != null ? 2 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
        await admin.from("items").update({
          offers_last_checked_at: checkedAt, last_offer_search_at: checkedAt,
          next_offer_search_at: new Date(Date.now() + retryDelayMs).toISOString(),
          offer_search_attempts: attempts, enrichment_status: searchBudgetReached && !allMatches.length ? "failed" : status,
          enrichment_error: searchBudgetReached ? webSearchError || "Wishly reached its configured daily provider search budget. Research will retry tomorrow." : searchError,
        }).eq("id", item.id);
        if (item.product_id) await admin.from("products").update({ offers_last_checked_at: checkedAt, offer_search_status: status }).eq("id", item.product_id);
      }
    }
    const retailerNow = new Date().toISOString();
    const { data: retailerQueue, error: retailerQueueError } = await admin.from("retailers")
      .select("id,name,canonical_domain,country_code,discovery_source,validation_status,reliability_score,trust_evidence,extraction_capabilities")
      .in("validation_status", ["discovered", "pending_inspection", "temporarily_unavailable"])
      .or(`retry_after.is.null,retry_after.lte.${retailerNow}`)
      .order("last_inspected_at", { ascending: true, nullsFirst: true })
      .order("first_discovered_at", { ascending: true })
      .limit(1);
    if (retailerQueueError) {
      console.error(JSON.stringify({ event: "retailer_catalog_queue_failed" }));
    } else {
      const retailer = retailerQueue?.[0];
      const domain = retailer?.canonical_domain || retailer?.domain;
      if (retailer && typeof domain === "string") {
        const inspectionStartedAt = new Date().toISOString();
        const retryLease = new Date(Date.now() + 20 * 60 * 1000).toISOString();
        await admin.from("retailers").update({ validation_status: "pending_inspection", retry_after: retryLease })
          .eq("id", retailer.id);
        const inspection = await inspectRetailerCatalog(domain, retailerDns, retailerTransport);
        const inspectedAt = new Date().toISOString();
        const retryHours = inspection.status === "validated" ? 30 * 24
          : inspection.status === "restricted" ? 30 * 24
            : inspection.status === "temporarily_unavailable" ? 24
              : inspection.status === "rejected" ? 90 * 24 : 7 * 24;
        const reliability = Math.max(0, Math.min(1, Number(retailer.reliability_score ?? 0.5)
          + (inspection.status === "validated" ? 0.02 : inspection.status === "restricted" || inspection.status === "temporarily_unavailable" ? -0.02 : 0)));
        const extractionCapabilities = {
          ...(retailer.extraction_capabilities || {}),
          product_page: Boolean(retailer.extraction_capabilities?.product_page || inspection.status === "validated"),
          title: Boolean(retailer.extraction_capabilities?.title || inspection.evidence.title),
          price: Boolean(retailer.extraction_capabilities?.price || inspection.evidence.hasPrice),
          currency: Boolean(retailer.extraction_capabilities?.currency || inspection.evidence.currency),
          image: Boolean(retailer.extraction_capabilities?.image || inspection.evidence.hasImage),
        };
        const evidenceText = inspection.status === "validated"
          ? `A public product page exposed a title, price, currency, and image on ${domain}. This does not establish seller authorization or product authenticity.`
          : retailer.trust_evidence || null;
        const detectedSellerType = retailer.seller_type === "unknown" ? classifySeller(domain) : retailer.seller_type;
        const update = await admin.from("retailers").update({
          validation_status: inspection.status,
          ...(detectedSellerType !== "unknown" ? { seller_type: detectedSellerType } : {}),
          last_inspected_at: inspectedAt,
          ...(inspection.status === "validated" ? { last_successful_at: inspectedAt } : {}),
          last_error: inspection.errorCode,
          retry_after: new Date(Date.now() + retryHours * 60 * 60 * 1000).toISOString(),
          reliability_score: reliability,
          extraction_capabilities: extractionCapabilities,
          trust_evidence: evidenceText,
        }).eq("id", retailer.id);
        if (update.error) console.error(JSON.stringify({ event: "retailer_catalog_status_write_failed", retailer_id: retailer.id }));
        else {
          retailerSeedsInspected++;
          if (inspection.status === "validated") retailerSeedsValidated++;
        }
        const allowedSource = new Set(["tavily", "serpapi", "openrouter", "seed", "url_import"]);
        const sourceProvider = allowedSource.has(retailer.discovery_source) ? retailer.discovery_source : "seed";
        const outcome = inspection.status === "validated" ? "inspection_succeeded"
          : inspection.status === "restricted" ? "restricted"
            : inspection.status === "rejected" ? "rejected" : "inspection_failed";
        const eventWrite = await admin.from("retailer_discovery_events").insert({
          retailer_id: retailer.id,
          canonical_domain: domain,
          source_provider: sourceProvider,
          source_url: inspection.pageUrl || `https://${domain}`,
          outcome,
          error_code: inspection.errorCode,
          evidence: {
            inspection_type: "bounded_sitemap_product_probe",
            retailer_status: inspection.status,
            http_status: inspection.httpStatus,
            inspected_at: inspectionStartedAt,
            ...inspection.evidence,
          },
        });
        if (eventWrite.error) console.error(JSON.stringify({ event: "retailer_catalog_event_write_failed", retailer_id: retailer.id }));
      }
    }

    const durationMs = Date.now() - startedAt;
    console.info(JSON.stringify({ event: "wishly_scheduled_research", providers: [apiKey ? "serpapi_google_shopping" : null, openRouterKey ? "openrouter_web_search" : null, tavilyEnabled ? "tavily_web_search" : null].filter(Boolean), provider_searches: searched + webSearches + tavilySearches, shopping_searches: searched, shopping_rows_received: shoppingRowsReceived, shopping_candidate_evaluations: shoppingCandidateEvaluations, shopping_candidates_accepted: shoppingCandidatesAccepted, shopping_candidate_rejections: shoppingCandidateRejections, shopping_condition_comparisons: shoppingConditionComparisons, web_searches: webSearches + tavilySearches, retailer_pages_verified: retailerPagesVerified, retailer_seeds_inspected: retailerSeedsInspected, retailer_seeds_validated: retailerSeedsValidated, provider_failures: providerFailures, daily_budget_reached: dailyBudgetReached, offers_saved: offersSaved, due_items: due?.length || 0, skipped_without_identity: skipped, duration_ms: durationMs }));
    return json({ success: true, due_items: due?.length || 0, provider_searches: searched + webSearches + tavilySearches, shopping_searches: searched, shopping_rows_received: shoppingRowsReceived, shopping_candidate_evaluations: shoppingCandidateEvaluations, shopping_candidates_accepted: shoppingCandidatesAccepted, shopping_candidate_rejections: shoppingCandidateRejections, shopping_condition_comparisons: shoppingConditionComparisons, web_searches: webSearches + tavilySearches, retailer_pages_verified: retailerPagesVerified, retailer_seeds_inspected: retailerSeedsInspected, retailer_seeds_validated: retailerSeedsValidated, provider_failures: providerFailures, daily_budget_reached: dailyBudgetReached, offers_saved: offersSaved, skipped_without_identity: skipped, duration_ms: durationMs });
  } catch {
    return json({ error: "Scheduled offer refresh failed; existing offer records were retained." }, 500);
  }
});
