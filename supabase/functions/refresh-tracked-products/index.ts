import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-price-check-secret" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const currencyMarket: Record<string, { gl: string; currency: string }> = {
  MAD: { gl: "ma", currency: "MAD" }, USD: { gl: "us", currency: "USD" }, EUR: { gl: "fr", currency: "EUR" },
  GBP: { gl: "gb", currency: "GBP" }, CAD: { gl: "ca", currency: "CAD" }, AUD: { gl: "au", currency: "AUD" },
  JPY: { gl: "jp", currency: "JPY" }, CNY: { gl: "cn", currency: "CNY" }, INR: { gl: "in", currency: "INR" },
  CHF: { gl: "ch", currency: "CHF" }, SEK: { gl: "se", currency: "SEK" }, NOK: { gl: "no", currency: "NOK" },
  DKK: { gl: "dk", currency: "DKK" }, PLN: { gl: "pl", currency: "PLN" }, AED: { gl: "ae", currency: "AED" },
};
const symbolCurrency = (text: string, fallback: string) => /€|\bEUR\b/i.test(text) ? "EUR" : /£|\bGBP\b/i.test(text) ? "GBP" : /د\.م|\bMAD\b/i.test(text) ? "MAD" : /¥|\bJPY\b/i.test(text) ? "JPY" : /\bCAD\b/i.test(text) ? "CAD" : /\bAUD\b/i.test(text) ? "AUD" : /\$/.test(text) ? fallback : fallback;
const capacity = (value: string) => value.match(/\b\d+\s*(?:gb|tb|mb)\b/i)?.[0].replace(/\s/g, "").toLowerCase() || null;
const color = (value: string) => value.match(/\b(?:black|white|silver|gold|blue|red|green|yellow|purple|pink|midnight|starlight|graphite|natural titanium|desert titanium)\b/i)?.[0].toLowerCase() || null;
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("SERPAPI_KEY");
    if (!url || !serviceKey) return json({ error: "Service is not configured." }, 503);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = req.headers.get("x-price-check-secret");
    if (!token || token.length > 256) return json({ error: "Unauthorized scheduled invocation." }, 401);
    const { data: authorized, error: authError } = await admin.rpc("is_valid_price_check_secret", { p_candidate: token });
    if (authError || authorized !== true) return json({ error: "Unauthorized scheduled invocation." }, 401);
    if (!apiKey) return json({ error: "Shopping discovery is not configured." }, 503);

    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: due, error } = await admin.from("items")
      .select("id,title,brand,model_number,gtin,variant_label,product_id,variant_id,currency,last_offer_search_at,status")
      .eq("status", "wanted").or(`last_offer_search_at.is.null,last_offer_search_at.lt.${cutoff}`)
      .order("last_offer_search_at", { ascending: true, nullsFirst: true }).limit(24);
    if (error) throw error;
    let searched = 0;
    let offersSaved = 0;
    let skipped = 0;
    const groups = new Map<string, typeof due>();
    for (const item of due || []) {
      const model = String(item.model_number || "").trim();
      const gtin = digits(item.gtin);
      if (!gtin && (!item.brand || !model)) {
        skipped++;
        await admin.from("items").update({ last_offer_search_at: new Date().toISOString(), enrichment_status: "manual", enrichment_error: "Add a reliable model number or GTIN to search for exact offers." }).eq("id", item.id);
        continue;
      }
      const signature = [item.product_id || `${String(item.brand || "").toLowerCase()}:${model.toLowerCase()}:${String(item.title).toLowerCase()}`, item.variant_id || String(item.variant_label || "").toLowerCase(), item.currency].join("|");
      const list = groups.get(signature) || [];
      list.push(item);
      groups.set(signature, list);
    }

    // Bound provider use per schedule tick and share one query across identical tracked products.
    for (const items of [...groups.values()].slice(0, 4)) {
      const seed = items[0];
      const market = currencyMarket[String(seed.currency || "USD").toUpperCase()] || currencyMarket.USD;
      const query = [seed.brand, seed.model_number, seed.title, seed.variant_label].filter(Boolean).join(" ").slice(0, 240);
      const search = new URL("https://serpapi.com/search.json");
      search.searchParams.set("engine", "google_shopping");
      search.searchParams.set("q", query);
      search.searchParams.set("gl", market.gl);
      search.searchParams.set("hl", market.gl === "ma" ? "fr" : "en");
      search.searchParams.set("api_key", apiKey);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      let response: Response;
      try { response = await fetch(search, { signal: controller.signal }); }
      finally { clearTimeout(timeout); }
      searched++;
      const checkedAt = new Date().toISOString();
      if (!response.ok) {
        for (const item of items) await admin.from("items").update({ last_offer_search_at: checkedAt, enrichment_error: "Shopping source temporarily unavailable; saved offers were retained." }).eq("id", item.id);
        continue;
      }
      const payload = await response.json();
      const rows = Array.isArray(payload.shopping_results) ? payload.shopping_results : [];
      for (const item of items) {
        const identity = digits(item.gtin);
        const model = String(item.model_number || "").trim();
        const title = `${item.title} ${item.variant_label || ""}`.trim();
        const targetCapacity = capacity(title);
        const targetColor = color(title);
        const targetSize = sizeVariant(item.variant_label);
        const targetGender = genderVariant(title);
        const matches = rows.flatMap((row: any) => {
          const candidateTitle = String(row.title || "");
          const candidateLower = candidateTitle.toLowerCase();
          const candidateIds = [row.gtin, row.upc, row.ean].map(digits).filter(Boolean);
          const gtinMatch = Boolean(identity && candidateIds.includes(identity));
          const modelMatch = Boolean(model && new RegExp(`(^|\\W)${escapeRegex(model)}($|\\W)`, "i").test(candidateTitle));
          if (!gtinMatch && !(modelMatch && (!item.brand || candidateLower.includes(String(item.brand).toLowerCase())))) return [];
          if (identity && candidateIds.length && !gtinMatch) return [];
          if (/\b(used|refurbished|renewed|open box|pre-owned|replacement|compatible|case for|cover for)\b/i.test(candidateTitle)) return [];
          if (targetCapacity && capacity(candidateTitle) !== targetCapacity) return [];
          if (targetColor && color(candidateTitle) !== targetColor) return [];
          const rowSizeText = String(row.size || row.extensions?.find?.((value: unknown) => typeof value === "string" && /\b(?:size|shoe\s+size|EU|UK|US|CM|MM)\b/i.test(value)) || "");
          const candidateSize = sizeVariant(rowSizeText) || sizeVariant(candidateTitle);
          const candidateGender = genderVariant(candidateTitle);
          if (targetGender && candidateGender && targetGender !== candidateGender) return [];
          if (targetSize && (!candidateSize || targetSize.label !== candidateSize.label || (targetSize.system && candidateSize.system && targetSize.system !== candidateSize.system))) return [];
          const price = Number(row.extracted_price);
          const oldPriceRaw = row.extracted_old_price ?? (typeof row.old_price === "number" ? row.old_price : null);
          const oldPriceText = String(oldPriceRaw ?? "").replace(/[^\d.,-]/g, "");
          const oldPriceNormalized = oldPriceText.includes(".") && oldPriceText.includes(",")
            ? (oldPriceText.lastIndexOf(",") > oldPriceText.lastIndexOf(".") ? oldPriceText.replace(/\./g, "").replace(",", ".") : oldPriceText.replace(/,/g, ""))
            : oldPriceText.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
          const originalPrice = Number(oldPriceNormalized);
          const offerUrl = typeof row.link === "string" ? row.link : "";
          if (!Number.isFinite(price) || price <= 0 || !/^https?:\/\//i.test(offerUrl)) return [];
          const rowPrice = String(row.price || "");
          const currency = symbolCurrency(rowPrice, market.currency);
          const lower = candidateTitle.toLowerCase();
          const condition = /\b(refurbished|renewed)\b/i.test(lower) ? "refurbished" : /\b(used|open box|pre-owned)\b/i.test(lower) ? "used" : "unknown";
          const sizeInfo = candidateSize;
          return [{
            item_id: item.id, product_id: item.product_id, variant_id: item.variant_id,
            store: String(row.source || "Retailer").slice(0, 120), seller: String(row.source || "Retailer").slice(0, 120),
            listing_title: candidateTitle, image_url: typeof row.thumbnail === "string" ? row.thumbnail : null,
            size_label: sizeInfo?.label || null, size_system: sizeInfo?.system || null,
            color_label: candidateColor,
            product_match_confidence: gtinMatch ? 1 : 0.9,
            match_type: gtinMatch ? "gtin" : "brand_model_variant",
            price, currency, url: offerUrl, shipping_cost: 0, taxes: 0, total_price: null,
            original_price: Number.isFinite(originalPrice) && originalPrice > price ? originalPrice : null,
            discount_percent: Number.isFinite(originalPrice) && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : null,
            shipping_known: false, taxes_known: false, total_is_estimated: true,
            condition, availability: "unknown", source: "google_shopping", last_verified_at: checkedAt,
          }];
        }).slice(0, 8);

        if (matches.length) {
          const { data: before } = await admin.from("store_offers").select("id,store,price,currency,url,source").eq("item_id", item.id);
          const prior = new Map((before || []).map((offer: any) => [`${offer.source}:${offer.url}`, offer]));
          const { data: saved, error: saveError } = await admin.from("store_offers").upsert(matches, { onConflict: "item_id,source,url" }).select("id,store,price,currency,source,url,availability,last_verified_at");
          if (!saveError) {
            offersSaved += saved?.length || 0;
            const changed = (saved || []).filter((offer: any) => {
              const old = prior.get(`${offer.source}:${offer.url}`) as any;
              return !old || Number(old.price) !== Number(offer.price) || old.currency !== offer.currency;
            });
            if (changed.length) await Promise.all(changed.map((offer: any) => admin.rpc("record_price_observation", {
              p_item_id: item.id, p_offer_id: offer.id, p_price: offer.price, p_store: offer.store,
              p_currency: offer.currency, p_source: offer.source || "google_shopping", p_source_url: offer.url,
              p_availability: offer.availability || "unknown", p_is_verified: false, p_recorded_at: offer.last_verified_at || checkedAt,
            })));
          }
        }
        const status = matches.length ? "offers_available" : "no_matches";
        await admin.from("items").update({ offers_last_checked_at: checkedAt, last_offer_search_at: checkedAt, enrichment_status: status, enrichment_error: null }).eq("id", item.id);
        if (item.product_id) await admin.from("products").update({ offers_last_checked_at: checkedAt, offer_search_status: status }).eq("id", item.product_id);
      }
    }
    return json({ success: true, due_items: due?.length || 0, provider_searches: searched, offers_saved: offersSaved, skipped_without_identity: skipped });
  } catch {
    return json({ error: "Scheduled offer refresh failed; existing offer records were retained." }, 500);
  }
});
