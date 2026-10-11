import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const refreshes = new Map<string, { start: number; count: number }>();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const currencyFromPrice = (price: string, fallback: string) => /€|\bEUR\b/i.test(price) ? "EUR" : /£|\bGBP\b/i.test(price) ? "GBP" : /د\.م|MAD/i.test(price) ? "MAD" : /¥|\bJPY\b/i.test(price) ? "JPY" : /\bCAD\b|C\$/i.test(price) ? "CAD" : /\bAUD\b|A\$/i.test(price) ? "AUD" : /\bCHF\b/i.test(price) ? "CHF" : /\bAED\b/i.test(price) ? "AED" : /\bSAR\b/i.test(price) ? "SAR" : /\bCNY\b/i.test(price) ? "CNY" : fallback;
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
const genderVariant = (value: string) => /\b(?:women'?s|female)\b/i.test(value) ? "women" : /\b(?:men'?s|male)\b/i.test(value) ? "men" : /\bunisex\b/i.test(value) ? "unisex" : null;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ignoredTitleWords = new Set(["the", "and", "for", "with", "from", "new", "official", "shop", "buy", "online", "price", "free", "shipping", "sale", "best", "deal", "product", "original"]);
const normalizedWords = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];
const parsedPrice = (text: string, fallbackCurrency: string): { amount: number; currency: string } | null => {
  const match = text.match(/(?:USD|EUR|GBP|MAD|CAD|AUD|JPY|CHF|AED|SAR|CNY|\$|€|£|¥|د\.م\.?|C\$|A\$)\s*([\d][\d., ]{0,14})|([\d][\d., ]{0,14})\s*(USD|EUR|GBP|MAD|CAD|AUD|JPY|CHF|AED|SAR|CNY)/i);
  if (!match) return null;
  const marker = String(match[0]).replace(/[\d\s.,]/g, "").toUpperCase();
  let currency = /EUR|€/.test(marker) ? "EUR" : /GBP|£/.test(marker) ? "GBP" : /MAD|د\.م/.test(marker) ? "MAD" : /JPY|¥/.test(marker) ? "JPY" : /CAD|C\$/.test(marker) ? "CAD" : /AUD|A\$/.test(marker) ? "AUD" : /CHF/.test(marker) ? "CHF" : /AED/.test(marker) ? "AED" : /SAR/.test(marker) ? "SAR" : /CNY/.test(marker) ? "CNY" : marker.includes("$") && ["USD", "CAD", "AUD"].includes(fallbackCurrency) ? fallbackCurrency : /USD/.test(marker) ? "USD" : "";
  if (!currency) return null;
  const raw = (match[1] || match[2] || "").replace(/\s/g, "");
  const normalized = raw.includes(".") && raw.includes(",")
    ? (raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, ""))
    : raw.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? { amount, currency } : null;
};

