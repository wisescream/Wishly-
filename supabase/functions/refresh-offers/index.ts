import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { confirmsGenderVariant, getGenderVariant } from "../_shared/gender-variant.ts";
import { calculateTotalPurchaseCost, parseShippingEstimate } from "../_shared/offer-cost.ts";
import { addOfferCurrencyConversions } from "../_shared/exchange-rate.ts";
import { parseEstimatedUnitCost, parseOpenRouterWebSearchCount, recordProviderMetric, type ProviderErrorCode } from "../_shared/provider-metrics.ts";
import { classifySerpApiFailure, describeSerpApiHttpFailure, parseSerpApiShoppingResponse } from "../_shared/serpapi.ts";
import { resolveProviderCurrency } from "../_shared/provider-currency.ts";
import { buildProductSearchQueries } from "../_shared/product-search.ts";
import { deferPersistenceRetry, recordOfferPriceObservations } from "../_shared/research-persistence.ts";
import { compareProductConditions, normalizeProductCondition } from "../_shared/product-condition.ts";
import { buildRetailerQueries, searchTavily } from "../_shared/tavily.ts";
import { parseSearXNGResponse, searchSearXNG } from "../_shared/searxng.ts";
import { classifySeller, getRetailerDomain, inferRetailerCountry, inspectRetailerProductPage, productOfferEvidenceError } from "../_shared/retailer-discovery.ts";
import { resolveSearchMarket } from "../_shared/search-market.ts";

