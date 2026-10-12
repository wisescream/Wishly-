import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseProductMetadata } from "./_shared/product-metadata.ts";
import { fetchPinnedProductPage, UnsafeProductUrlError } from "../_shared/pinned-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: "Authentication required." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) return new Response(JSON.stringify({ error: "Authentication required." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
    const { data: importReserved, error: importLimitError } = await userClient.rpc("reserve_product_import");
    if (importLimitError) {
      return new Response(JSON.stringify({ error: "URL import rate limit could not be checked. Try again shortly." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503,
      });
    }
    if (importReserved !== true) {
      return new Response(JSON.stringify({ error: "URL import limit reached. Try again in a minute." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const url = typeof body.url === "string" ? body.url : "";

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const page = await fetchPinnedProductPage(
      url,
      (hostname, type) => Deno.resolveDns(hostname, type),
      {
        connect: async (address, port) => await Deno.connect({ hostname: address, port }),
        startTls: async (socket, hostname) => await Deno.startTls(socket as unknown as Deno.TcpConn, { hostname }),
      },
      { maxBodyBytes: 2.5 * 1024 * 1024, timeoutMs: 8_000, maxRedirects: 5 },
    );

    if (page.status < 200 || page.status >= 300) {
      return new Response(
        JSON.stringify({
          error: `Retailer page returned status ${page.status}`,
          store: page.finalUrl.hostname.replace("www.", ""),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const html = new TextDecoder().decode(page.body);
    const host = page.finalUrl.hostname.replace(/^www\./, "");
    const metadata = parseProductMetadata(html, page.finalUrl.href);

    return new Response(
      JSON.stringify({
        ...metadata,
        store: host,
        source: "fetch-product",
        extraction_status: page.truncated ? "partial" : metadata.title ? (metadata.image_url || metadata.price ? "complete" : "partial") : "partial",
        truncated: page.truncated,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    if (error instanceof UnsafeProductUrlError) {
      return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }
    return new Response(JSON.stringify({ error: error.message || "Failed to fetch metadata" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
