import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const validGtin = (value: string) => {
  if (!/^\d{8}$|^\d{12,14}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  return (10 - (digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0) % 10)) % 10 === check;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return response({ error: "Authentication required." }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return response({ error: "Catalog service is not configured." }, 503);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData.user) return response({ error: "Authentication required." }, 401);
    const { title, brand, model_number, gtin, image_url, variant_name, description, category, additional_images, variant_details } = await req.json();
    if (typeof title !== "string" || !title.trim() || title.length > 500) return response({ error: "A product name is required." }, 400);
    const cleanGtin = typeof gtin === "string" ? gtin.replace(/\D/g, "") : "";
    if (cleanGtin && !validGtin(cleanGtin)) return response({ error: "GTIN check digit is invalid." }, 400);
    const hasIdentity = Boolean(cleanGtin || (brand && model_number));
    if (!hasIdentity) return response({ product_id: null, variant_id: null });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: productId, error: productError } = await admin.rpc("resolve_catalog_product", {
      p_title: title.trim(), p_brand: brand || null, p_model_number: model_number || null,
      p_gtin: cleanGtin || null, p_image_url: image_url || null,
    });
    if (productError || !productId) return response({ error: "Could not resolve this product identity." }, 500);

    const productPatch: Record<string, unknown> = {};
    if (typeof description === "string" && description.trim()) productPatch.description = description.slice(0, 20_000);
    if (typeof category === "string" && category.trim()) productPatch.category = category.slice(0, 160);
    if (Array.isArray(additional_images)) productPatch.additional_images = additional_images.filter((value: unknown) => typeof value === "string" && /^https?:\/\//i.test(value)).slice(0, 8);
    if (Object.keys(productPatch).length) await admin.from("products").update(productPatch).eq("id", productId);

    let variantId: string | null = null;
    if (typeof variant_name === "string" && variant_name.trim()) {
      const { data, error } = await admin.rpc("resolve_product_variant", {
        p_product_id: productId, p_name: variant_name.trim(),
      });
      if (!error) variantId = data;
    }
    if (variantId && variant_details && typeof variant_details === "object") {
      const details = variant_details as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const key of ["color", "size", "capacity", "sku"] as const) {
        const value = details[key];
        if (typeof value === "string" && value.trim()) patch[key] = value.slice(0, 120);
      }
      if (Object.keys(patch).length) await admin.from("product_variants").update(patch).eq("id", variantId);
    }
    return response({ product_id: productId, variant_id: variantId });
  } catch {
    return response({ error: "Could not resolve the canonical product." }, 500);
  }
});
