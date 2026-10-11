export interface ProductMetadata {
  title: string | null;
  image_url: string | null;
  additional_images: string[];
  description: string | null;
  price: number | null;
  original_price: number | null;
  discount_percent: number | null;
  currency: string;
  brand: string | null;
  model_number: string | null;
  gtin: string | null;
  sku: string | null;
  category: string | null;
  condition: string;
  availability: string;
  canonical_url: string | null;
  variants: Array<{ name: string; sku?: string; color?: string; size?: string; capacity?: string }>;
  variant_name: string | null;
  variant_details: { color?: string; size?: string; capacity?: string; sku?: string };
}

const text = (value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return result || null;
};

function decode(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity: string) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " } as Record<string, string>)[key] || _;
  });
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const body = tag.replace(/^<meta\b/i, "").replace(/\s*\/?\s*>$/, "");
  const attr = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attr.exec(body))) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? "");
  return result;
}

function metaValues(html: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content && !values[key]) values[key] = attrs.content;
  }
  return values;
}

function jsonLdNodes(html: string): Record<string, any>[] {
  const nodes: Record<string, any>[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      const root = JSON.parse(decode(match[1].trim()).replace(/^<!--|-->$/g, "").trim());
      const visit = (value: unknown) => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== "object") return;
        const node = value as Record<string, any>;
        const type = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        if (type.some((t) => ["product", "productgroup"].includes(String(t).toLowerCase().split("/").pop() || ""))) nodes.push(node);
        Object.values(node).forEach((child) => {
          if (child && typeof child === "object") visit(child);
        });
      };
      visit(root);
    } catch { /* A malformed JSON-LD block must not stop other extractors. */ }
  }
  return nodes;
}

function absolute(value: unknown, base: string): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstText(...value);
      if (nested) return nested;
    } else if (value && typeof value === "object") {
      const nested = firstText((value as Record<string, unknown>).name, (value as Record<string, unknown>).value);
      if (nested) return nested;
    } else {
      const candidate = text(value);
      if (candidate) return candidate;
    }
  }
  return null;
}

