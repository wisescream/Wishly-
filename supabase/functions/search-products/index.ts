import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const requests = new Map<string, { start: number; count: number }>();

function currencyFromPrice(price: string): string {
  if (/€|\bEUR\b/i.test(price)) return "EUR";
  if (/£|\bGBP\b/i.test(price)) return "GBP";
  if (/د\.م|MAD/i.test(price)) return "MAD";
  if (/¥|\bJPY\b/i.test(price)) return "JPY";
  return "USD";
}

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
    if (!key) return json({ configured: false, candidates: [], offers: [] });
    const authorization = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey) return json({ error: "Authentication required." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) return json({ error: "Authentication required." }, 401);
    const now = Date.now();
    const window = requests.get(auth.user.id);
    if (window && now - window.start < 60_000 && window.count >= 20) return json({ error: "Search limit reached. Try again in a minute." }, 429);
    requests.set(auth.user.id, !window || now - window.start >= 60_000 ? { start: now, count: 1 } : { ...window, count: window.count + 1 });
    if (requests.size > 5_000) for (const [id, item] of requests) if (now - item.start > 60_000) requests.delete(id);

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("gl", "us");
    url.searchParams.set("hl", "en");
    url.searchParams.set("api_key", key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return json({ configured: true, candidates: [], offers: [], error: "Shopping search provider is temporarily unavailable." });
    const payload = await response.json();
    const rows = Array.isArray(payload.shopping_results) ? payload.shopping_results.slice(0, 20) : [];

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
        return [{
          store: String(row.source || "Retailer"),
          price,
          currency: currencyFromPrice(String(row.price || "")),
          url: link,
          condition: "unknown",
          availability: "unknown",
          source: "google_shopping",
          last_verified_at: new Date().toISOString(),
          match_basis: explicitGtin ? "gtin" : "model_number",
        }];
      });
      return json({ configured: true, offers });
    }

    const candidates = rows.flatMap((row: any) => {
      if (!row.title) return [];
      const price = Number(row.extracted_price);
      return [{
        title: String(row.title),
        brand: null,
        image_url: row.thumbnail || null,
        price: Number.isFinite(price) && price > 0 ? price : null,
        currency: currencyFromPrice(String(row.price || "")),
        store: row.source || null,
        url: typeof row.link === "string" && /^https?:\/\//i.test(row.link) ? row.link : null,
        confidence: 0.5,
        match_reason: "Shopping search candidate; confirm the product and variant before saving.",
        source: "google_shopping",
      }];
    });
    return json({ configured: true, candidates });
  } catch {
    return json({ error: "Could not complete product search." }, 500);
  }
});
