import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Validates whether a target URL is safe to fetch (Prevents SSRF attacks)
 */
function isSafeUrl(urlString: string): { safe: boolean; error?: string; url?: URL } {
  try {
    const parsed = new URL(urlString);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, error: "Only HTTP and HTTPS protocols are permitted." };
    }

    const host = parsed.hostname.toLowerCase();

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

    // Check IPv4 Private address blocks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = host.match(ipv4Regex);
    if (match) {
      const b1 = parseInt(match[1], 10);
      const b2 = parseInt(match[2], 10);

      if (b1 === 10) return { safe: false, error: "Private IP block 10.0.0.0/8 is forbidden." };
      if (b1 === 127) return { safe: false, error: "Loopback IP block is forbidden." };
      if (b1 === 192 && b2 === 168) return { safe: false, error: "Private IP block 192.168.0.0/16 is forbidden." };
      if (b1 === 172 && b2 >= 16 && b2 <= 31) return { safe: false, error: "Private IP block 172.16.0.0/12 is forbidden." };
    }

    return { safe: true, url: parsed };
  } catch {
    return { safe: false, error: "Invalid URL string format." };
  }
}

/**
 * Extracts structured JSON-LD schemas from HTML
 */
function parseJsonLd(html: string): any[] {
  const products: any[] = [];
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const content = match[1].trim();
      const json = JSON.parse(content);
      const items = Array.isArray(json) ? json : json["@graph"] ? json["@graph"] : [json];

      for (const item of items) {
        if (
          item["@type"] === "Product" ||
          (Array.isArray(item["@type"]) && item["@type"].includes("Product"))
        ) {
          products.push(item);
        }
      }
    } catch {
      // Ignore unparseable JSON blocks
    }
  }

  return products;
}

/**
 * Moroccan retailer-specific extraction patterns
 */
