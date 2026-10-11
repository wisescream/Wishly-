import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const userRequests = new Map<string, { at: number; count: number }>();
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
    const now = Date.now();
    const quota = userRequests.get(auth.user.id);
    if (quota && now - quota.at < 60_000 && quota.count >= 5) return json({ error: "Image-search limit reached. Try again in a minute." }, 429);
    userRequests.set(auth.user.id, !quota || now - quota.at >= 60_000 ? { at: now, count: 1 } : { ...quota, count: quota.count + 1 });

    const form = await req.formData();
    const upload = form.get("image");
    if (!(upload instanceof File) || upload.size <= 0 || upload.size > 500 * 1024) return json({ error: "Upload a supported image up to 500 KB after image optimization." }, 400);
    const bytes = new Uint8Array(await upload.arrayBuffer());
    if (!validImage(bytes)) return json({ error: "Image must be a valid JPEG, PNG, or WebP file." }, 400);

    const imageForm = new FormData();
    imageForm.append("image", new Blob([bytes], { type: upload.type }), "wishly-image.jpg");
    imageForm.append("api_key", key);
    const uploadController = new AbortController();
    const uploadTimeout = setTimeout(() => uploadController.abort(), 12_000);
    let uploaded: Response;
    try { uploaded = await fetch("https://serpapi.com/image", { method: "POST", body: imageForm, signal: uploadController.signal }); }
    finally { clearTimeout(uploadTimeout); }
    if (!uploaded.ok) return json({ configured: true, candidates: [], error: "Image recognition provider could not process this image." }, 502);
    const uploadedData = await uploaded.json();
    if (typeof uploadedData.image_id !== "string") return json({ configured: true, candidates: [], error: "Image recognition provider returned no image reference." }, 502);

    const search = new URL("https://serpapi.com/search.json");
    search.searchParams.set("engine", "google_lens");
    search.searchParams.set("image_id", uploadedData.image_id);
    search.searchParams.set("type", "visual_matches");
    search.searchParams.set("hl", "en");
    search.searchParams.set("api_key", key);
    const searchController = new AbortController();
    const searchTimeout = setTimeout(() => searchController.abort(), 15_000);
    let response: Response;
    try { response = await fetch(search, { signal: searchController.signal }); }
    finally { clearTimeout(searchTimeout); }
    if (!response.ok) return json({ configured: true, candidates: [], error: "Image matches are temporarily unavailable." }, 502);
    const results = await response.json();
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
    return json({ configured: true, candidates });
  } catch {
    return json({ error: "Could not recognize this image. Try a clearer image or search by name." }, 500);
  }
});