const retailerDns = (hostname: string, recordType: "A" | "AAAA") => Deno.resolveDns(hostname, recordType);
const retailerTransport = {
  connect: (address: string, port: number) => Deno.connect({ hostname: address, port }),
  startTls: (socket: any, hostname: string) => Deno.startTls(socket, { hostname }),
};
type OfferRow = Record<string, any> & {
  price: number;
  currency: string;
  total_price: number | null;
  total_is_estimated: boolean;
  source: string;
  url: string;
  product_match_confidence: number;
  match_type: string;
  is_verified?: boolean;
};
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const normalizedDigits = (value: unknown) => String(value || "").replace(/\D/g, "");
const variantValue = (title: string, regex: RegExp) => title.match(regex)?.[0]?.replace(/\s/g, "").toLowerCase() || null;
const sizeVariant = (value: unknown) => {
  const text = String(value || "");
  const match = text.match(/\b(US\s*(?:men'?s|women'?s)|EU|UK|CM|MM)\s*[:#-]?\s*(XXS|XS|S|M|L|XL|XXL|\d{1,3}(?:\.\d)?)\b/i)
    || text.match(/\b(?:shoe\s+)?size\s*[:#-]?\s*(XXS|XS|S|M|L|XL|XXL|\d{1,3}(?:\.\d)?)\b/i)
    || text.trim().match(/^(XXS|XS|S|M|L|XL|XXL|\d{1,3}(?:\.\d)?)$/i);
  if (!match) return null;
  const hasSystem = /^(US|EU|UK|CM|MM)/i.test(match[0]);
  return { label: (hasSystem ? match[2] : match[1]).toUpperCase(), system: hasSystem ? match[1].replace(/\s+/g, " ").toUpperCase() : null };
};
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ignoredTitleWords = new Set<string>(["the", "and", "for", "with", "from", "new", "official", "shop", "buy", "online", "price", "free", "shipping", "sale", "best", "deal", "product", "original"]);
const normalizedWords = (value: string): string[] => [...(value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [])];
function matchListing(title: string, target: { title: string; brand: string; model: string; gtin: string; capacity: string | null; color: string | null; size: { label: string; system: string | null } | null; gender: string | null; condition: string }, candidateIds: unknown[] = [], conditionEvidence: unknown = title) {
  const candidateDigits = candidateIds.map(normalizedDigits).filter(Boolean);
  const candidateGtinMatch = Boolean(target.gtin && candidateDigits.includes(target.gtin));
  if (target.gtin && candidateDigits.length && !candidateGtinMatch) return null;
  const candidateCondition = normalizeProductCondition(conditionEvidence) === "unknown"
    ? normalizeProductCondition(title)
    : normalizeProductCondition(conditionEvidence);
  const modelMatch = Boolean(target.model && new RegExp(`(^|\\W)${escapeRegex(target.model)}($|\\W)`, "i").test(title));
  const brandWords = normalizedWords(target.brand);
  const candidateWords = new Set(normalizedWords(title));
  const brandMatch = !brandWords.length || brandWords.every((word) => candidateWords.has(word));
  if (!brandMatch) return null;
  const candidateCapacity = variantValue(title, /\b\d+\s*(?:gb|tb|mb)\b/i);
  const candidateColor = variantValue(title, /\b(?:black|white|silver|gold|blue|red|green|yellow|purple|pink|midnight|starlight|graphite|natural titanium|desert titanium)\b/i);
  const candidateSize = sizeVariant(title);
  const candidateGender = getGenderVariant(title);
  if (target.capacity && candidateCapacity && target.capacity !== candidateCapacity) return null;
  if (target.color && candidateColor && target.color !== candidateColor) return null;
  if (target.size && candidateSize && (target.size.label !== candidateSize.label || (target.size.system && candidateSize.system && target.size.system !== candidateSize.system))) return null;
  if (!confirmsGenderVariant(target.gender, candidateGender)) return null;
  if (/\b(replacement|compatible|case for|cover for)\b/i.test(title)) return null;

  const targetWords = [...new Set(normalizedWords([target.brand, target.model, target.title].filter(Boolean).join(" ")))]
    .filter((word) => !ignoredTitleWords.has(word) && !brandWords.includes(word) && word.length > 1);
  const matchedWords = targetWords.filter((word) => candidateWords.has(word));
  const coverage = targetWords.length ? matchedWords.length / targetWords.length : 0;
  const codedModels = targetWords.filter((word) => /[a-z]/.test(word) && /\d/.test(word) && word.length >= 4);
  const codedModelMatch = codedModels.some((word) => candidateWords.has(word));
  const variantMissing = Boolean((target.capacity && !candidateCapacity) || (target.color && !candidateColor) || (target.size && !candidateSize) || (target.gender && !candidateGender));
  let result: { confidence: number; matchType: string; exact: boolean } | null = null;
  if (candidateGtinMatch) result = { confidence: 1, matchType: "gtin", exact: true };
  else if (target.model && modelMatch) result = { confidence: variantMissing ? 0.86 : 0.96, matchType: variantMissing ? "model_variant_unconfirmed" : "brand_model_variant", exact: !variantMissing };
  else if (codedModelMatch && coverage >= 0.75) result = { confidence: variantMissing ? 0.82 : 0.91, matchType: variantMissing ? "title_model_variant_unconfirmed" : "title_model", exact: !variantMissing };
  else if (targetWords.length >= 2 && coverage >= 0.7) result = { confidence: Math.min(0.84, 0.62 + coverage * 0.22), matchType: "title_similarity", exact: false };
  if (!result) return null;

  const conditionMatch = compareProductConditions(target.condition, candidateCondition);
  if (conditionMatch === "alternative") result = { confidence: Math.min(result.confidence, 0.72), matchType: `condition_alternative_${candidateCondition}`, exact: false };
  else if (conditionMatch === "unconfirmed") result = { confidence: Math.min(result.confidence, 0.84), matchType: `${result.matchType}_condition_unconfirmed`, exact: false };
  return { ...result, candidateCapacity, candidateColor, candidateSize, candidateCondition };
}

function retailerFromUrl(value: string): string | null {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (/^(google|bing|yahoo|duckduckgo|facebook|instagram|tiktok|youtube|reddit|wikipedia|pinterest|tomsguide|techradar|cnet|theverge|wired|nytimes|forbes|engadget|digitaltrends)\./.test(host)) return null;
    return host;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = req.headers.get("Authorization");
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authorization?.startsWith("Bearer ") || !url || !anonKey || !serviceKey) return reply({ error: "Authentication or service configuration missing." }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return reply({ error: "Authentication required." }, 401);
    const { data: userPreferences } = await userClient.from("profiles").select("currency,country,language").eq("id", userData.user.id).maybeSingle();
    const requestBody = await req.json();
    const { item_id, force_refresh } = requestBody;
    const allowExpandedSearch = requestBody.allow_expanded_search === true;
    if (typeof item_id !== "string") return reply({ error: "Wishlist item id is required." }, 400);

    const { data: item } = await userClient.from("items")
      .select("id,title,brand,model_number,gtin,product_id,variant_id,variant_label,condition,category,url,currency,target_price,offers_last_checked_at,offer_search_attempts,wishlists!inner(owner_id)")
      .eq("id", item_id).maybeSingle();
    const owner = (item?.wishlists as unknown as { owner_id?: string } | null)?.owner_id;
    if (!item || owner !== userData.user.id) return reply({ error: "Wishlist item not found." }, 404);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: refreshReserved, error: refreshLimitError } = await admin.rpc("reserve_interactive_offer_refresh", {
      p_user_id: userData.user.id,
    });
    if (refreshLimitError) throw refreshLimitError;
    if (refreshReserved !== true) return reply({ error: "Offer refresh limit reached. Try again later." }, 429);
    const apiKey = Deno.env.get("SERPAPI_KEY");

    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    const productCache = item.product_id
      ? (await admin.from("products").select("offers_last_checked_at,offer_search_status").eq("id", item.product_id).maybeSingle()).data
      : null;
    const lastChecked = productCache?.offers_last_checked_at || item.offers_last_checked_at;
    if (!force_refresh && lastChecked && new Date(lastChecked).getTime() > cutoff) {
      if (item.product_id && productCache?.offer_search_status === "offers_available") {
        let sharedQuery = admin.from("store_offers").select("*")
          .eq("product_id", item.product_id).eq("currency", item.currency).gte("last_verified_at", new Date(cutoff).toISOString());
        sharedQuery = item.variant_id ? sharedQuery.eq("variant_id", item.variant_id) : sharedQuery.is("variant_id", null);
        const { data: sharedOffers } = await sharedQuery.limit(20);
        if (sharedOffers?.length) {
          const copies = sharedOffers.map((offer) => {
            const copy = { ...offer, item_id: item.id };
            delete copy.id;
            return copy;
          });
          const localizedCopies = await addOfferCurrencyConversions(
            copies.map((offer) => ({ ...offer, destination_country: userPreferences?.country || null })),
            String(userPreferences?.currency || item.currency || "USD"),
          );
          const { data: copied, error: copyError } = await admin.from("store_offers").upsert(localizedCopies, { onConflict: "item_id,source,url" }).select("id,store,price,currency,source,url,availability,last_verified_at,is_verified");
          if (copyError) {
            const retry = await deferPersistenceRetry(admin, item, new Date().toISOString(), "offer_upsert");
            return reply({ error: retry.scheduled ? "Recent product offers were found, but Wishly could not save them. A retry is scheduled." : "Recent product offers were found, but Wishly could not save them or schedule a retry.", retry_scheduled: retry.scheduled }, 503);
          }
          const copiedHistory = await recordOfferPriceObservations(admin, item.id, copied || [], new Date().toISOString());
          if (copiedHistory.failed) {
            const retry = await deferPersistenceRetry(admin, item, new Date().toISOString(), "price_history");
            return reply({ error: retry.scheduled ? "Recent offers were saved, but their price history could not be recorded. A retry is scheduled." : "Recent offers were saved, but their price history could not be recorded or scheduled for retry.", retry_scheduled: retry.scheduled }, 503);
          }
          const count = (await userClient.from("store_offers").select("id", { count: "exact", head: true }).eq("item_id", item.id)).count || 0;
          if (count) {
            const checkedAt = new Date();
            const interval = item.target_price != null ? 2 : 6;
            await admin.from("items").update({
              last_offer_search_at: checkedAt.toISOString(),
              next_offer_search_at: new Date(checkedAt.getTime() + interval * 60 * 60 * 1000).toISOString(),
            }).eq("id", item.id);
            return reply({ configured: true, cached: true, status: productCache?.offer_search_status || "partial", offers_found: count });
          }
        }
      }
    }

    const variant = item.variant_id ? (await userClient.from("product_variants").select("name").eq("id", item.variant_id).maybeSingle()).data?.name : "";
    const productTitle = [item.title, variant].filter(Boolean).join(" ");
    const targetSize = sizeVariant(item.variant_label) || sizeVariant(variant);
    const targetGender = getGenderVariant(productTitle);
    const targetCountry = String(userPreferences?.country || "").toUpperCase();
    const market = resolveSearchMarket(targetCountry, item.currency, userPreferences?.language);
    const targetGtin = normalizedDigits(item.gtin);
    const targetModel = String(item.model_number || "").toLowerCase();
    const targetCapacity = variantValue(productTitle, /\b\d+\s*(?:gb|tb|mb)\b/i);
    const targetColor = variantValue(productTitle, /\b(?:black|white|silver|gold|blue|red|green|yellow|purple|pink|midnight|starlight|graphite|natural titanium|desert titanium)\b/i);
    const matchTarget = { title: productTitle, brand: String(item.brand || ""), model: targetModel, gtin: targetGtin, capacity: targetCapacity, color: targetColor, size: targetSize, gender: targetGender, condition: String(item.condition || "unknown") };
    const searchQueries = buildProductSearchQueries({
      gtin: targetGtin,
      brand: item.brand,
      modelNumber: item.model_number,
      title: productTitle,
      variant: item.variant_label,
    });
    let shoppingRows: any[] = [];
    let shoppingQueryCount = 0;
    let shoppingFailures = 0;
    let shoppingBudgetReached = false;
    const researchStartedAt = Date.now();
    let shoppingSearchError: string | null = null;
    let tavilySearchAttempted = false;
    let tavilySearchError: string | null = null;
    let tavilyQueriesCount = 0;
    let searxngSearchAttempted = false;
    let searxngSearchError: string | null = null;
    let searxngQueriesCount = 0;
    let retailerPagesInspected = 0;
    if (apiKey) {
      for (const searchQuery of searchQueries.slice(0, 3)) {
        const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(Deno.env.get("SERPAPI_DAILY_SEARCH_LIMIT") || "31", 10) || 31));
        const { data: reserved, error: budgetError } = await admin.rpc("reserve_provider_search", { p_provider: "serpapi", p_daily_limit: dailyLimit });
        if (budgetError) throw budgetError;
        if (reserved !== true) {
          shoppingBudgetReached = true;
          shoppingSearchError = "Wishly reached its configured daily Google Shopping search budget. Try again tomorrow.";
          await recordProviderMetric(admin, { provider: "serpapi", surface: "interactive", outcome: "budget_exhausted", marketCountry: targetCountry });
          break;
        }
        const searchUrl = new URL("https://serpapi.com/search.json");
        searchUrl.searchParams.set("engine", "google_shopping");
        searchUrl.searchParams.set("q", searchQuery);
        searchUrl.searchParams.set("gl", market.gl);
        searchUrl.searchParams.set("hl", market.hl);
        searchUrl.searchParams.set("api_key", apiKey!);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        shoppingQueryCount++;
        const searchStartedAt = Date.now();
        let resultCount = 0;
        let statusCode: number | null = null;
        let outcome: "success" | "error" = "error";
        let errorCode: ProviderErrorCode | null = null;
        try {
          const searchResponse = await fetch(searchUrl, { signal: controller.signal });
          statusCode = searchResponse.status;
          if (!searchResponse.ok) {
            shoppingFailures++;
            const responseBody = await searchResponse.text();
            errorCode = classifySerpApiFailure(searchResponse.status, responseBody);
            shoppingSearchError = describeSerpApiHttpFailure(searchResponse.status, responseBody);
          }
          else {
            const payload = await searchResponse.json();
            const parsed = parseSerpApiShoppingResponse(payload);
            if (parsed.error) {
              shoppingFailures++;
              errorCode = classifySerpApiFailure(searchResponse.status, JSON.stringify(payload));
              shoppingSearchError = "Google Shopping could not complete this search.";
            }
            else {
              const rows = parsed.rows as any[];
              resultCount = rows.length;
              outcome = "success";
              shoppingRows.push(...rows);
              const hasStrongMatch = rows.some((row: any) => {
                const match = matchListing(
                  `${String(row.title || "")} ${[row.size, ...(Array.isArray(row.extensions) ? row.extensions : [])].filter((part) => typeof part === "string").join(" ")}`,
                  matchTarget,
                  [row.gtin, row.upc, row.ean],
                  row.condition,
                );
                return Boolean(match && match.confidence >= 0.9);
              });
              if (hasStrongMatch) break;
            }
          }
        } catch {
          shoppingFailures++;
          errorCode = "network_error";
          shoppingSearchError = "Google Shopping could not be reached.";
        } finally {
          clearTimeout(timeout);
          await recordProviderMetric(admin, {
            provider: "serpapi", surface: "interactive", outcome, durationMs: Date.now() - searchStartedAt,
            resultCount, statusCode, errorCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")),
            marketCountry: targetCountry,
          });
        }
      }
    } else shoppingSearchError = "Google Shopping is not configured.";

    const stamp = new Date().toISOString();
    const offerRows: OfferRow[] = shoppingRows.flatMap((row: any) => {
      const title = String(row.title || "");
      const extra = [row.size, ...(Array.isArray(row.extensions) ? row.extensions : [])].filter((part) => typeof part === "string").join(" ");
      const match = matchListing(`${title} ${extra}`, matchTarget, [row.gtin, row.upc, row.ean], row.condition);
      const price = Number(row.extracted_price);
      const offerUrl = typeof row.link === "string" ? row.link : "";
      if (!match || !Number.isFinite(price) || price <= 0 || !/^https?:\/\//i.test(offerUrl)) return [];
      const oldPrice = Number(row.extracted_old_price);
      const currency = resolveProviderCurrency(String(row.price || ""), String(item.currency || "USD").toUpperCase());
      if (!currency) return [];
      const delivery = parseShippingEstimate(row.delivery, currency);
      const taxesKnown = false;
      const taxes = 0;
      const totalPrice = calculateTotalPurchaseCost({ price, shippingCost: delivery.amount, taxes, shippingKnown: delivery.known, taxesKnown });
      return [{
        item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
        store: String(row.source || retailerFromUrl(offerUrl) || "Retailer").slice(0, 120), seller: String(row.source || "Retailer").slice(0, 120),
        seller_type: classifySeller(getRetailerDomain(offerUrl) || ""),
        listing_title: title, image_url: typeof row.thumbnail === "string" ? row.thumbnail : null,
        size_label: match.candidateSize?.label || null, size_system: match.candidateSize?.system || null, color_label: match.candidateColor,
        product_match_confidence: match.confidence, match_type: match.matchType,
        price, currency, url: offerUrl,
        original_price: Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : null,
        discount_percent: Number.isFinite(oldPrice) && oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : null,
        shipping_cost: delivery.amount, taxes, total_price: totalPrice, delivery_estimate: delivery.evidence,
        shipping_known: delivery.known, taxes_known: taxesKnown, total_is_estimated: totalPrice == null,
        destination_country: userPreferences?.country || null,
        condition: match.candidateCondition,
        availability: "unknown", source: "google_shopping", last_verified_at: stamp,
      }];
    });

    // Expanded discovery is opt-in in both the UI request and server config.
    // No Tavily or OpenRouter web-search request can spend provider quota from
    // the background worker or a normal Google Shopping refresh.
    const tavilyKey = Deno.env.get("TAVILY_API_KEY");
    const tavilyEnabled = allowExpandedSearch && Deno.env.get("TAVILY_ALLOW_PAID_SEARCH") === "true" && Boolean(tavilyKey);
    if (allowExpandedSearch && !tavilyEnabled) {
      tavilySearchError = !tavilyKey ? "Tavily is not configured. Add TAVILY_API_KEY and explicitly enable TAVILY_ALLOW_PAID_SEARCH to use it." : "Tavily discovery is disabled by project configuration.";
    }
    const tavilyQueries = buildRetailerQueries({
      title: productTitle, brand: item.brand, model: item.model_number, variant: item.variant_label,
      category: item.category, country: targetCountry, language: userPreferences?.language,
    });
    const { data: knownRetailers } = await admin.from("retailers").select("canonical_domain")
      .in("validation_status", ["discovered", "validated"])
      .in("country_code", [...new Set([targetCountry || "MA", "GLOBAL"])])
      .limit(20);
    const knownDomains = (knownRetailers || []).map((retailer) => String(retailer.canonical_domain || "")).filter(Boolean);
    const inspectedDomains = new Set<string>();
    let inspectionBudget = 0;
    if (tavilyEnabled && !offerRows.some((offer) => offer.product_match_confidence >= 0.9)) {
      for (const [queryIndex, query] of tavilyQueries.slice(0, 3).entries()) {
        const includeDomains = queryIndex === 1 ? knownDomains : [];
        const cacheInput = `${query.toLowerCase().replace(/\s+/g, " ").trim()}|${includeDomains.join(",")}`;
        const queryDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cacheInput));
        const queryHash = Array.from(new Uint8Array(queryDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const now = new Date().toISOString();
        const { data: cached } = await admin.from("retailer_search_cache").select("results")
          .eq("query_hash", queryHash).eq("provider", "tavily").gt("expires_at", now).maybeSingle();
        let candidates: Array<{ title: string; url: string; content: string; score: number | null }> = Array.isArray(cached?.results) ? cached.results : [];
        if (!cached) {
          const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(Deno.env.get("TAVILY_DAILY_SEARCH_LIMIT") || "4", 10) || 4));
          const { data: reserved, error: budgetError } = await admin.rpc("reserve_provider_search", { p_provider: "tavily", p_daily_limit: dailyLimit });
          if (budgetError) throw budgetError;
          if (reserved !== true) {
            tavilySearchError = "Wishly reached its configured daily Tavily search budget. Try again tomorrow.";
            await recordProviderMetric(admin, { provider: "tavily", surface: "interactive", outcome: "budget_exhausted", marketCountry: targetCountry });
            break;
          }
          const startedAt = Date.now();
          let statusCode: number | null = null;
          let outcome: "success" | "error" = "error";
          try {
            const result = await searchTavily(tavilyKey!, query, fetch, includeDomains);
            statusCode = result.response.status;
            if (!result.response.ok) tavilySearchError = result.response.status === 401 ? "Tavily rejected its API key." : result.response.status === 429 ? "Tavily rate limit reached." : result.data.error || "Tavily search is temporarily unavailable.";
            else {
              candidates = result.data.results;
              outcome = "success";
              tavilySearchAttempted = true;
              tavilyQueriesCount++;
              await admin.from("retailer_search_cache").upsert({ query_hash: queryHash, provider: "tavily", results: candidates, expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() }, { onConflict: "query_hash" });
            }
          } catch {
            tavilySearchError = "Tavily search could not be reached.";
          } finally {
            await recordProviderMetric(admin, { provider: "tavily", surface: "interactive", outcome, durationMs: Date.now() - startedAt, resultCount: candidates.length, searchCount: 1, statusCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("TAVILY_ESTIMATED_COST_PER_SEARCH_USD")), marketCountry: targetCountry });
          }
        } else {
          tavilySearchAttempted = true;
          tavilyQueriesCount++;
        }

        for (const lead of candidates) {
          if (inspectionBudget >= 3) break;
          const domain = getRetailerDomain(lead.url);
          if (!domain || !retailerFromUrl(lead.url) || inspectedDomains.has(domain)) continue;
          inspectedDomains.add(domain);
          const retailerCountry = inferRetailerCountry(domain);
          const { data: existingRetailers } = await admin.from("retailers").select("id,name,seller_type,reliability_score,retry_after")
            .eq("canonical_domain", domain).eq("country_code", retailerCountry).limit(1);
          let existingRetailer = existingRetailers?.[0] || null;
          if (existingRetailer?.retry_after && new Date(existingRetailer.retry_after).getTime() > Date.now()) continue;
          let retailerId = existingRetailer?.id || null;
          if (!retailerId) {
            const { data: createdRetailer, error: createError } = await admin.from("retailers").insert({
              name: domain, domain, canonical_domain: domain, country_code: retailerCountry,
              validation_status: "pending_inspection", seller_type: classifySeller(domain),
              categories: [item.category || "fashion"], languages: [userPreferences?.language || "en"],
              discovery_source: "tavily", discovered_by_query: queryHash, is_supported: false,
            }).select("id").maybeSingle();
            retailerId = createdRetailer?.id || null;
            // The unique regional domain index is the concurrency guard. If a
            // parallel search inserted the retailer after our lookup, reuse it.
            if (!retailerId && createError?.code === "23505") {
              const { data: racedRetailer } = await admin.from("retailers").select("id,name,seller_type,reliability_score,retry_after")
                .eq("canonical_domain", domain).eq("country_code", retailerCountry).limit(1).maybeSingle();
              existingRetailer = racedRetailer || null;
              retailerId = racedRetailer?.id || null;
            }
          }
          await admin.from("retailer_discovery_events").insert({
            retailer_id: retailerId, canonical_domain: domain, product_id: item.product_id || null,
            source_provider: "tavily", source_query: queryHash, source_url: lead.url,
            outcome: "discovered", evidence: { result_title: lead.title, search_score: lead.score },
          });

          inspectionBudget++;
          retailerPagesInspected++;
          const inspection = await inspectRetailerProductPage(lead.url, retailerDns, retailerTransport);
          const metadata = inspection.metadata;
          if (!inspection.permitted || inspection.errorCode || !metadata?.title) {
            const restricted = inspection.errorCode === "robots_restricted" || inspection.errorCode === "unsafe_url";
            const unavailable = inspection.errorCode?.startsWith("http_") || ["fetch_failed", "fetch_unknown"].includes(inspection.errorCode || "");
            const nextStatus = restricted ? "restricted" : unavailable ? "temporarily_unavailable" : "discovered";
            if (retailerId) await admin.from("retailers").update({
              validation_status: nextStatus, last_inspected_at: new Date().toISOString(),
              last_error: inspection.errorCode, retry_after: new Date(Date.now() + (restricted ? 7 : 1) * 24 * 60 * 60 * 1000).toISOString(),
              reliability_score: Math.max(0, Number(existingRetailer?.reliability_score ?? 0.5) - (restricted ? 0.1 : 0.05)),
            }).eq("id", retailerId);
            await admin.from("retailer_discovery_events").insert({
              retailer_id: retailerId, canonical_domain: domain, product_id: item.product_id || null,
              source_provider: "tavily", source_query: queryHash, source_url: inspection.finalUrl,
              outcome: restricted ? "restricted" : "inspection_failed", error_code: inspection.errorCode || "product_metadata_missing",
              evidence: { status: inspection.status },
            });
            continue;
          }

          const pageTitle = [metadata.title, metadata.brand, metadata.model_number, metadata.variant_name].filter(Boolean).join(" ");
          const pageMatch = matchListing(pageTitle, matchTarget, [metadata.gtin, metadata.sku], metadata.condition);
          const pagePrice = metadata.price;
          const pageCurrency = resolveProviderCurrency(metadata.currency || "", String(item.currency || "USD").toUpperCase());
          const hasUsableOffer = Boolean(pageMatch && pagePrice && pagePrice > 0 && pageCurrency);
          const validationError = productOfferEvidenceError(Boolean(pageMatch), pagePrice, pageCurrency);
          const verifiedRetailer = validationError === null && Boolean(metadata.title);
          const sellerType = classifySeller(inspection.canonicalDomain || domain);
          if (retailerId) await admin.from("retailers").update({
            domain: inspection.canonicalDomain || domain, canonical_domain: inspection.canonicalDomain || domain,
            validation_status: verifiedRetailer ? "validated" : "discovered",
            seller_type: sellerType === "unknown" ? existingRetailer?.seller_type || "unknown" : sellerType,
            is_supported: verifiedRetailer, last_inspected_at: new Date().toISOString(),
            last_successful_at: verifiedRetailer ? new Date().toISOString() : null,
            last_error: verifiedRetailer ? null : validationError,
            retry_after: new Date(Date.now() + (verifiedRetailer ? 7 : 1) * 24 * 60 * 60 * 1000).toISOString(),
            reliability_score: Math.min(1, Number(existingRetailer?.reliability_score ?? 0.5) + (verifiedRetailer ? 0.02 : -0.03)),
            extraction_capabilities: { title: Boolean(metadata.title), image: Boolean(metadata.image_url), price: pagePrice != null, currency: Boolean(metadata.currency), variants: metadata.variants.length > 0 },
            trust_evidence: verifiedRetailer ? "Public product page returned structured product identity and a current price. This does not establish seller authorization or authenticity." : null,
          }).eq("id", retailerId);
          await admin.from("retailer_discovery_events").insert({
            retailer_id: retailerId, canonical_domain: inspection.canonicalDomain || domain, product_id: item.product_id || null,
            source_provider: "tavily", source_query: queryHash, source_url: inspection.finalUrl,
            outcome: verifiedRetailer ? "inspection_succeeded" : "inspection_failed",
            error_code: validationError,
            evidence: { title: metadata.title, has_price: pagePrice != null, currency: metadata.currency, has_image: Boolean(metadata.image_url), variant_count: metadata.variants.length },
          });
          if (!hasUsableOffer || !pageMatch || !pagePrice || !pageCurrency) continue;
          offerRows.push({
            item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
            store: existingRetailer?.name || domain, seller: domain, listing_title: metadata.title.slice(0, 300), image_url: metadata.image_url,
            seller_type: sellerType === "unknown" ? existingRetailer?.seller_type || "unknown" : sellerType,
            size_label: pageMatch.candidateSize?.label || null, size_system: pageMatch.candidateSize?.system || null, color_label: pageMatch.candidateColor,
            product_match_confidence: pageMatch.confidence, match_type: pageMatch.matchType,
            price: pagePrice, currency: pageCurrency, url: metadata.canonical_url || inspection.finalUrl,
            original_price: metadata.original_price, discount_percent: metadata.discount_percent,
            shipping_cost: 0, taxes: 0, total_price: null, delivery_estimate: null,
            shipping_known: false, taxes_known: false, total_is_estimated: true,
            destination_country: userPreferences?.country || null, condition: normalizeProductCondition(metadata.condition),
            availability: metadata.availability, source: "tavily_crawled_page", last_verified_at: new Date().toISOString(),
            is_verified: pageMatch.confidence >= 0.9,
          });
        }
        if (offerRows.some((offer) => offer.product_match_confidence >= 0.9) || inspectionBudget >= 3) break;
      }
    }

    // A configured self-hosted SearXNG instance is a free fallback for broad
    // product-page leads. Every lead is inspected before any offer is saved.
    const searxngBaseUrl = Deno.env.get("SEARXNG_URL")?.trim();
    if (searxngBaseUrl && !offerRows.some((offer) => offer.product_match_confidence >= 0.9) && retailerPagesInspected < 3) {
      for (const query of tavilyQueries.slice(0, 2)) {
        if (inspectionBudget >= 3 || retailerPagesInspected >= 3) break;
        const cacheInput = `searxng|${query.toLowerCase().replace(/\s+/g, " ").trim()}|${targetCountry}|${userPreferences?.language || "en"}`;
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cacheInput));
        const queryHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const now = new Date().toISOString();
        const { data: cached } = await admin.from("retailer_search_cache").select("results")
          .eq("query_hash", queryHash).eq("provider", "searxng").gt("expires_at", now).maybeSingle();
        let leads = Array.isArray(cached?.results) ? parseSearXNGResponse({ results: cached.results }) : [];
        if (!cached) {
          const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(Deno.env.get("SEARXNG_DAILY_SEARCH_LIMIT") || "20", 10) || 20));
          const { data: reserved, error: budgetError } = await admin.rpc("reserve_provider_search", { p_provider: "searxng", p_daily_limit: dailyLimit });
          if (budgetError) searxngSearchError = "The SearXNG daily search budget could not be checked.";
          else if (reserved !== true) {
            searxngSearchError = "Wishly reached its configured daily SearXNG search budget. Try again tomorrow.";
            await recordProviderMetric(admin, { provider: "searxng", surface: "interactive", outcome: "budget_exhausted", marketCountry: targetCountry });
          } else {
            const startedAt = Date.now();
            let statusCode: number | null = null;
            let outcome: "success" | "error" = "error";
            try {
              const result = await searchSearXNG(searxngBaseUrl, query, userPreferences?.language || "en");
              statusCode = result.response.status;
              if (!result.response.ok) searxngSearchError = `SearXNG returned HTTP ${result.response.status}.`;
              else {
                leads = result.results;
                searxngSearchAttempted = true;
                searxngQueriesCount++;
                outcome = "success";
                await admin.from("retailer_search_cache").upsert({
                  query_hash: queryHash, provider: "searxng", results: leads,
                  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                }, { onConflict: "query_hash" });
              }
            } catch {
              searxngSearchError = "The configured SearXNG instance could not be reached.";
            } finally {
              await recordProviderMetric(admin, {
                provider: "searxng", surface: "interactive", outcome,
                durationMs: Date.now() - startedAt, resultCount: leads.length, statusCode,
                unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SEARXNG_ESTIMATED_COST_PER_SEARCH_USD")),
                marketCountry: targetCountry,
              });
            }
          }
        } else {
          searxngSearchAttempted = true;
          searxngQueriesCount++;
        }

        for (const lead of leads) {
          if (inspectionBudget >= 3 || retailerPagesInspected >= 3) break;
          const domain = getRetailerDomain(lead.url);
          if (!domain || !retailerFromUrl(lead.url) || inspectedDomains.has(domain)) continue;
          inspectedDomains.add(domain);
          const { data: existingRows } = await admin.from("retailers").select("id,name,seller_type,reliability_score,retry_after")
            .eq("canonical_domain", domain).limit(1);
          const existingRetailer = existingRows?.[0] || null;
          if (existingRetailer?.retry_after && new Date(existingRetailer.retry_after).getTime() > Date.now()) continue;
          let retailerId = existingRetailer?.id || null;
          if (!retailerId) {
            const { data: created } = await admin.from("retailers").insert({
              name: domain, domain, canonical_domain: domain, country_code: inferRetailerCountry(domain),
              validation_status: "pending_inspection", seller_type: classifySeller(domain),
              categories: [item.category || "fashion"], languages: [userPreferences?.language || "en"],
              discovery_source: "searxng", discovered_by_query: queryHash, is_supported: false,
            }).select("id").maybeSingle();
            retailerId = created?.id || null;
          }
          await admin.from("retailer_discovery_events").insert({
            retailer_id: retailerId, canonical_domain: domain, product_id: item.product_id || null,
            source_provider: "searxng", source_query: queryHash, source_url: lead.url,
            outcome: "discovered", evidence: { result_title: lead.title, search_score: lead.score },
          });
          inspectionBudget++;
          retailerPagesInspected++;
          const inspection = await inspectRetailerProductPage(lead.url, retailerDns, retailerTransport);
          const metadata = inspection.metadata;
          if (!inspection.permitted || inspection.errorCode || !metadata?.title) {
            const restricted = inspection.errorCode === "robots_restricted" || inspection.errorCode === "unsafe_url";
            const unavailable = inspection.errorCode?.startsWith("http_") || ["fetch_failed", "fetch_unknown"].includes(inspection.errorCode || "");
            if (retailerId) await admin.from("retailers").update({
              validation_status: restricted ? "restricted" : unavailable ? "temporarily_unavailable" : "discovered",
              last_inspected_at: new Date().toISOString(), last_error: inspection.errorCode,
              retry_after: new Date(Date.now() + (restricted ? 7 : 1) * 24 * 60 * 60 * 1000).toISOString(),
              reliability_score: Math.max(0, Number(existingRetailer?.reliability_score ?? 0.5) - (restricted ? 0.1 : 0.05)),
            }).eq("id", retailerId);
            await admin.from("retailer_discovery_events").insert({
              retailer_id: retailerId, canonical_domain: domain, product_id: item.product_id || null,
              source_provider: "searxng", source_query: queryHash, source_url: inspection.finalUrl,
              outcome: restricted ? "restricted" : "inspection_failed", error_code: inspection.errorCode || "product_metadata_missing",
              evidence: { status: inspection.status },
            });
            continue;
          }

          const pageTitle = [metadata.title, metadata.brand, metadata.model_number, metadata.variant_name].filter(Boolean).join(" ");
          const pageMatch = matchListing(pageTitle, matchTarget, [metadata.gtin, metadata.sku], metadata.condition);
          const pagePrice = metadata.price;
          const pageCurrency = resolveProviderCurrency(metadata.currency || "", String(item.currency || "USD").toUpperCase());
          const hasUsableOffer = Boolean(pageMatch && pagePrice && pagePrice > 0 && pageCurrency);
          const validationError = productOfferEvidenceError(Boolean(pageMatch), pagePrice, pageCurrency);
          const verifiedRetailer = validationError === null && Boolean(metadata.title);
          const sellerType = classifySeller(inspection.canonicalDomain || domain);
          if (retailerId) await admin.from("retailers").update({
            domain: inspection.canonicalDomain || domain, canonical_domain: inspection.canonicalDomain || domain,
            validation_status: verifiedRetailer ? "validated" : "discovered",
            seller_type: sellerType === "unknown" ? existingRetailer?.seller_type || "unknown" : sellerType,
            is_supported: verifiedRetailer, last_inspected_at: new Date().toISOString(),
            last_successful_at: verifiedRetailer ? new Date().toISOString() : null,
            last_error: verifiedRetailer ? null : validationError,
            retry_after: new Date(Date.now() + (verifiedRetailer ? 7 : 1) * 24 * 60 * 60 * 1000).toISOString(),
            reliability_score: Math.min(1, Number(existingRetailer?.reliability_score ?? 0.5) + (verifiedRetailer ? 0.02 : -0.03)),
            extraction_capabilities: { title: Boolean(metadata.title), image: Boolean(metadata.image_url), price: pagePrice != null, currency: Boolean(metadata.currency), variants: metadata.variants.length > 0 },
            trust_evidence: verifiedRetailer ? "Public product page returned structured product identity and a current price. This does not establish seller authorization or authenticity." : null,
          }).eq("id", retailerId);
          await admin.from("retailer_discovery_events").insert({
            retailer_id: retailerId, canonical_domain: inspection.canonicalDomain || domain, product_id: item.product_id || null,
            source_provider: "searxng", source_query: queryHash, source_url: inspection.finalUrl,
            outcome: verifiedRetailer ? "inspection_succeeded" : "inspection_failed",
            error_code: validationError,
            evidence: { title: metadata.title, has_price: pagePrice != null, currency: metadata.currency, has_image: Boolean(metadata.image_url), variant_count: metadata.variants.length },
          });
          if (!hasUsableOffer || !pageMatch || !pagePrice || !pageCurrency) continue;
          offerRows.push({
            item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
            store: existingRetailer?.name || domain, seller: domain, listing_title: metadata.title.slice(0, 300), image_url: metadata.image_url,
            seller_type: sellerType === "unknown" ? existingRetailer?.seller_type || "unknown" : sellerType,
            size_label: pageMatch.candidateSize?.label || null, size_system: pageMatch.candidateSize?.system || null, color_label: pageMatch.candidateColor,
            product_match_confidence: pageMatch.confidence, match_type: pageMatch.matchType,
            price: pagePrice, currency: pageCurrency, url: metadata.canonical_url || inspection.finalUrl,
            original_price: metadata.original_price, discount_percent: metadata.discount_percent,
            shipping_cost: 0, taxes: 0, total_price: null, delivery_estimate: null,
            shipping_known: false, taxes_known: false, total_is_estimated: true,
            destination_country: userPreferences?.country || null, condition: normalizeProductCondition(metadata.condition),
            availability: metadata.availability, source: "searxng_crawled_page", last_verified_at: new Date().toISOString(),
            is_verified: pageMatch.confidence >= 0.9,
          });
        }
        if (offerRows.some((offer) => offer.product_match_confidence >= 0.9) || inspectionBudget >= 3) break;
      }
    }

    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    let openRouterSearchAttempted = false;
    let openRouterSearchError: string | null = null;
    const openRouterEnabled = allowExpandedSearch && Deno.env.get("OPENROUTER_ALLOW_PAID_SEARCH") === "true" && Boolean(openRouterKey);
    if (allowExpandedSearch && !openRouterEnabled && openRouterKey) openRouterSearchError = "OpenRouter web search is disabled by project configuration.";
    if (!offerRows.some((offer) => offer.product_match_confidence >= 0.9) && retailerPagesInspected < 3 && openRouterEnabled) {
      const openRouterLimit = Deno.env.get("OPENROUTER_DAILY_REQUEST_LIMIT") || Deno.env.get("OPENROUTER_DAILY_SEARCH_LIMIT") || "8";
      const dailyLimit = Math.max(1, Math.min(100000, Number.parseInt(openRouterLimit, 10) || 8));
      const { data: reserved, error: budgetError } = await admin.rpc("reserve_provider_search", { p_provider: "openrouter", p_daily_limit: dailyLimit });
      if (budgetError) throw budgetError;
      if (reserved !== true) {
        openRouterSearchError = "Wishly reached its configured daily web-search budget. Try again tomorrow.";
        await recordProviderMetric(admin, { provider: "openrouter", surface: "interactive", outcome: "budget_exhausted", marketCountry: targetCountry });
      }
      else {
      openRouterSearchAttempted = true;
      const searchStartedAt = Date.now();
      let resultCount = 0;
      let searchCount: number | null = null;
      let statusCode: number | null = null;
      let outcome: "success" | "error" = "error";
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        let response: Response;
        try {
          response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              model: Deno.env.get("OPENROUTER_MODEL") || "openai/gpt-4o-mini",
              tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", max_results: 6, max_total_results: 12, max_uses: 2, search_context_size: "low" } }],
              max_tool_calls: 4,
              messages: [
                { role: "system", content: "You must use openrouter:web_search to search for real direct retailer product pages for the exact product. Search using the brand, manufacturer model, identifiers, and exact variant below. Do not infer or invent a price, currency, stock status, shipping, or a retailer listing. The application will only use your web-search source citations and will independently validate them." },
                { role: "user", content: `Find retailer listings for this exact product and variant: ${JSON.stringify({ brand: item.brand, model: item.model_number, gtin: item.gtin, title: productTitle, variant: item.variant_label }).slice(0, 1000)}. Search broadly across public retailer websites.` },
              ],
            }),
          });
        } finally { clearTimeout(timeout); }
        statusCode = response.status;
        if (response.ok) {
          const result = await response.json();
          searchCount = parseOpenRouterWebSearchCount(result.usage?.server_tool_use);
          const annotations = result.choices?.[0]?.message?.annotations;
          const citations = Array.isArray(annotations) ? annotations.flatMap((annotation: any) => {
            if (annotation?.type !== "url_citation") return [];
            const citation = annotation.url_citation || annotation;
            return typeof citation.url === "string" ? [citation] : [];
          }) : [];
          resultCount = citations.length;
          outcome = "success";
          for (const citation of citations) {
            const offerUrl = String(citation.url);
            const retailer = retailerFromUrl(offerUrl);
            if (!retailer) continue;
            const sourceText = `${String(citation.title || "")} ${String(citation.content || "")}`.slice(0, 5000);
            const match = matchListing(sourceText, matchTarget);
            if (!match || !/^https?:\/\//i.test(offerUrl)) continue;
            // A search citation is a lead only. Fetch the public page through the
            // same robots-aware, SSRF-safe inspector before saving any offer.
            const domain = getRetailerDomain(offerUrl);
            if (!domain || inspectedDomains.has(domain) || retailerPagesInspected >= 3) continue;
            inspectedDomains.add(domain);
            const { data: matchedRetailers } = await admin.from("retailers").select("id,name,retry_after,seller_type,reliability_score")
              .eq("canonical_domain", domain).limit(1);
            const knownRetailer = matchedRetailers?.[0] || null;
            if (knownRetailer?.retry_after && new Date(knownRetailer.retry_after).getTime() > Date.now()) continue;
            let retailerId = knownRetailer?.id || null;
            if (!retailerId) {
              const { data: insertedRetailer } = await admin.from("retailers").insert({
                name: domain, domain, canonical_domain: domain, country_code: inferRetailerCountry(domain),
                validation_status: "pending_inspection", seller_type: classifySeller(domain),
                categories: [item.category || "fashion"], languages: [userPreferences?.language || "en"],
                discovery_source: "openrouter", discovered_by_query: "openrouter-web-search", is_supported: false,
              }).select("id").maybeSingle();
              retailerId = insertedRetailer?.id || null;
            }
            await admin.from("retailer_discovery_events").insert({
              retailer_id: retailerId, canonical_domain: domain, product_id: item.product_id || null,
              source_provider: "openrouter", source_query: "openrouter-web-search", source_url: offerUrl,
              outcome: "discovered", evidence: { citation_title: String(citation.title || "").slice(0, 300) },
            });
            retailerPagesInspected++;
            const inspection = await inspectRetailerProductPage(offerUrl, retailerDns, retailerTransport);
            const metadata = inspection.metadata;
            if (!inspection.permitted || inspection.errorCode || !metadata?.title) {
              const restricted = inspection.errorCode === "robots_restricted" || inspection.errorCode === "unsafe_url";
              if (retailerId) await admin.from("retailers").update({
              validation_status: restricted ? "restricted" : inspection.errorCode?.startsWith("http_") || ["fetch_failed", "fetch_unknown"].includes(inspection.errorCode || "") ? "temporarily_unavailable" : "discovered",
                last_inspected_at: new Date().toISOString(), last_error: inspection.errorCode || "product_metadata_missing",
                retry_after: new Date(Date.now() + (restricted ? 7 : 1) * 24 * 60 * 60 * 1000).toISOString(),
              reliability_score: Math.max(0, Number(knownRetailer?.reliability_score ?? 0.5) - (restricted ? 0.1 : 0.05)),
              }).eq("id", retailerId);
              await admin.from("retailer_discovery_events").insert({
                retailer_id: retailerId, canonical_domain: domain, product_id: item.product_id || null,
                source_provider: "openrouter", source_query: "openrouter-web-search", source_url: inspection.finalUrl,
                outcome: restricted ? "restricted" : "inspection_failed", error_code: inspection.errorCode || "product_metadata_missing",
                evidence: { status: inspection.status },
              });
              continue;
            }
            const pageTitle = [metadata.title, metadata.brand, metadata.model_number, metadata.variant_name].filter(Boolean).join(" ");
            const pageMatch = matchListing(pageTitle, matchTarget, [metadata.gtin], metadata.condition);
            const pagePrice = metadata.price;
            const pageCurrency = resolveProviderCurrency(metadata.currency || "", String(item.currency || "USD").toUpperCase());
            const validationError = productOfferEvidenceError(Boolean(pageMatch), pagePrice, pageCurrency);
            const verifiedRetailer = validationError === null && Boolean(metadata.title);
            if (retailerId) await admin.from("retailers").update({
              domain: inspection.canonicalDomain || domain, canonical_domain: inspection.canonicalDomain || domain,
              validation_status: verifiedRetailer ? "validated" : "discovered", seller_type: classifySeller(domain) === "unknown" ? knownRetailer?.seller_type || "unknown" : classifySeller(domain),
              is_supported: verifiedRetailer, last_inspected_at: new Date().toISOString(),
              last_successful_at: verifiedRetailer ? new Date().toISOString() : null,
              last_error: verifiedRetailer ? null : validationError,
              retry_after: new Date(Date.now() + (verifiedRetailer ? 7 : 1) * 24 * 60 * 60 * 1000).toISOString(),
              reliability_score: Math.min(1, Number(knownRetailer?.reliability_score ?? 0.5) + (verifiedRetailer ? 0.02 : -0.03)),
              extraction_capabilities: { title: Boolean(metadata.title), image: Boolean(metadata.image_url), price: pagePrice != null, currency: Boolean(metadata.currency), variants: metadata.variants.length > 0 },
            }).eq("id", retailerId);
            await admin.from("retailer_discovery_events").insert({
              retailer_id: retailerId, canonical_domain: inspection.canonicalDomain || domain, product_id: item.product_id || null,
              source_provider: "openrouter", source_query: "openrouter-web-search", source_url: inspection.finalUrl,
              outcome: verifiedRetailer ? "inspection_succeeded" : "inspection_failed",
              error_code: validationError,
              evidence: { title: metadata.title, has_price: pagePrice != null, currency: metadata.currency, has_image: Boolean(metadata.image_url), variant_count: metadata.variants.length },
            });
            if (!pageMatch || !pagePrice || pagePrice <= 0 || !pageCurrency) continue;
            const existing = offerRows.find((offer) => offer.url === (metadata.canonical_url || inspection.finalUrl));
            if (existing) continue;
            offerRows.push({
              item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
              store: knownRetailer?.name || retailer, seller: domain, listing_title: metadata.title.slice(0, 300), image_url: metadata.image_url,
              seller_type: classifySeller(domain) === "unknown" ? knownRetailer?.seller_type || "unknown" : classifySeller(domain),
              size_label: pageMatch.candidateSize?.label || null, size_system: pageMatch.candidateSize?.system || null, color_label: pageMatch.candidateColor,
              product_match_confidence: pageMatch.confidence, match_type: pageMatch.matchType,
              price: pagePrice, currency: pageCurrency, url: metadata.canonical_url || inspection.finalUrl,
              original_price: metadata.original_price, discount_percent: metadata.discount_percent,
              shipping_cost: 0, taxes: 0, total_price: null, shipping_known: false, taxes_known: false, total_is_estimated: true,
              destination_country: userPreferences?.country || null,
              condition: pageMatch.candidateCondition, availability: metadata.availability,
              source: "openrouter_crawled_page", last_verified_at: new Date().toISOString(),
              is_verified: pageMatch.confidence >= 0.9,
            });
          }
        } else {
          openRouterSearchError = response.status === 401
            ? "OpenRouter rejected its API key. Check OPENROUTER_API_KEY in Supabase Edge Function secrets."
            : response.status === 402
              ? "OpenRouter has insufficient credits for web search. Check the OpenRouter account balance."
              : response.status === 403
                ? "OpenRouter web search is not available for this account or model. Check its server-tool access."
                : "OpenRouter web search is temporarily unavailable.";
        }
      } catch {
        openRouterSearchError = "OpenRouter web search could not be reached.";
      } finally {
        await recordProviderMetric(admin, {
          provider: "openrouter", surface: "interactive", outcome, durationMs: Date.now() - searchStartedAt,
          resultCount, searchCount, statusCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("OPENROUTER_ESTIMATED_COST_PER_SEARCH_USD")),
          marketCountry: targetCountry,
        });
      }
      }
    }
    const uniqueOffers = await addOfferCurrencyConversions(
      [...new Map(offerRows.map((offer) => [`${offer.source}:${offer.url}`, offer])).values()].slice(0, 12),
      String(userPreferences?.currency || item.currency || "USD"),
    );
    const exactOffers = uniqueOffers.filter((offer) => offer.is_verified === true && offer.product_match_confidence >= 0.9 && !String(offer.match_type).includes("unconfirmed"));
    const possibleOfferCount = uniqueOffers.length - exactOffers.length;

    if (uniqueOffers.length) {
      const { data: saved, error } = await admin.from("store_offers").upsert(uniqueOffers, { onConflict: "item_id,source,url" }).select("id,store,price,currency,source,url,availability,last_verified_at,is_verified");
      if (error) {
        const retry = await deferPersistenceRetry(admin, item, stamp, "offer_upsert");
        return reply({ error: retry.scheduled ? "Offers were found, but Wishly could not save them. A retry is scheduled." : "Offers were found, but Wishly could not save them or schedule a retry.", retry_scheduled: retry.scheduled }, 503);
      }
      const history = await recordOfferPriceObservations(admin, item.id, saved || [], stamp);
      if (history.failed) {
        const retry = await deferPersistenceRetry(admin, item, stamp, "price_history");
        return reply({ error: retry.scheduled ? "Offers were saved, but their price history could not be recorded. A retry is scheduled." : "Offers were saved, but their price history could not be recorded or scheduled for retry.", retry_scheduled: retry.scheduled }, 503);
      }
    }
    const status = exactOffers.length ? "offers_available" : possibleOfferCount ? "partial" : "no_matches";
    const errorMessage = exactOffers.length
      ? null
      : possibleOfferCount
        ? `Found ${possibleOfferCount} retailer-search result${possibleOfferCount === 1 ? "" : "s"}, but none has been confirmed on its product page yet.`
        : searxngSearchError
          ? searxngSearchError
        : tavilySearchError && allowExpandedSearch
          ? tavilySearchError
          : openRouterSearchError && allowExpandedSearch
            ? openRouterSearchError
        : shoppingBudgetReached && !openRouterEnabled && shoppingSearchError
          ? shoppingSearchError
        : openRouterSearchError || (openRouterSearchAttempted
          ? shoppingSearchError
            ? `Web search did not find a verifiable retailer price. Google Shopping: ${shoppingSearchError}`
            : "Web search found no retailer listing with a verifiable price."
          : searxngSearchAttempted
            ? "SearXNG leads were inspected, but no exact offer with a verifiable price was found."
          : !openRouterEnabled && apiKey
            ? shoppingFailures
              ? shoppingSearchError || "Google Shopping could not complete this search."
              : "No strong match was found in Google Shopping. Add OPENROUTER_API_KEY to Supabase Edge Function secrets to enable broader web search."
            : !openRouterEnabled && !apiKey
              ? "No search provider is configured. Add SERPAPI_KEY for Google Shopping and OPENROUTER_API_KEY for broader web search."
              : shoppingSearchError || "No exact retailer listing was found in the configured search sources.");
    await admin.from("items").update({ enrichment_status: status, offers_last_checked_at: stamp, enrichment_error: errorMessage }).eq("id", item.id);
    const refreshIntervalHours = item.target_price != null ? 2 : 6;
    await admin.from("items").update({
      last_offer_search_at: stamp,
      next_offer_search_at: new Date(Date.parse(stamp) + refreshIntervalHours * 60 * 60 * 1000).toISOString(),
    }).eq("id", item.id);
    if (item.product_id) await admin.from("products").update({ offers_last_checked_at: stamp, offer_search_status: status }).eq("id", item.product_id);
    const durationMs = Date.now() - researchStartedAt;
    const webSearchCount = openRouterSearchAttempted ? 1 : 0;
    console.info(JSON.stringify({ event: "wishly_offer_research", providers: [apiKey ? "serpapi_google_shopping" : null, tavilySearchAttempted ? "tavily" : null, searxngSearchAttempted ? "searxng" : null, webSearchCount ? "openrouter_web_search" : null].filter(Boolean), provider_queries: shoppingQueryCount + tavilyQueriesCount + searxngQueriesCount + webSearchCount, shopping_queries: shoppingQueryCount, tavily_queries: tavilyQueriesCount, searxng_queries: searxngQueriesCount, retailer_pages_inspected: retailerPagesInspected, web_searches: webSearchCount, provider_failures: shoppingFailures + (tavilySearchError ? 1 : 0) + (searxngSearchError ? 1 : 0) + (openRouterSearchError ? 1 : 0), daily_budget_reached: shoppingBudgetReached || Boolean(tavilySearchError?.includes("daily Tavily")) || Boolean(searxngSearchError?.includes("daily SearXNG")) || Boolean(openRouterSearchError?.includes("daily web-search budget")), offers_found: uniqueOffers.length, exact_offers_found: exactOffers.length, duration_ms: durationMs }));
    return reply({
      configured: Boolean(apiKey || searxngBaseUrl || (tavilyEnabled && tavilyKey) || (openRouterEnabled && openRouterKey)), status, offers_found: uniqueOffers.length,
      exact_offers_found: exactOffers.length, possible_offers_found: possibleOfferCount,
      provider_queries: shoppingQueryCount + tavilyQueriesCount + searxngQueriesCount + webSearchCount, shopping_queries: shoppingQueryCount,
      tavily_queries: tavilyQueriesCount, searxng_queries: searxngQueriesCount, retailer_pages_inspected: retailerPagesInspected, web_searches: webSearchCount,
      provider_failures: shoppingFailures + (tavilySearchError ? 1 : 0) + (searxngSearchError ? 1 : 0) + (openRouterSearchError ? 1 : 0), duration_ms: durationMs,
      daily_budget_reached: shoppingBudgetReached || Boolean(tavilySearchError?.includes("daily Tavily")) || Boolean(searxngSearchError?.includes("daily SearXNG")) || Boolean(openRouterSearchError?.includes("daily web-search budget")),
      search_sources: [apiKey ? "google_shopping" : null, tavilySearchAttempted ? "tavily" : null, searxngSearchAttempted ? "searxng" : null, openRouterSearchAttempted ? "openrouter_web_search" : null].filter(Boolean),
      error: errorMessage,
    });
  } catch {
    return reply({ error: "Could not refresh product offers." }, 500);
  }
});
