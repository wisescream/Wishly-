import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { confirmsGenderVariant, getGenderVariant } from "../_shared/gender-variant.ts";
import { calculateTotalPurchaseCost, parseShippingEstimate } from "../_shared/offer-cost.ts";
import { addOfferCurrencyConversions } from "../_shared/exchange-rate.ts";
import { parseEstimatedUnitCost, parseOpenRouterWebSearchCount, recordProviderMetric } from "../_shared/provider-metrics.ts";
import { parseSerpApiShoppingResponse } from "../_shared/serpapi.ts";
import { resolveProviderCurrency } from "../_shared/provider-currency.ts";
import { parseWebSnippetPrice as parsedPrice } from "../_shared/web-search.ts";
import { buildProductSearchQueries } from "../_shared/product-search.ts";
import { deferPersistenceRetry, recordOfferPriceObservations } from "../_shared/research-persistence.ts";
import { compareProductConditions, normalizeProductCondition } from "../_shared/product-condition.ts";

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
const ignoredTitleWords = new Set(["the", "and", "for", "with", "from", "new", "official", "shop", "buy", "online", "price", "free", "shipping", "sale", "best", "deal", "product", "original"]);
const normalizedWords = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];
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
    const { item_id, force_refresh } = await req.json();
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
    const markets: Record<string, { gl: string; hl: string }> = { MAD: { gl: "ma", hl: "fr" }, EUR: { gl: "fr", hl: "fr" }, GBP: { gl: "gb", hl: "en" }, CAD: { gl: "ca", hl: "en" }, AUD: { gl: "au", hl: "en" }, JPY: { gl: "jp", hl: "ja" }, USD: { gl: "us", hl: "en" }, INR: { gl: "in", hl: "en" }, CNY: { gl: "cn", hl: "zh-CN" }, CHF: { gl: "ch", hl: "de" }, AED: { gl: "ae", hl: "en" } };
    const countryMarkets: Record<string, { gl: string; hl: string }> = { MA: markets.MAD, US: markets.USD, GB: markets.GBP, CA: markets.CAD, AU: markets.AUD, JP: markets.JPY, FR: markets.EUR, DE: { gl: "de", hl: "de" }, CH: markets.CHF, IN: markets.INR, CN: markets.CNY, AE: markets.AED };
    const targetCountry = String(userPreferences?.country || "").toUpperCase();
    const countryDefault = targetCountry ? { gl: targetCountry.toLowerCase(), hl: "en" } : null;
    const market = { ...(countryMarkets[targetCountry] || countryDefault || markets[String(item.currency || "USD").toUpperCase()] || markets.USD) };
    if (userPreferences?.language && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(userPreferences.language)) market.hl = userPreferences.language;
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
        searchUrl.searchParams.set("api_key", apiKey);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        shoppingQueryCount++;
        const searchStartedAt = Date.now();
        let resultCount = 0;
        let statusCode: number | null = null;
        let outcome: "success" | "error" = "error";
        try {
          const searchResponse = await fetch(searchUrl, { signal: controller.signal });
          statusCode = searchResponse.status;
          if (!searchResponse.ok) {
            shoppingFailures++;
            shoppingSearchError = searchResponse.status === 429 ? "The Google Shopping provider rate limit was reached." : "Google Shopping is temporarily unavailable.";
          }
          else {
            const payload = await searchResponse.json();
            const parsed = parseSerpApiShoppingResponse(payload);
            if (parsed.error) {
              shoppingFailures++;
              shoppingSearchError = "Google Shopping could not complete this search.";
            }
            else {
              const rows = parsed.rows as any[];
              resultCount = rows.length;
              outcome = "success";
              shoppingRows.push(...rows);
              const hasStrongMatch = rows.some((row: any) => matchListing(
                `${String(row.title || "")} ${[row.size, ...(Array.isArray(row.extensions) ? row.extensions : [])].filter((part) => typeof part === "string").join(" ")}`,
                matchTarget,
                [row.gtin, row.upc, row.ean],
                row.condition,
              )?.confidence >= 0.9);
              if (hasStrongMatch) break;
            }
          }
        } catch {
          shoppingFailures++;
          shoppingSearchError = "Google Shopping could not be reached.";
        } finally {
          clearTimeout(timeout);
          await recordProviderMetric(admin, {
            provider: "serpapi", surface: "interactive", outcome, durationMs: Date.now() - searchStartedAt,
            resultCount, statusCode, unitCostUsd: parseEstimatedUnitCost(Deno.env.get("SERPAPI_ESTIMATED_COST_PER_SEARCH_USD")),
            marketCountry: targetCountry,
          });
        }
      }
    } else shoppingSearchError = "Google Shopping is not configured.";

    const stamp = new Date().toISOString();
    const offerRows = shoppingRows.flatMap((row: any) => {
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

    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    let openRouterSearchAttempted = false;
    let openRouterSearchError: string | null = null;
    if (!offerRows.some((offer) => offer.product_match_confidence >= 0.9) && openRouterKey) {
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
            const price = parsedPrice(sourceText, String(item.currency || "USD").toUpperCase());
            if (!match || !price || !/^https?:\/\//i.test(offerUrl)) continue;
            const existing = offerRows.find((offer) => offer.url === offerUrl);
            if (existing) {
              if (match.confidence > existing.product_match_confidence) {
                existing.product_match_confidence = match.confidence;
                existing.match_type = match.matchType;
              }
              continue;
            }
            offerRows.push({
              item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
              store: retailer, seller: retailer, listing_title: String(citation.title || retailer).slice(0, 300), image_url: null,
              size_label: match.candidateSize?.label || null, size_system: match.candidateSize?.system || null, color_label: match.candidateColor,
              product_match_confidence: Math.min(match.confidence, 0.88), match_type: match.exact ? "web_citation_exact_candidate" : match.matchType,
              price: price.amount, currency: price.currency, url: offerUrl,
              original_price: null, discount_percent: null, shipping_cost: 0, taxes: 0, total_price: null,
              shipping_known: false, taxes_known: false, total_is_estimated: true,
              destination_country: userPreferences?.country || null,
              condition: "unknown", availability: "unknown", source: "openrouter_web_search", last_verified_at: stamp,
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
        : shoppingBudgetReached && !openRouterKey && shoppingSearchError
          ? shoppingSearchError
        : openRouterSearchError || (openRouterSearchAttempted
          ? shoppingSearchError
            ? `Web search did not find a verifiable retailer price. Google Shopping: ${shoppingSearchError}`
            : "Web search found no retailer listing with a verifiable price."
          : !openRouterKey && apiKey
            ? shoppingFailures
              ? shoppingSearchError || "Google Shopping could not complete this search."
              : "No strong match was found in Google Shopping. Add OPENROUTER_API_KEY to Supabase Edge Function secrets to enable broader web search."
            : !openRouterKey && !apiKey
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
    console.info(JSON.stringify({ event: "wishly_offer_research", providers: [apiKey ? "serpapi_google_shopping" : null, webSearchCount ? "openrouter_web_search" : null].filter(Boolean), provider_queries: shoppingQueryCount + webSearchCount, shopping_queries: shoppingQueryCount, web_searches: webSearchCount, provider_failures: shoppingFailures + (openRouterSearchError ? 1 : 0), daily_budget_reached: shoppingBudgetReached || Boolean(openRouterSearchError?.includes("daily web-search budget")), offers_found: uniqueOffers.length, exact_offers_found: exactOffers.length, duration_ms: durationMs }));
    return reply({
      configured: Boolean(apiKey || openRouterKey), status, offers_found: uniqueOffers.length,
      exact_offers_found: exactOffers.length, possible_offers_found: possibleOfferCount,
      provider_queries: shoppingQueryCount + webSearchCount, shopping_queries: shoppingQueryCount, web_searches: webSearchCount,
      provider_failures: shoppingFailures + (openRouterSearchError ? 1 : 0), duration_ms: durationMs,
      daily_budget_reached: shoppingBudgetReached || Boolean(openRouterSearchError?.includes("daily web-search budget")),
      search_sources: [apiKey ? "google_shopping" : null, openRouterSearchAttempted ? "openrouter_web_search" : null].filter(Boolean),
      error: errorMessage,
    });
  } catch {
    return reply({ error: "Could not refresh product offers." }, 500);
  }
});
