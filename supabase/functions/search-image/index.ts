import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseEstimatedUnitCost, recordProviderMetric } from "../_shared/provider-metrics.ts";
import { resolveSearchMarket } from "../_shared/search-market.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const validImage = (bytes: Uint8Array) =>
  (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
  (bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG") ||
  (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const key = Deno.env.get("SERPAPI_KEY");
    if (!key) return json({ configured: false, candidates: [] });
    const authorization = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey) return json({ error: "Authentication required." }, 401);
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return json({ error: "Authentication required." }, 401);
    const { data: preferences, error: preferencesError } = await client.from("profiles").select("country,currency,language").eq("id", auth.user.id).maybeSingle();
    if (preferencesError) return json({ error: "Your search preferences could not be loaded." }, 503);
    const market = resolveSearchMarket(preferences?.country, preferences?.currency, preferences?.language);
    const { data: userRequestReserved, error: userRequestError } = await client.rpc("reserve_interactive_provider_request", { p_surface: "image_search" });
    if (userRequestError) return json({ error: "Image-search limits are temporarily unavailable. Try again shortly." }, 503);
    if (userRequestReserved !== true) return json({ error: "Image-search limit reached. Try again in a minute." }, 429);
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json({ error: "Image-search service is not configured." }, 503);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const form = await req.formData();
    const upload = form.get("image");
    if (!(upload instanceof File) || upload.size <= 0 || upload.size > 500 * 1024) return json({ error: "Upload a supported image up to 500 KB after image optimization." }, 400);
    const bytes = new Uint8Array(await upload.arrayBuffer());
    if (!validImage(bytes)) return json({ error: "Image must be a valid JPEG, PNG, or WebP file." }, 400);

    const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(Deno.env.get("SERPAPI_DAILY_SEARCH_LIMIT") || "31", 10) || 31));
    const { data: providerRequestReserved, error: providerBudgetError } = await admin.rpc("reserve_provider_search", { p_provider: "serpapi", p_daily_limit: dailyLimit });
    if (providerBudgetError) return json({ error: "Shopping search budget could not be checked. Try again shortly." }, 503);
    if (providerRequestReserved !== true) return json({ configured: true, candidates: [], error: "Wishly reached its configured daily Shopping search budget. Try again tomorrow." }, 429);

    const imageForm = new FormData();
    imageForm.append("image", new Blob([bytes], { type: upload.type }), "wishly-image.jpg");
    imageForm.append("api_key", key);
    const uploadController = new AbortController();
    const uploadTimeout = setTimeout(() => uploadController.abort(), 25_000);
    const uploadStartedAt = Date.now();
    let uploaded: Response;
    try {
      uploaded = await fetch("https://serpapi.com/image", { method: "POST", body: imageForm, signal: uploadController.signal });
    } catch {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "error", durationMs: Date.now() - uploadStartedAt, searchCount: null, unitCostUsd: null, marketCountry: market.country });
      return json({ configured: true, candidates: [], error: "Image recognition provider could not process this image." }, 502);
    } finally { clearTimeout(uploadTimeout); }
    if (!uploaded.ok) {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "error", durationMs: Date.now() - uploadStartedAt, statusCode: uploaded.status, searchCount: null, unitCostUsd: null, marketCountry: market.country });
      return json({ configured: true, candidates: [], error: "Image recognition provider could not process this image." }, 502);
    }
    let uploadedData: any;
    try { uploadedData = await uploaded.json(); }
    catch {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "error", durationMs: Date.now() - uploadStartedAt, statusCode: uploaded.status, searchCount: null, unitCostUsd: null, marketCountry: market.country });
      return json({ configured: true, candidates: [], error: "Image recognition provider returned an unreadable response." }, 502);
    }
    if (typeof uploadedData.image_id !== "string") {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "error", durationMs: Date.now() - uploadStartedAt, statusCode: uploaded.status, searchCount: null, unitCostUsd: null, marketCountry: market.country });
      return json({ configured: true, candidates: [], error: "Image recognition provider returned no image reference." }, 502);
    }

    const search = new URL("https://serpapi.com/search.json");
    search.searchParams.set("engine", "google_lens");
    search.searchParams.set("image_id", uploadedData.image_id);
    search.searchParams.set("type", "visual_matches");
    search.searchParams.set("gl", market.gl);
    search.searchParams.set("hl", market.hl);
    search.searchParams.set("api_key", key);
    const searchController = new AbortController();
    const searchTimeout = setTimeout(() => searchController.abort(), 25_000);
    const searchStartedAt = Date.now();
    let response: Response;
    try { response = await fetch(search, { signal: searchController.signal }); }
    catch {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "error", durationMs: Date.now() - searchStartedAt, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
      return json({ configured: true, candidates: [], error: "Image matches are temporarily unavailable." }, 502);
    } finally { clearTimeout(searchTimeout); }
    if (!response.ok) {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "error", durationMs: Date.now() - searchStartedAt, statusCode: response.status, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
      return json({ configured: true, candidates: [], error: "Image matches are temporarily unavailable." }, 502);
    }
    let results: any;
    try { results = await response.json(); }
    catch {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "error", durationMs: Date.now() - searchStartedAt, statusCode: response.status, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
      return json({ configured: true, candidates: [], error: "Image recognition provider returned an unreadable response." }, 502);
    }
    if (typeof results.error === "string" && results.error.trim()) {
      await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "error", durationMs: Date.now() - searchStartedAt, statusCode: response.status, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
      return json({ configured: true, candidates: [], error: "Image recognition provider could not complete this search." }, 502);
    }
    const matches = Array.isArray(results.visual_matches) ? results.visual_matches : [];
    const candidates = matches.slice(0, 12).flatMap((match: any) => {
      const title = typeof match.title === "string" ? match.title.trim() : "";
      const url = typeof match.link === "string" && /^https?:\/\//i.test(match.link) ? match.link : null;
      if (!title) return [];
      return [{
        title,
        brand: null,
        model_number: null,
        gtin: null,
        image_url: typeof match.thumbnail === "string" ? match.thumbnail : null,
        price: null,
        currency: "",
        store: typeof match.source === "string" ? match.source : null,
        url,
        confidence: 0.55,
        match_reason: "Visual match from Google Lens. Confirm the model and variant before saving.",
        source: "google_lens",
      }];
    });
    await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "success", durationMs: Date.now() - searchStartedAt, resultCount: candidates.length, statusCode: response.status, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: market.country });
    return json({ configured: true, candidates });
  } catch (error) {
    console.error(JSON.stringify({ event: "wishly_image_search_failed", error_name: error instanceof Error ? error.name : "unknown_error" }));
    return json({ error: "Could not recognize this image. Try a clearer image or search by name." }, 500);
  }
});
