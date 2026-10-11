import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const refreshes = new Map<string, { start: number; count: number }>();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const currencyFromPrice = (price: string, fallback: string) => /€|\bEUR\b/i.test(price) ? "EUR" : /£|\bGBP\b/i.test(price) ? "GBP" : /د\.م|MAD/i.test(price) ? "MAD" : /¥|\bJPY\b/i.test(price) ? "JPY" : /\bCAD\b/i.test(price) ? "CAD" : /\bAUD\b/i.test(price) ? "AUD" : fallback;
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
    if (!apiKey) {
      await userClient.from("items").update({ enrichment_status: "partial" }).eq("id", item.id);
      return reply({ configured: false, status: "partial", offers_found: 0 });
    }

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
    const searchUrl = new URL("https://serpapi.com/search.json");
    searchUrl.searchParams.set("engine", "google_shopping");
    searchUrl.searchParams.set("q", query);
    const markets: Record<string, { gl: string; hl: string }> = { MAD: { gl: "ma", hl: "fr" }, EUR: { gl: "fr", hl: "fr" }, GBP: { gl: "gb", hl: "en" }, CAD: { gl: "ca", hl: "en" }, AUD: { gl: "au", hl: "en" }, JPY: { gl: "jp", hl: "ja" }, USD: { gl: "us", hl: "en" } };
    const market = markets[String(item.currency || "USD").toUpperCase()] || markets.USD;
    searchUrl.searchParams.set("gl", market.gl);
    searchUrl.searchParams.set("hl", market.hl);
    searchUrl.searchParams.set("api_key", apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let searchResponse: Response;
    try { searchResponse = await fetch(searchUrl, { signal: controller.signal }); }
    finally { clearTimeout(timeout); }
    if (!searchResponse.ok) return reply({ configured: true, status: "partial", offers_found: 0, error: "Shopping provider is temporarily unavailable." }, 502);
    const payload = await searchResponse.json();
    const rows = Array.isArray(payload.shopping_results) ? payload.shopping_results : [];
    const targetGtin = normalizedDigits(item.gtin);
    const targetModel = String(item.model_number || "").toLowerCase();
    const targetCapacity = variantValue(productTitle, /\b\d+\s*(?:gb|tb|mb)\b/i);
    const targetColor = variantValue(productTitle, /\b(?:black|white|silver|gold|blue|red|green|yellow|purple|pink|midnight|starlight|graphite|natural titanium|desert titanium)\b/i);
    const stamp = new Date().toISOString();
    const offerRows = rows.flatMap((row: any) => {
      const title = String(row.title || "");
      const titleLower = title.toLowerCase();
      const rowGtinValues = [row.gtin, row.upc, row.ean].map(normalizedDigits).filter(Boolean);
      const gtinMatch = targetGtin && rowGtinValues.includes(targetGtin);
      const modelMatch = targetModel && new RegExp(`(^|\\W)${escapeRegex(targetModel)}($|\\W)`, "i").test(title);
      const brandMatch = !item.brand || titleLower.includes(String(item.brand).toLowerCase());
      if (!gtinMatch && !(modelMatch && brandMatch)) return [];
      if (targetGtin && rowGtinValues.length && !gtinMatch) return [];
      const candidateCapacity = variantValue(title, /\b\d+\s*(?:gb|tb|mb)\b/i);
      const candidateColor = variantValue(title, /\b(?:black|white|silver|gold|blue|red|green|yellow|purple|pink|midnight|starlight|graphite|natural titanium|desert titanium)\b/i);
      const rowSizeText = String(row.size || row.extensions?.find?.((value: unknown) => typeof value === "string" && /\b(?:size|shoe\s+size|EU|UK|US|CM|MM)\b/i.test(value)) || "");
      const candidateSize = sizeVariant(rowSizeText) || sizeVariant(title);
      const candidateGender = genderVariant(title);
      if (targetCapacity && targetCapacity !== candidateCapacity) return [];
      if (targetColor && targetColor !== candidateColor) return [];
      if (targetGender && candidateGender && targetGender !== candidateGender) return [];
      if (targetSize && (!candidateSize || targetSize.label !== candidateSize.label || (targetSize.system && candidateSize.system && targetSize.system !== candidateSize.system))) return [];
      if (/\b(used|refurbished|renewed|open box|pre-owned|replacement|compatible|case for|cover for)\b/i.test(title)) return [];
      const price = Number(row.extracted_price);
      const oldPriceRaw = row.extracted_old_price ?? (typeof row.old_price === "number" ? row.old_price : null);
      const oldPriceText = String(oldPriceRaw ?? "").replace(/[^\d.,-]/g, "");
      const oldPriceNormalized = oldPriceText.includes(".") && oldPriceText.includes(",")
        ? (oldPriceText.lastIndexOf(",") > oldPriceText.lastIndexOf(".") ? oldPriceText.replace(/\./g, "").replace(",", ".") : oldPriceText.replace(/,/g, ""))
        : oldPriceText.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
      const originalPrice = Number(oldPriceNormalized);
      const offerUrl = typeof row.link === "string" ? row.link : "";
      if (!Number.isFinite(price) || price <= 0 || !/^https?:\/\//i.test(offerUrl)) return [];
      const sizeInfo = candidateSize;
      return [{
        item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
        store: String(row.source || "Retailer").slice(0, 120), seller: String(row.source || "Retailer").slice(0, 120),
          listing_title: title, image_url: typeof row.thumbnail === "string" ? row.thumbnail : null,
          size_label: sizeInfo?.label || null, size_system: sizeInfo?.system || null, color_label: candidateColor,
          product_match_confidence: gtinMatch ? 1 : 0.9, match_type: gtinMatch ? "gtin" : "brand_model_variant",
          price, currency: currencyFromPrice(String(row.price || ""), market.currency), url: offerUrl,
        original_price: Number.isFinite(originalPrice) && originalPrice > price ? originalPrice : null,
        discount_percent: Number.isFinite(originalPrice) && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : null,
        shipping_cost: 0, taxes: 0, total_price: null,
        shipping_known: false, taxes_known: false, total_is_estimated: true,
        condition: /\b(refurbished|renewed)\b/i.test(title) ? "refurbished" : /\b(used|open box|pre-owned)\b/i.test(title) ? "used" : "unknown",
        availability: "unknown", source: "google_shopping", last_verified_at: stamp,
      }];
    }).slice(0, 8);

    if (offerRows.length) {
      const { data: saved, error } = await admin.from("store_offers").upsert(offerRows, { onConflict: "item_id,source,url" }).select("id,store,price,currency,source,url,availability,last_verified_at");
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
    const status = offerRows.length ? "offers_available" : "no_matches";
    await admin.from("items").update({ enrichment_status: status, offers_last_checked_at: stamp, enrichment_error: null }).eq("id", item.id);
    await admin.from("items").update({ last_offer_search_at: stamp }).eq("id", item.id);
    if (item.product_id) await admin.from("products").update({ offers_last_checked_at: stamp, offer_search_status: status }).eq("id", item.product_id);
    return reply({ configured: true, status: offerRows.length ? "offers_available" : "no_matches", offers_found: offerRows.length });
  } catch {
    return reply({ error: "Could not refresh product offers." }, 500);
  }
});
