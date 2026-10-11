import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseProductMetadata } from "./_shared/product-metadata.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const requests = new Map<string, { start: number; count: number }>();

/**
 * Validates whether a target URL is safe to fetch (Prevents SSRF attacks)
 */
function privateIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match || match.some((part, index) => index > 0 && Number(part) > 255)) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  const c = Number(match[3]);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 88 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function privateIpv6(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mappedIpv4 = value.startsWith("::ffff:") ? value.slice(7) : "";
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") || (mappedIpv4 ? privateIpv4(mappedIpv4) : false);
}

async function isSafeUrl(urlString: string): Promise<{ safe: boolean; error?: string; url?: URL }> {
  try {
    const parsed = new URL(urlString);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, error: "Only HTTP and HTTPS protocols are permitted." };
    }

    if (parsed.username || parsed.password) return { safe: false, error: "URLs containing credentials are forbidden." };

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host.includes(":")) return { safe: false, error: "IPv6 literal addresses are not supported." };

    // Check localhost & loopback
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0"
    ) {
      return { safe: false, error: "Loopback or local addresses are forbidden." };
    }

    // Check AWS/GCP/Azure link-local metadata endpoints
    if (host === "169.254.169.254" || host.startsWith("169.254.")) {
      return { safe: false, error: "Access to cloud metadata services is forbidden." };
    }

    if (privateIpv4(host)) return { safe: false, error: "Private or reserved IP blocks are forbidden." };

    // Resolve before fetching and reject domains that resolve to internal addresses.
    // The check is repeated after every redirect so redirects cannot bypass it.
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      const records: string[] = [];
      for (const recordType of ["A", "AAAA"] as const) {
        try { records.push(...await Deno.resolveDns(host, recordType)); } catch { /* The hostname may not publish this address family. */ }
      }
      if (!records.length) return { safe: false, error: "The retailer hostname could not be resolved safely." };
      if (records.some((address) => privateIpv4(address) || (address.includes(":") && privateIpv6(address)))) {
        return { safe: false, error: "The retailer hostname resolves to a private or reserved address." };
      }
    }

    return { safe: true, url: parsed };
  } catch {
    return { safe: false, error: "Invalid URL string format." };
  }
}

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
    const now = Date.now();
    const requestWindow = requests.get(auth.user.id);
    if (requestWindow && now - requestWindow.start < 60_000 && requestWindow.count >= 10) {
      return new Response(JSON.stringify({ error: "URL import limit reached. Try again in a minute." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 });
    }
    requests.set(auth.user.id, !requestWindow || now - requestWindow.start >= 60_000 ? { start: now, count: 1 } : { ...requestWindow, count: requestWindow.count + 1 });
    if (requests.size > 5_000) for (const [id, item] of requests) if (now - item.start > 60_000) requests.delete(id);
    const body = await req.json().catch(() => ({}));
    const url = typeof body.url === "string" ? body.url : "";

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // SSRF Check
    const securityCheck = await isSafeUrl(url);
    if (!securityCheck.safe || !securityCheck.url) {
      return new Response(
        JSON.stringify({ error: `Security check failed: ${securityCheck.error}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Validate each redirect to prevent redirect-based SSRF.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let requestUrl = securityCheck.url;
    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
      response = await fetch(requestUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "WishlyProductMetadata/1.0 (+https://wishly.app)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,fr;q=0.8,ar;q=0.7",
        },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirectCount === 5) {
        clearTimeout(timeoutId);
        return new Response(JSON.stringify({ error: "Too many or invalid redirects." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
      }
      const destination = await isSafeUrl(new URL(location, requestUrl).href);
      if (!destination.safe || !destination.url) {
        clearTimeout(timeoutId);
        return new Response(JSON.stringify({ error: "Redirect destination is not permitted." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
      }
      requestUrl = destination.url;
    }
    if (!response) {
      clearTimeout(timeoutId);
      throw new Error("No response from retailer page");
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({
          error: `Retailer page returned status ${response.status}`,
          store: requestUrl.hostname.replace("www.", ""),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Limit read size to 2.5MB to protect memory
    const reader = response.body?.getReader();
    let html = "";
    let bytesRead = 0;
    const maxBytes = 2.5 * 1024 * 1024;

    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.length;
        html += decoder.decode(value, { stream: true });
        if (bytesRead > maxBytes) {
          reader.cancel();
          break;
        }
      }
    }
    clearTimeout(timeoutId);

    const host = requestUrl.hostname.replace(/^www\./, "");
    const metadata = parseProductMetadata(html, requestUrl.href);

    return new Response(
      JSON.stringify({
        ...metadata,
        store: host,
        source: "fetch-product",
        extraction_status: metadata.title ? (metadata.image_url || metadata.price ? "complete" : "partial") : "partial",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Failed to fetch metadata" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
