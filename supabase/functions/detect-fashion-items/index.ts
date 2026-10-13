import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseFashionDetections } from "../_shared/fashion-detection.ts";
import { validateProductFetchUrl } from "../_shared/url-security.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey) return json({ error: "Authentication required." }, 401);
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return json({ error: "Authentication required." }, 401);
    const { data: reserved, error: limitError } = await client.rpc("reserve_interactive_provider_request", { p_surface: "image_search" });
    if (limitError) return json({ error: "Image processing limits are temporarily unavailable." }, 503);
    if (reserved !== true) return json({ error: "Image-search limit reached. Try again in a minute." }, 429);

    const endpoint = Deno.env.get("FASHION_ITEM_DETECTION_URL")?.trim();
    const token = Deno.env.get("FASHION_ITEM_DETECTION_TOKEN")?.trim();
    if (!endpoint || !token) return json({ configured: false, detections: [], manual_selection_available: true, error_code: "detector_not_configured" });
    const target = new URL(endpoint);
    if (target.protocol !== "https:") return json({ error: "Fashion detection service must use HTTPS." }, 503);
    const safe = await validateProductFetchUrl(target.href, (hostname, recordType) => Deno.resolveDns(hostname, recordType));
    if (!safe.safe) return json({ error: "Fashion detection service URL is not publicly reachable." }, 503);

    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File) || file.size < 1 || file.size > 4 * 1024 * 1024) return json({ error: "Upload a JPEG, PNG, or WebP image up to 4 MB." }, 400);
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return json({ error: "Upload a JPEG, PNG, or WebP image." }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    const base64 = btoa(binary);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let response: Response;
    try {
      response = await fetch(target, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          image: { mime_type: file.type, base64 },
          response_format: {
            items: [{ category: "fashion category", label: "short visual label", confidence: "0..1", bbox: { x: "0..1", y: "0..1", width: "0..1", height: "0..1" }, color: "optional", pattern: "optional", brand: "optional" }],
          },
        }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok) return json({ configured: true, detections: [], manual_selection_available: true, error_code: `model_http_${response.status}`, message: "Automatic item detection is temporarily unavailable. Draw a box around an item to search it." }, 200);
    let payload: unknown;
    try { payload = await response.json(); }
    catch { return json({ configured: true, detections: [], manual_selection_available: true, error_code: "invalid_model_response" }); }
    const detections = parseFashionDetections(payload);
    return json({ configured: true, detections, manual_selection_available: true, error_code: detections.length ? null : "no_items_detected" });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "AbortError";
    return json({ configured: true, detections: [], manual_selection_available: true, error_code: timeout ? "detection_timeout" : "detection_failed", message: "Automatic item detection failed. Draw a box around an item to search it." });
  }
});
