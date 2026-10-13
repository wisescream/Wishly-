import { UnsafeProductUrlError, type PinnedHttpResponse, type PinnedFetchTransport } from "./pinned-fetch.ts";
import type { DnsResolver } from "./url-security.ts";
import { parseProductMetadata } from "./product-metadata.ts";

export interface ProductImportHandlerDependencies {
  authenticate(authorization: string): Promise<boolean>;
  reserveImport(authorization: string): Promise<boolean>;
  resolveDns: DnsResolver;
  transport: PinnedFetchTransport;
  fetchPage?: typeof import("./pinned-fetch.ts").fetchPinnedProductPage;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export function createProductImportHandler(dependencies: ProductImportHandlerDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "Sign in to import a product URL." }, 401);
    try {
      if (!await dependencies.authenticate(authorization)) return reply({ error: "Your session is invalid or expired." }, 401);
    } catch { return reply({ error: "Your session is invalid or expired." }, 401); }

    let body: unknown;
    try { body = await req.json(); }
    catch { return reply({ error: "Request body must be valid JSON." }, 400); }
    const input = body && typeof body === "object" ? (body as Record<string, unknown>).url : null;
    if (typeof input !== "string" || input.length > 4096) return reply({ error: "Enter a valid product URL." }, 400);

    let target: URL;
    try {
      target = new URL(input.trim());
      if (!/^https?:$/.test(target.protocol) || !target.hostname || target.username || target.password) throw new Error();
    } catch { return reply({ error: "Only public HTTP and HTTPS product URLs are supported." }, 400); }

    try {
      if (!await dependencies.reserveImport(authorization)) {
        return reply({ error: "You have reached the URL import limit. Wait one minute and try again." }, 429);
      }
    } catch { return reply({ error: "URL import is temporarily unavailable." }, 503); }

    let page: PinnedHttpResponse;
    try {
      const fetchPage = dependencies.fetchPage || (await import("./pinned-fetch.ts")).fetchPinnedProductPage;
      page = await fetchPage(
        target.href,
        dependencies.resolveDns,
        dependencies.transport,
        { maxBodyBytes: 2.5 * 1024 * 1024, timeoutMs: 10_000, maxRedirects: 5 },
      );
    } catch (error) {
      if (error instanceof UnsafeProductUrlError) return reply({ error: error.message }, 400);
      const message = error instanceof Error ? error.message : "Retailer request failed.";
      return reply({ error: /timed out/i.test(message) ? "The retailer page timed out." : "The retailer page could not be fetched safely." }, /timed out/i.test(message) ? 504 : 502);
    }

    if (page.status < 200 || page.status >= 300) {
      return reply({ error: `Retailer page returned HTTP ${page.status}.`, status: page.status }, 422);
    }
    const contentType = page.headers.get("content-type")?.toLowerCase() || "";
    if (contentType && !/(?:text\/html|application\/(?:xhtml\+xml|xml))/.test(contentType)) {
      return reply({ error: "The URL did not return a readable product page." }, 415);
    }

    const html = new TextDecoder().decode(page.body);
    const product = parseProductMetadata(html, page.finalUrl.href);
    let canonicalUrl = page.finalUrl.href;
    if (product.canonical_url) {
      try {
        const canonical = new URL(product.canonical_url);
        if (["http:", "https:"].includes(canonical.protocol)
          && !canonical.username && !canonical.password
          && canonical.origin === page.finalUrl.origin) canonicalUrl = canonical.href;
      } catch { /* Keep the validated final URL. */ }
    }
    const complete = Boolean(product.title && product.price != null && product.currency && !product.price_conflict && !page.truncated);

    return reply({
      ...product,
      canonical_url: canonicalUrl,
      store: page.finalUrl.hostname.replace(/^www\./, ""),
      source: "fetch-product",
      confidence: product.gtin ? 0.98 : product.model_number ? 0.9 : product.title ? 0.75 : 0,
      extraction_status: complete ? "complete" : product.title ? "partial" : "failed",
    });
  };
}