function matchListing(title: string, target: { title: string; brand: string; model: string; gtin: string; capacity: string | null; color: string | null; size: { label: string; system: string | null } | null; gender: string | null }, candidateIds: unknown[] = []) {
  const candidateDigits = candidateIds.map(normalizedDigits).filter(Boolean);
  const candidateGtinMatch = Boolean(target.gtin && candidateDigits.includes(target.gtin));
  if (target.gtin && candidateDigits.length && !candidateGtinMatch) return null;
  const lower = title.toLowerCase();
  const modelMatch = Boolean(target.model && new RegExp(`(^|\\W)${escapeRegex(target.model)}($|\\W)`, "i").test(title));
  const brandWords = normalizedWords(target.brand);
  const candidateWords = new Set(normalizedWords(title));
  const brandMatch = !brandWords.length || brandWords.every((word) => candidateWords.has(word));
  if (!brandMatch) return null;
  const candidateCapacity = variantValue(title, /\b\d+\s*(?:gb|tb|mb)\b/i);
  const candidateColor = variantValue(title, /\b(?:black|white|silver|gold|blue|red|green|yellow|purple|pink|midnight|starlight|graphite|natural titanium|desert titanium)\b/i);
  const candidateSize = sizeVariant(title);
  const candidateGender = genderVariant(title);
  if (target.capacity && candidateCapacity && target.capacity !== candidateCapacity) return null;
  if (target.color && candidateColor && target.color !== candidateColor) return null;
  if (target.size && candidateSize && (target.size.label !== candidateSize.label || (target.size.system && candidateSize.system && target.size.system !== candidateSize.system))) return null;
  if (target.gender && candidateGender && target.gender !== candidateGender) return null;
  if (/\b(used|refurbished|renewed|open box|pre-owned|replacement|compatible|case for|cover for)\b/i.test(lower)) return null;

  const targetWords = [...new Set(normalizedWords([target.brand, target.model, target.title].filter(Boolean).join(" ")))]
    .filter((word) => !ignoredTitleWords.has(word) && !brandWords.includes(word) && word.length > 1);
  const matchedWords = targetWords.filter((word) => candidateWords.has(word));
  const coverage = targetWords.length ? matchedWords.length / targetWords.length : 0;
  const codedModels = targetWords.filter((word) => /[a-z]/.test(word) && /\d/.test(word) && word.length >= 4);
  const codedModelMatch = codedModels.some((word) => candidateWords.has(word));
  const variantMissing = Boolean((target.capacity && !candidateCapacity) || (target.color && !candidateColor) || (target.size && !candidateSize));
  if (candidateGtinMatch) return { confidence: 1, matchType: "gtin", exact: true, candidateCapacity, candidateColor, candidateSize };
  if (target.model && modelMatch) return { confidence: variantMissing ? 0.86 : 0.96, matchType: variantMissing ? "model_variant_unconfirmed" : "brand_model_variant", exact: !variantMissing, candidateCapacity, candidateColor, candidateSize };
  if (codedModelMatch && coverage >= 0.75) return { confidence: variantMissing ? 0.82 : 0.91, matchType: variantMissing ? "title_model_variant_unconfirmed" : "title_model", exact: !variantMissing, candidateCapacity, candidateColor, candidateSize };
  if (targetWords.length >= 2 && coverage >= 0.7) return { confidence: Math.min(0.84, 0.62 + coverage * 0.22), matchType: "title_similarity", exact: false, candidateCapacity, candidateColor, candidateSize };
  return null;
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
    const { item_id } = await req.json();
    if (typeof item_id !== "string") return reply({ error: "Wishlist item id is required." }, 400);

    const { data: item } = await userClient.from("items")
      .select("id,title,brand,model_number,gtin,product_id,variant_id,variant_label,category,url,currency,offers_last_checked_at,wishlists!inner(owner_id)")
      .eq("id", item_id).maybeSingle();
    const owner = (item?.wishlists as unknown as { owner_id?: string } | null)?.owner_id;
    if (!item || owner !== userData.user.id) return reply({ error: "Wishlist item not found." }, 404);
    const now = Date.now();
    const window = refreshes.get(userData.user.id);
    if (window && now - window.start < 5 * 60 * 1000 && window.count >= 10) return reply({ error: "Offer refresh limit reached. Try again later." }, 429);
    refreshes.set(userData.user.id, !window || now - window.start >= 5 * 60 * 1000 ? { start: now, count: 1 } : { ...window, count: window.count + 1 });
    if (refreshes.size > 5_000) for (const [id, entry] of refreshes) if (now - entry.start > 5 * 60 * 1000) refreshes.delete(id);
    const apiKey = Deno.env.get("SERPAPI_KEY");

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    const productCache = item.product_id
      ? (await admin.from("products").select("offers_last_checked_at,offer_search_status").eq("id", item.product_id).maybeSingle()).data
      : null;
    const lastChecked = productCache?.offers_last_checked_at || item.offers_last_checked_at;
    if (lastChecked && new Date(lastChecked).getTime() > cutoff) {
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
          await admin.from("store_offers").upsert(copies, { onConflict: "item_id,source,url" });
          const count = (await userClient.from("store_offers").select("id", { count: "exact", head: true }).eq("item_id", item.id)).count || 0;
          if (count) return reply({ configured: true, cached: true, status: productCache?.offer_search_status || "partial", offers_found: count });
        }
      }
    }

    const variant = item.variant_id ? (await userClient.from("product_variants").select("name").eq("id", item.variant_id).maybeSingle()).data?.name : "";
    const productTitle = [item.title, variant].filter(Boolean).join(" ");
    const targetSize = sizeVariant(item.variant_label) || sizeVariant(variant);
    const targetGender = genderVariant(productTitle);
    const query = [item.brand, item.model_number, productTitle].filter(Boolean).join(" ").slice(0, 240);
    const markets: Record<string, { gl: string; hl: string }> = { MAD: { gl: "ma", hl: "fr" }, EUR: { gl: "fr", hl: "fr" }, GBP: { gl: "gb", hl: "en" }, CAD: { gl: "ca", hl: "en" }, AUD: { gl: "au", hl: "en" }, JPY: { gl: "jp", hl: "ja" }, USD: { gl: "us", hl: "en" } };
    const market = markets[String(item.currency || "USD").toUpperCase()] || markets.USD;
    const searchAttemptAt = new Date().toISOString();
    const targetGtin = normalizedDigits(item.gtin);
    const targetModel = String(item.model_number || "").toLowerCase();
    const targetCapacity = variantValue(productTitle, /\b\d+\s*(?:gb|tb|mb)\b/i);
    const targetColor = variantValue(productTitle, /\b(?:black|white|silver|gold|blue|red|green|yellow|purple|pink|midnight|starlight|graphite|natural titanium|desert titanium)\b/i);
    const matchTarget = { title: productTitle, brand: String(item.brand || ""), model: targetModel, gtin: targetGtin, capacity: targetCapacity, color: targetColor, size: targetSize, gender: targetGender };
    let shoppingRows: any[] = [];
    let shoppingSearchError: string | null = null;
    if (apiKey) {
      const searchUrl = new URL("https://serpapi.com/search.json");
      searchUrl.searchParams.set("engine", "google_shopping");
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("gl", market.gl);
      searchUrl.searchParams.set("hl", market.hl);
      searchUrl.searchParams.set("api_key", apiKey);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const searchResponse = await fetch(searchUrl, { signal: controller.signal });
        if (!searchResponse.ok) shoppingSearchError = searchResponse.status === 429 ? "The Google Shopping provider rate limit was reached." : "Google Shopping is temporarily unavailable.";
        else {
          const payload = await searchResponse.json();
          if (typeof payload.error === "string" && payload.error.trim()) shoppingSearchError = "Google Shopping could not complete this search.";
          else shoppingRows = Array.isArray(payload.shopping_results) ? payload.shopping_results : [];
        }
      } catch {
        shoppingSearchError = "Google Shopping could not be reached.";
      } finally { clearTimeout(timeout); }
    } else shoppingSearchError = "Google Shopping is not configured.";

    const stamp = new Date().toISOString();
    const offerRows = shoppingRows.flatMap((row: any) => {
      const title = String(row.title || "");
      const extra = [row.size, ...(Array.isArray(row.extensions) ? row.extensions : [])].filter((part) => typeof part === "string").join(" ");
      const match = matchListing(`${title} ${extra}`, matchTarget, [row.gtin, row.upc, row.ean]);
      const price = Number(row.extracted_price);
      const offerUrl = typeof row.link === "string" ? row.link : "";
      if (!match || !Number.isFinite(price) || price <= 0 || !/^https?:\/\//i.test(offerUrl)) return [];
      const oldPrice = Number(row.extracted_old_price);
      return [{
        item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
        store: String(row.source || retailerFromUrl(offerUrl) || "Retailer").slice(0, 120), seller: String(row.source || "Retailer").slice(0, 120),
        listing_title: title, image_url: typeof row.thumbnail === "string" ? row.thumbnail : null,
        size_label: match.candidateSize?.label || null, size_system: match.candidateSize?.system || null, color_label: match.candidateColor,
        product_match_confidence: match.confidence, match_type: match.matchType,
        price, currency: currencyFromPrice(String(row.price || ""), String(item.currency || "USD").toUpperCase()), url: offerUrl,
        original_price: Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : null,
        discount_percent: Number.isFinite(oldPrice) && oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : null,
        shipping_cost: 0, taxes: 0, total_price: null,
        shipping_known: false, taxes_known: false, total_is_estimated: true,
        condition: /\b(refurbished|renewed)\b/i.test(title) ? "refurbished" : /\b(used|open box|pre-owned)\b/i.test(title) ? "used" : "unknown",
        availability: "unknown", source: "google_shopping", last_verified_at: stamp,
      }];
    });

    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    let openRouterSearchAttempted = false;
    let openRouterSearchError: string | null = null;
    if (!offerRows.some((offer) => offer.product_match_confidence >= 0.9) && openRouterKey) {
      openRouterSearchAttempted = true;
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
        if (response.ok) {
          const result = await response.json();
          const annotations = result.choices?.[0]?.message?.annotations;
          const citations = Array.isArray(annotations) ? annotations.flatMap((annotation: any) => {
            if (annotation?.type !== "url_citation") return [];
            const citation = annotation.url_citation || annotation;
            return typeof citation.url === "string" ? [citation] : [];
          }) : [];
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
      }
    }
    const uniqueOffers = [...new Map(offerRows.map((offer) => [`${offer.source}:${offer.url}`, offer])).values()].slice(0, 12);
    const exactOffers = uniqueOffers.filter((offer) => offer.product_match_confidence >= 0.9 && !String(offer.match_type).includes("unconfirmed"));
    const possibleOfferCount = uniqueOffers.length - exactOffers.length;

    if (uniqueOffers.length) {
      const { data: saved, error } = await admin.from("store_offers").upsert(uniqueOffers, { onConflict: "item_id,source,url" }).select("id,store,price,currency,source,url,availability,last_verified_at");
      if (error) throw error;
      if (saved?.length) {
        const comparableHistory = saved.filter((offer) => offer.currency === item.currency);
        if (comparableHistory.length) {
          await Promise.all(comparableHistory.map((offer) => admin.rpc("record_price_observation", {
            p_item_id: item.id, p_offer_id: offer.id, p_price: offer.price, p_store: offer.store,
            p_currency: offer.currency, p_source: offer.source, p_source_url: offer.url,
            p_availability: offer.availability, p_is_verified: false, p_recorded_at: offer.last_verified_at,
          })));
        }
      }
    }
    const status = exactOffers.length ? "offers_available" : possibleOfferCount ? "partial" : "no_matches";
    const errorMessage = exactOffers.length
      ? null
      : possibleOfferCount
        ? `Found ${possibleOfferCount} possible retailer listing${possibleOfferCount === 1 ? "" : "s"}; confirm the exact model, variant, and current price on the retailer page.`
        : !openRouterKey && apiKey
          ? "No strong match was found in Google Shopping. Add OPENROUTER_API_KEY to Supabase Edge Function secrets to enable broader web search."
          : !openRouterKey && !apiKey
            ? "No search provider is configured. Add SERPAPI_KEY for Google Shopping and OPENROUTER_API_KEY for broader web search."
            : openRouterSearchError || shoppingSearchError || "No exact retailer listing was found in the configured Google Shopping and web search sources.";
    await admin.from("items").update({ enrichment_status: status, offers_last_checked_at: stamp, enrichment_error: errorMessage }).eq("id", item.id);
    await admin.from("items").update({ last_offer_search_at: stamp }).eq("id", item.id);
    if (item.product_id) await admin.from("products").update({ offers_last_checked_at: stamp, offer_search_status: status }).eq("id", item.product_id);
    return reply({
      configured: Boolean(apiKey || openRouterKey), status, offers_found: uniqueOffers.length,
      exact_offers_found: exactOffers.length, possible_offers_found: possibleOfferCount,
      search_sources: [apiKey ? "google_shopping" : null, openRouterSearchAttempted ? "openrouter_web_search" : null].filter(Boolean),
      error: errorMessage,
    });
  } catch {
    return reply({ error: "Could not refresh product offers." }, 500);
  }
});