function canonicalUrl(html: string, base: string): string | null {
  const match = html.match(/<link\b(?=[^>]*\brel\s*=\s*["'][^"']*canonical[^"']*["'])[^>]*>/i);
  if (!match) return null;
  const href = match[0].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return absolute(href?.[1] || href?.[2], base);
}

export function parseProductMetadata(html: string, pageUrl: string): ProductMetadata {
  const meta = metaValues(html);
  const products = jsonLdNodes(html);
  const product = products.filter((node) => {
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    return types.some((type) => String(type).toLowerCase().split("/").pop() === "product") && node.name;
  }).sort((a, b) => {
    const score = (node: Record<string, any>) => Number(Boolean(node.gtin || node.gtin13 || node.mpn)) * 4 + Number(Boolean(node.offers)) * 3 + Number(Boolean(node.brand || node.model)) * 2 + Number(Boolean(node.image));
    return score(b) - score(a);
  })[0] || products[0] || {};
  const offerValue = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const offer = offerValue && typeof offerValue === "object" ? offerValue : {};
  const aggregate = offer.lowPrice != null ? offer : {};
  const rawPrice = offer.price ?? offer.lowPrice ?? aggregate.lowPrice ?? meta["product:price:amount"] ?? meta["og:price:amount"];
  const parsePrice = (value: unknown): number | null => typeof value === "number" ? value : (() => {
    let raw = String(value ?? "").replace(/[^\d.,-]/g, "");
    const comma = raw.lastIndexOf(",");
    const dot = raw.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) raw = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    else if (comma >= 0) raw = /,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  })();
  const parsedPrice = parsePrice(rawPrice);
  const specifications = Array.isArray(offer.priceSpecification) ? offer.priceSpecification : [offer.priceSpecification];
  const originalSpec = specifications.find((spec: any) => /list|original|retail|strikethrough/i.test(String(spec?.priceType || spec?.name || "")));
  const parsedOriginal = parsePrice(offer.listPrice ?? offer.strikethroughPrice ?? product.listPrice ?? originalSpec?.price ?? meta["product:price:original_amount"] ?? meta["product:original_price:amount"] ?? meta["product:list_price:amount"] ?? meta["og:price:original_amount"]);
  const originalPrice = parsedOriginal != null && parsedPrice != null && parsedOriginal > parsedPrice ? parsedOriginal : null;
  const discount = originalPrice ? Math.round((1 - parsedPrice! / originalPrice) * 100) : null;
  const images = (Array.isArray(product.image) ? product.image : [product.image]).flatMap((value: any) => {
    if (typeof value === "string") return [absolute(value, pageUrl)].filter(Boolean) as string[];
    if (value && typeof value === "object") return [absolute(value.url || value.contentUrl, pageUrl)].filter(Boolean) as string[];
    return [];
  });
  const image = images[0] || absolute(meta["og:image"] || meta["og:image:url"] || meta["twitter:image"], pageUrl);
  const imagesAll = [...new Set([image, ...images].filter(Boolean) as string[])];
  const offerCondition = String(offer.itemCondition || "").toLowerCase();
  const availabilityValue = String(offer.availability || "").toLowerCase();
  let availability = "unknown";
  if (availabilityValue.includes("outofstock") || availabilityValue.includes("soldout")) availability = "out_of_stock";
  else if (availabilityValue.includes("instock") || availabilityValue.includes("limitedavailability")) availability = "in_stock";
  else if (availabilityValue.includes("preorder")) availability = "preorder";
  let condition = "unknown";
  if (offerCondition.includes("refurbished")) condition = "refurbished";
  else if (offerCondition.includes("used") || offerCondition.includes("damaged")) condition = "used";
  else if (offerCondition.includes("newcondition")) condition = "new";
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const title = firstText(product.name, meta["og:title"], meta["twitter:title"], titleTag);
  const model = firstText(product.model, product.mpn, meta["product:retailer_item_id"]);
  const gtin = firstText(product.gtin14, product.gtin13, product.gtin12, product.gtin, product.upc, product.ean);
  const variants = Array.isArray(product.hasVariant) ? product.hasVariant.slice(0, 12).map((variant: any) => ({
    name: firstText(variant.name, variant.model) || "Variant",
    ...(text(variant.sku) ? { sku: String(variant.sku) } : {}),
    ...(text(variant.color) ? { color: String(variant.color) } : {}),
    ...(text(variant.size) ? { size: String(variant.size) } : {}),
  })) : [];
  const variantDetails: { color?: string; size?: string; capacity?: string; sku?: string } = {};
  for (const key of ["color", "size", "sku"] as const) {
    const value = text(product[key]);
    if (value) variantDetails[key] = value;
  }
  const capacity = firstText(product.capacity, product.storageCapacity, product.additionalProperty && (Array.isArray(product.additionalProperty) ? product.additionalProperty : [product.additionalProperty]).filter((entry: any) => /capacity|storage/i.test(String(entry.name || ""))).map((entry: any) => entry.value));
  if (capacity) variantDetails.capacity = capacity;
  const variantName = [variantDetails.capacity, variantDetails.color, variantDetails.size].filter(Boolean).join(" · ") || null;
  const currency = firstText(offer.priceCurrency, meta["product:price:currency"], meta["og:price:currency"]) || "";
  return {
    title,
    image_url: image,
    additional_images: imagesAll.slice(1, 7),
    description: firstText(product.description, meta["og:description"], meta.description, meta["twitter:description"]),
    price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
    original_price: originalPrice,
    discount_percent: discount,
    currency: /^[A-Z]{3}$/.test(currency) ? currency.toUpperCase() : "",
    brand: firstText(product.brand, product.manufacturer),
    model_number: model,
    gtin: gtin ? String(gtin) : null,
    sku: firstText(product.sku, offer.sku),
    category: firstText(product.category, meta["product:category"], meta["article:section"]),
    condition,
    availability,
    canonical_url: canonicalUrl(html, pageUrl),
    variants,
    variant_name: variantName,
    variant_details: variantDetails,
  };
}
