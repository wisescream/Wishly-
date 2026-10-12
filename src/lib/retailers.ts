export interface MoroccanRetailer {
  id: string;
  name: string;
  domain: string;
  logo: string;
  color: string;
  categories: Array<"electronics" | "fashion" | "home" | "beauty" | "sports" | "general" | "books">;
  buildSearchUrl: (query: string) => string;
  currency: string;
  country: "MA";
}

export const MOROCCAN_RETAILERS: MoroccanRetailer[] = [
  {
    id: "jumia_ma",
    name: "Jumia Maroc",
    domain: "jumia.ma",
    logo: "🛒",
    color: "#F68B1E",
    categories: ["general", "electronics", "fashion", "home", "beauty", "sports"],
    buildSearchUrl: (query: string) => `https://www.jumia.ma/catalog/?q=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
  {
    id: "marjanemall",
    name: "Marjane Mall",
    domain: "marjanemall.ma",
    logo: "🏬",
    color: "#E31E24",
    categories: ["general", "electronics", "home", "beauty", "fashion", "sports"],
    buildSearchUrl: (query: string) => `https://www.marjanemall.ma/catalogsearch/result/?q=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
  {
    id: "electroplanet",
    name: "Electroplanet",
    domain: "electroplanet.ma",
    logo: "⚡",
    color: "#0072BC",
    categories: ["electronics", "home"],
    buildSearchUrl: (query: string) => `https://www.electroplanet.ma/recherche?q=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
  {
    id: "cosmos",
    name: "Cosmos Electro",
    domain: "cosmos.ma",
    logo: "🛍️",
    color: "#1B3A6B",
    categories: ["electronics", "home"],
    buildSearchUrl: (query: string) => `https://cosmos.ma/recherche?controller=search&s=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
  {
    id: "virgin_ma",
    name: "Virgin Megastore Maroc",
    domain: "virginmegastore.ma",
    logo: "🎵",
    color: "#ED1C24",
    categories: ["electronics", "books", "general"],
    buildSearchUrl: (query: string) => `https://virginmegastore.ma/recherche?controller=search&s=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
  {
    id: "ikea_ma",
    name: "IKEA Maroc",
    domain: "ikea.ma",
    logo: "🏠",
    color: "#0051BA",
    categories: ["home"],
    buildSearchUrl: (query: string) => `https://www.ikea.ma/fr/search?q=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
  {
    id: "zara_ma",
    name: "Zara Maroc",
    domain: "zara.com/ma",
    logo: "👗",
    color: "#000000",
    categories: ["fashion"],
    buildSearchUrl: (query: string) => `https://www.zara.com/ma/fr/search?searchTerm=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
  {
    id: "decathlon_ma",
    name: "Decathlon Maroc",
    domain: "decathlon.ma",
    logo: "⚽",
    color: "#0082C3",
    categories: ["sports", "fashion"],
    buildSearchUrl: (query: string) => `https://www.decathlon.ma/search?query=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
  {
    id: "beautysuccess_ma",
    name: "Beauty Success Maroc",
    domain: "beautysuccess.co",
    logo: "💄",
    color: "#D6006E",
    categories: ["beauty"],
    buildSearchUrl: (query: string) => `https://www.beautysuccess.co/recherche?controller=search&s=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
  {
    id: "bricoma",
    name: "Bricoma",
    domain: "bricoma.ma",
    logo: "🔨",
    color: "#F37021",
    categories: ["home"],
    buildSearchUrl: (query: string) => `https://www.bricoma.ma/recherche?controller=search&s=${encodeURIComponent(query)}`,
    currency: "MAD",
    country: "MA",
  },
];

/**
 * Infer probable product category from title or query
 */
export function inferProductCategory(title: string): MoroccanRetailer["categories"][number] {
  const lower = title.toLowerCase();

  if (
    /phone|iphone|samsung|galaxy|macbook|laptop|pc|ps5|playstation|xbox|tv|ecran|casque|airpods|headphone|watch|tablette|ipad|tech|pro|camera|canon|sony|anker/i.test(
      lower
    )
  ) {
    return "electronics";
  }

  if (
    /robe|shirt|pantalon|chaussure|sneakers|nike|adidas|zara|pull|manteau|veste|jean|t-shirt|chemise|sac|taille|coton|fashion/i.test(
      lower
    )
  ) {
    return "fashion";
  }

  if (
    /canape|table|chaise|lit|meuble|ikea|deco|vase|coussin|lampe|cuisine|bricolage|outil/i.test(
      lower
    )
  ) {
    return "home";
  }

  if (
    /parfum|creme|maquillage|rouge|sephora|soin|serum|visage|shampoing|mascara|eau de parfum/i.test(
      lower
    )
  ) {
    return "beauty";
  }

  if (
    /ballon|velo|fitness|tapis|musculation|gourde|randonnee|decathlon|sport/i.test(
      lower
    )
  ) {
    return "sports";
  }

  return "general";
}

/**
 * Get relevant Moroccan retailers for a given product or category
 */
export function getRelevantMoroccanRetailers(title: string): MoroccanRetailer[] {
  const cat = inferProductCategory(title);
  const matched = MOROCCAN_RETAILERS.filter(
    (r) => r.categories.includes(cat) || r.categories.includes("general")
  );
  return matched.length > 0 ? matched : MOROCCAN_RETAILERS.slice(0, 5);
}
