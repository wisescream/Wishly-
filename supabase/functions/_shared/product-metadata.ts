export interface ProductMetadata {
  title: string | null;
  image_url: string | null;
  additional_images: string[];
  description: string | null;
  price: number | null;
  price_conflict: boolean;
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
  variants: Array<{ name: string; sku?: string; gtin?: string; color?: string; size?: string; capacity?: string; price?: number; image_url?: string }>;
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
    if (key.startsWith("#x") || key.startsWith("#")) {
      const codePoint = Number.parseInt(key.startsWith("#x") ? key.slice(2) : key.slice(1), key.startsWith("#x") ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return "\uFFFD";
      return String.fromCodePoint(codePoint);
    }
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
  const offerValues = Array.isArray(product.offers) ? product.offers : [product.offers];
  const offerCandidates = offerValues.filter((value: unknown): value is Record<string, any> => Boolean(value && typeof value === "object"));
  const offer = offerCandidates.find((candidate) => /instock|limitedavailability/i.test(String(candidate.availability || "")))
    || offerCandidates.find((candidate) => candidate.price != null || candidate.lowPrice != null)
    || offerCandidates[0]
    || {};
  const parsePrice = (value: unknown): number | null => typeof value === "number" ? value : (() => {
    let raw = String(value ?? "").replace(/[^\d.,-]/g, "");
    const comma = raw.lastIndexOf(",");
    const dot = raw.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) raw = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    else if (comma >= 0) raw = /,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  })();
  const jsonLdPriceCandidates = offerCandidates.flatMap((candidate) => [candidate.price ?? candidate.lowPrice, candidate.highPrice]
    .map(parsePrice).filter((price): price is number => price != null));
  const metadataPriceCandidates = [meta["product:price:amount"], meta["og:price:amount"]]
    .map(parsePrice).filter((price): price is number => price != null);
  const priceCandidates = [...jsonLdPriceCandidates, ...metadataPriceCandidates];
  const jsonLdCurrencies = offerCandidates.map((candidate) => firstText(candidate.priceCurrency)).filter((value): value is string => Boolean(value)).map((value) => value.toUpperCase());
  const metadataCurrencies = [meta["product:price:currency"], meta["og:price:currency"]].filter(Boolean).map((value) => value.toUpperCase());
  const currencies = [...jsonLdCurrencies, ...metadataCurrencies];
  const priceConflict = new Set(priceCandidates.map((price) => Math.round(price * 100))).size > 1
    || (priceCandidates.length > 0 && new Set(currencies).size > 1);
  const parsedPrice = priceConflict ? null : jsonLdPriceCandidates[0] ?? metadataPriceCandidates[0] ?? null;
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
  const offerCondition = String(offer.itemCondition || "").toLowerCase().replace(/[^a-z]/g, "");
  const availabilityValue = String(offer.availability || "").toLowerCase();
  let availability = "unknown";
  if (availabilityValue.includes("outofstock") || availabilityValue.includes("soldout")) availability = "out_of_stock";
  else if (availabilityValue.includes("instock") || availabilityValue.includes("limitedavailability")) availability = "in_stock";
  else if (availabilityValue.includes("preorder")) availability = "preorder";
  let condition = "unknown";
  if (offerCondition.includes("refurbished") || offerCondition.includes("renewed") || offerCondition.includes("reconditioned")) condition = "refurbished";
  else if (offerCondition.includes("openbox")) condition = "open_box";
  else if (offerCondition.includes("used") || offerCondition.includes("damaged") || offerCondition.includes("preowned")) condition = "used";
  else if (offerCondition.includes("newcondition") || offerCondition === "new") condition = "new";
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const title = firstText(product.name, meta["og:title"], meta["twitter:title"], titleTag);
  const model = firstText(product.model, product.mpn, meta["product:retailer_item_id"]);
  const gtin = firstText(product.gtin14, product.gtin13, product.gtin12, product.gtin, product.upc, product.ean);
  const variantNodes = products.flatMap((node) => {
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    const isProductGroup = types.some((type) => String(type).toLowerCase().split("/").pop() === "productgroup");
    if (!isProductGroup && node !== product) return [];
    return (Array.isArray(node.hasVariant) ? node.hasVariant : node.hasVariant ? [node.hasVariant] : [])
      .filter((variant: unknown) => variant && typeof variant === "object");
  });
  const variantKeys = new Set<string>();
  const pageCurrency = firstText(offer.priceCurrency, meta["product:price:currency"], meta["og:price:currency"])?.toUpperCase() || "";
  const variants = variantNodes.flatMap((variant: any) => {
    const variantOfferValues = Array.isArray(variant.offers) ? variant.offers : [variant.offers];
    const variantPrices: number[] = variantOfferValues.flatMap((entry: any) => {
      if (!entry || typeof entry !== "object") return [];
      const price = parsePrice(entry.price ?? entry.lowPrice);
      return price == null ? [] : [price];
    });
    const uniquePrices: number[] = [...new Set<number>(variantPrices.map((price: number) => Math.round(price * 100) / 100))];
    const variantCurrencies = [...new Set(variantOfferValues.map((entry: any) => firstText(entry?.priceCurrency)?.toUpperCase()).filter(Boolean))];
    const color = firstText(variant.color);
    const size = firstText(variant.size);
    const capacity = firstText(variant.capacity, variant.storageCapacity, variant.additionalProperty && (Array.isArray(variant.additionalProperty) ? variant.additionalProperty : [variant.additionalProperty]).filter((entry: any) => /capacity|storage/i.test(String(entry.name || ""))).map((entry: any) => entry.value));
    const sku = firstText(variant.sku);
    const variantGtin = firstText(variant.gtin14, variant.gtin13, variant.gtin12, variant.gtin, variant.upc, variant.ean);
    const name = firstText(variant.name, variant.model) || [color, size, capacity].filter(Boolean).join(" · ") || "Variant";
    const variantImage = absolute(Array.isArray(variant.image) ? variant.image[0] : variant.image, pageUrl);
    const key = [sku, variantGtin, name, color, size, capacity].map((value) => String(value || "").toLowerCase()).join("|");
    if (variantKeys.has(key)) return [];
    variantKeys.add(key);
    return [{
      name,
      ...(sku ? { sku } : {}),
      ...(variantGtin ? { gtin: variantGtin } : {}),
      ...(color ? { color } : {}),
      ...(size ? { size } : {}),
      ...(capacity ? { capacity } : {}),
      ...(!priceConflict && pageCurrency && variantCurrencies.length === 1 && variantCurrencies[0] === pageCurrency && uniquePrices.length === 1 ? { price: uniquePrices[0] } : {}),
      ...(variantImage ? { image_url: variantImage } : {}),
    }];
  }).slice(0, 12);
  const variantDetails: { color?: string; size?: string; capacity?: string; sku?: string } = {};
  for (const key of ["color", "size", "sku"] as const) {
    const value = text(product[key]);
    if (value) variantDetails[key] = value;
  }
  const capacity = firstText(product.capacity, product.storageCapacity, product.additionalProperty && (Array.isArray(product.additionalProperty) ? product.additionalProperty : [product.additionalProperty]).filter((entry: any) => /capacity|storage/i.test(String(entry.name || ""))).map((entry: any) => entry.value));
  if (capacity) variantDetails.capacity = capacity;
  const variantName = [variantDetails.capacity, variantDetails.color, variantDetails.size].filter(Boolean).join(" · ") || null;
  const currency = priceConflict ? "" : firstText(offer.priceCurrency, meta["product:price:currency"], meta["og:price:currency"]) || "";
  return {
    title,
    image_url: image,
    additional_images: imagesAll.slice(1, 7),
    description: firstText(product.description, meta["og:description"], meta.description, meta["twitter:description"]),
    price: parsedPrice != null && Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
    price_conflict: priceConflict,
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