function parseMoroccanRetailerSpecific(html: string, url: URL): {
  title?: string;
  price?: number;
  currency?: string;
  brand?: string;
  image_url?: string;
  storeName: string;
} {
  const host = url.hostname.toLowerCase();
  let storeName = host.replace(/^www\./, "");
  let title: string | undefined;
  let price: number | undefined;
  let currency = "MAD";
  let brand: string | undefined;
  let image_url: string | undefined;

  if (host.includes("jumia.ma")) {
    storeName = "Jumia Maroc";
    // Jumia product title: <h1 class="-fs20 -pts -pbxs"> or data attributes
    const jTitle = html.match(/<h1[^>]*class=["'][^"']*-fs20[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
                   html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (jTitle) title = jTitle[1].replace(/<[^>]+>/g, "").trim();

    // Jumia price: <span class="-b -ltr -tal -fs24 ...">1,299.00 Dhs</span>
    const jPrice = html.match(/class=["'][^"']*-fs24[^"']*["'][^>]*>\s*([0-9\s,.]+)\s*(?:dhs|dh|mad)/i) ||
                   html.match(/data-price=["']([0-9.]+)["']/i);
    if (jPrice) {
      const rawNum = jPrice[1].replace(/\s/g, "").replace(",", ".");
      const p = parseFloat(rawNum);
      if (!isNaN(p)) price = p;
    }

    // Jumia brand
    const jBrand = html.match(/class=["'][^"']*-brand[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (jBrand) brand = jBrand[1].replace(/<[^>]+>/g, "").trim();

    // Jumia image
    const jImg = html.match(/class=["'][^"']*-gallery[^"']*["'][\s\S]*?data-src=["']([^"']+)["']/i) ||
                 html.match(/<img[^>]*class=["'][^"']*-fw[^"']*["'][^>]*src=["']([^"']+)["']/i);
    if (jImg) image_url = jImg[1];
  } else if (host.includes("marjanemall.ma") || host.includes("marjane.ma")) {
    storeName = "Marjane Mall";
    // Title
    const mTitle = html.match(/<h1[^>]*class=["'][^"']*page-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
                   html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (mTitle) title = mTitle[1].replace(/<[^>]+>/g, "").trim();

    // Price
    const mPrice = html.match(/data-price-amount=["']([0-9.]+)["']/i) ||
                   html.match(/class=["'][^"']*price[^"']*["'][^>]*>\s*([0-9\s,.]+)\s*(?:dhs|dh|mad)/i);
    if (mPrice) {
      const p = parseFloat(mPrice[1].replace(/\s/g, "").replace(",", "."));
      if (!isNaN(p)) price = p;
    }
  } else if (host.includes("electroplanet.ma")) {
    storeName = "Electroplanet";
    const epTitle = html.match(/<h1[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
                    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (epTitle) title = epTitle[1].replace(/<[^>]+>/g, "").trim();

    const epPrice = html.match(/class=["'][^"']*special-price[^"']*["'][\s\S]*?class=["'][^"']*price[^"']*["'][^>]*>([0-9\s,.]+)/i) ||
                    html.match(/class=["'][^"']*price[^"']*["'][^>]*>\s*([0-9\s,.]+)\s*(?:dhs|dh|mad)/i);
    if (epPrice) {
      const p = parseFloat(epPrice[1].replace(/\s/g, "").replace(",", "."));
      if (!isNaN(p)) price = p;
    }
  } else if (host.includes("cosmos.ma")) {
    storeName = "Cosmos Electro";
  } else if (host.includes("virginmegastore.ma")) {
    storeName = "Virgin Megastore Maroc";
  } else if (host.includes("ikea.ma") || (host.includes("ikea.com") && url.pathname.includes("/ma/"))) {
    storeName = "IKEA Maroc";
  } else if (host.includes("zara.com") && url.pathname.includes("/ma/")) {
    storeName = "Zara Maroc";
  } else if (host.includes("decathlon.ma")) {
    storeName = "Decathlon Maroc";
  }

  return { title, price, currency, brand, image_url, storeName };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const urlString = typeof body.url === "string" ? body.url.trim() : "";

    if (!urlString) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // SSRF Check
    const securityCheck = isSafeUrl(urlString);
    if (!securityCheck.safe || !securityCheck.url) {
      return new Response(
        JSON.stringify({ error: `Security check failed: ${securityCheck.error}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const targetUrl = securityCheck.url;

    // Fetch with timeout and realistic browser headers
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(targetUrl.href, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,ar-MA;q=0.8,ar;q=0.7,en-US;q=0.6,en;q=0.5",
          "Cache-Control": "no-cache",
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Retailer page returned HTTP status ${response.status}`,
          store: targetUrl.hostname.replace(/^www\./, ""),
          status: response.status,
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

    // Run Moroccan retailer-specific parser
    const moroccanData = parseMoroccanRetailerSpecific(html, targetUrl);

    let host = moroccanData.storeName || targetUrl.hostname.replace(/^www\./, "");
    let title: string | null = moroccanData.title || null;
    let image_url: string | null = moroccanData.image_url || null;
    let additional_images: string[] = [];
    let description: string | null = null;
    let price: number | null = moroccanData.price || null;
    let currency = targetUrl.hostname.endsWith(".ma") ? "MAD" : "USD";
    let brand: string | null = moroccanData.brand || null;
    let model_number: string | null = null;
    let gtin: string | null = null;
    let sku: string | null = null;
    let condition = "new";
    let availability = "in_stock";

    // 1. JSON-LD structured schema parsing
    const jsonLdProducts = parseJsonLd(html);
    if (jsonLdProducts.length > 0) {
      const p = jsonLdProducts[0];
      if (!title) title = p.name || null;
      if (!description) description = p.description || null;

      if (!brand) {
        if (typeof p.brand === "string") brand = p.brand;
        else if (p.brand?.name) brand = p.brand.name;
      }

      model_number = p.model || null;
      gtin = p.gtin13 || p.gtin || p.gtin12 || p.gtin8 || p.upc || p.ean || null;
      sku = p.sku || null;

      // Extract images
      if (!image_url) {
        if (typeof p.image === "string") image_url = p.image;
        else if (Array.isArray(p.image) && p.image.length > 0) {
          image_url = p.image[0];
          additional_images = p.image.slice(1, 5);
        } else if (p.image?.url) {
          image_url = p.image.url;
        }
      }

      // Extract offers
      const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      if (offer) {
        if (price === null && offer.price !== undefined) {
          const parsedPrice = parseFloat(offer.price);
          if (!isNaN(parsedPrice)) price = parsedPrice;
        }
        if (offer.priceCurrency) currency = offer.priceCurrency;
        if (offer.availability && offer.availability.includes("OutOfStock")) {
          availability = "out_of_stock";
        }
        if (offer.itemCondition && offer.itemCondition.includes("Refurbished")) {
          condition = "refurbished";
        } else if (offer.itemCondition && offer.itemCondition.includes("Used")) {
          condition = "used";
        }
      }
    }

    // 2. Open Graph & Meta Fallback
    if (!title) {
      const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
      const titleTag = html.match(/<title>([^<]+)<\/title>/i);
      title = ogTitle ? ogTitle[1] : titleTag ? titleTag[1].trim() : null;
    }

    if (!image_url) {
      const ogImg = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (ogImg) image_url = ogImg[1];
    }

    if (!description) {
      const ogDesc = html.match(/<meta\s+(?:property=["']og:description["']|name=["']description["'])\s+content=["']([^"']+)["']/i);
      if (ogDesc) description = ogDesc[1];
    }

    if (price === null) {
      const ogPrice = html.match(/<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)["']/i);
      if (ogPrice) {
        const parsed = parseFloat(ogPrice[1]);
        if (!isNaN(parsed)) price = parsed;
      }
    }

    // Determine currency if not already set by JSON-LD
    const ogCurr = html.match(/<meta\s+property=["']product:price:currency["']\s+content=["']([^"']+)["']/i);
    if (ogCurr) {
      currency = ogCurr[1];
    } else if (targetUrl.hostname.endsWith(".ma") || host.includes("Maroc")) {
      currency = "MAD";
    } else if (targetUrl.hostname.endsWith(".fr") || targetUrl.hostname.endsWith(".de") || targetUrl.hostname.endsWith(".es")) {
      currency = "EUR";
    } else if (targetUrl.hostname.endsWith(".co.uk")) {
      currency = "GBP";
    }

    return new Response(
      JSON.stringify({
        title,
        image_url,
        additional_images,
        description,
        price,
        currency,
        store: host,
        brand,
        model_number,
        gtin,
        sku,
        condition,
        availability,
        canonical_url: targetUrl.href,
        source: "fetch-product",
        extraction_status: title ? (price ? "complete" : "partial") : "failed",
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
