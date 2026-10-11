export const APP_NAME = "Wishly";
export const APP_TAGLINE = "Smart Social Wishlists";
export const APP_DESCRIPTION =
  "Create, share, and discover wishlists with AI-powered shopping suggestions.";

// ─── Occasions ───────────────────────────────────────────────
export const OCCASIONS = [
  { value: "birthday", label: "Birthday", emoji: "🎂", gradient: "from-pink-500 to-rose-500" },
  { value: "wedding", label: "Wedding", emoji: "💍", gradient: "from-amber-400 to-orange-500" },
  { value: "baby_shower", label: "Baby Shower", emoji: "👶", gradient: "from-sky-400 to-blue-500" },
  { value: "eid", label: "Eid", emoji: "🌙", gradient: "from-emerald-400 to-teal-600" },
  { value: "holiday", label: "Holiday", emoji: "🎄", gradient: "from-green-500 to-emerald-600" },
  { value: "graduation", label: "Graduation", emoji: "🎓", gradient: "from-indigo-500 to-blue-600" },
  { value: "housewarming", label: "Housewarming", emoji: "🏠", gradient: "from-teal-400 to-cyan-500" },
  { value: "valentine", label: "Valentine's Day", emoji: "❤️", gradient: "from-red-400 to-pink-500" },
  { value: "anniversary", label: "Anniversary", emoji: "💝", gradient: "from-rose-400 to-pink-600" },
  { value: "just_because", label: "Just Because", emoji: "✨", gradient: "from-violet-400 to-pink-400" },
  { value: "other", label: "Other", emoji: "🎁", gradient: "from-slate-400 to-zinc-500" },
] as const;

export type OccasionValue = (typeof OCCASIONS)[number]["value"];

// ─── Priorities ──────────────────────────────────────────────
export const PRIORITIES = [
  { value: 1, label: "Nice to have", emoji: "💭", color: "text-blue-400" },
  { value: 2, label: "Really want", emoji: "💜", color: "text-violet-400" },
  { value: 3, label: "Must have", emoji: "🔥", color: "text-orange-400" },
] as const;

// ─── Supported Global & Regional Retailers ──────────────────
export const STORES = [
  { id: "amazon", name: "Amazon", domain: "amazon.com", logo: "📦", color: "#FF9900", region: "GLOBAL" },
  { id: "apple", name: "Apple Store", domain: "apple.com", logo: "🍏", color: "#A2AAAD", region: "GLOBAL" },
  { id: "bestbuy", name: "Best Buy", domain: "bestbuy.com", logo: "🏷️", color: "#0046BE", region: "US" },
  { id: "walmart", name: "Walmart", domain: "walmart.com", logo: "🛒", color: "#0071DC", region: "US" },
  { id: "target", name: "Target", domain: "target.com", logo: "🎯", color: "#CC0000", region: "US" },
  { id: "ebay", name: "eBay", domain: "ebay.com", logo: "🏪", color: "#E53238", region: "GLOBAL" },
  { id: "aliexpress", name: "AliExpress", domain: "aliexpress.com", logo: "🌏", color: "#FF4747", region: "GLOBAL" },
  { id: "asos", name: "ASOS", domain: "asos.com", logo: "👗", color: "#2D2D2D", region: "GLOBAL" },
  { id: "sephora", name: "Sephora", domain: "sephora.com", logo: "💄", color: "#000000", region: "GLOBAL" },
  { id: "zara", name: "Zara", domain: "zara.com", logo: "✨", color: "#000000", region: "GLOBAL" },
  { id: "ikea", name: "IKEA", domain: "ikea.com", logo: "🏠", color: "#0051BA", region: "GLOBAL" },
  { id: "jumia", name: "Jumia", domain: "jumia.ma", logo: "🛒", color: "#F68B1E", region: "MA" },
  { id: "marjane", name: "Marjane", domain: "marjane.ma", logo: "🏬", color: "#E31E24", region: "MA" },
  { id: "electroplanet", name: "Electroplanet", domain: "electroplanet.ma", logo: "⚡", color: "#0072BC", region: "MA" },
  { id: "virgin", name: "Virgin Megastore", domain: "virginmegastore.ma", logo: "🎵", color: "#FF0000", region: "MA" },
  { id: "other", name: "Other Retailer", domain: "", logo: "🌐", color: "#6B7280", region: "GLOBAL" },
] as const;

// ─── Style tags ──────────────────────────────────────────────
export const STYLE_TAGS = [
  "Casual", "Chic", "Bohemian", "Streetwear", "Classic", "Sporty",
  "Minimalist", "Vintage", "Elegant", "Trendy", "Modest", "Avant-garde",
] as const;

export const FAVORITE_COLORS = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Navy", hex: "#1E3A5F" },
  { name: "Burgundy", hex: "#800020" },
  { name: "Olive", hex: "#556B2F" },
  { name: "Blush", hex: "#DE5D83" },
  { name: "Camel", hex: "#C19A6B" },
  { name: "Terracotta", hex: "#E2725B" },
  { name: "Sage", hex: "#B2AC88" },
  { name: "Lavender", hex: "#B57EDC" },
] as const;

// ─── Premium plans ───────────────────────────────────────────
export const PREMIUM_PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    price: 4.99,
    currency: "USD",
    interval: "month" as const,
    popular: false,
  },
  {
    id: "annual",
    name: "Annual",
    price: 7.99,
    currency: "USD",
    interval: "month" as const,
    popular: true,
    savings: "Save 33%",
    billedAs: 95.88,
  },
] as const;

// ─── Countries ───────────────────────────────────────────────
export const COUNTRIES = [
  { code: "MA", name: "Morocco", flag: "🇲🇦", currency: "MAD" },
  { code: "FR", name: "France", flag: "🇫🇷", currency: "EUR" },
  { code: "US", name: "United States", flag: "🇺🇸", currency: "USD" },
  { code: "BE", name: "Belgium", flag: "🇧🇪", currency: "EUR" },
  { code: "CA", name: "Canada", flag: "🇨🇦", currency: "USD" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", currency: "EUR" },
  { code: "DE", name: "Germany", flag: "🇩🇪", currency: "EUR" },
  { code: "ES", name: "Spain", flag: "🇪🇸", currency: "EUR" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "USD" },
  { code: "AE", name: "UAE", flag: "🇦🇪", currency: "USD" },
] as const;

// ─── Onboarding slides ──────────────────────────────────────
export const ONBOARDING_SLIDES = [
  {
    title: "Create Your Wishlists",
    description: "Organize everything you want in beautiful, shareable lists for any occasion.",
    emoji: "🎁",
    gradient: "from-violet-600 to-purple-700",
  },
  {
    title: "Smart Price Tracking",
    description: "We watch prices for you across Moroccan and international stores. Never miss a deal.",
    emoji: "📉",
    gradient: "from-pink-500 to-rose-600",
  },
  {
    title: "AI Shopping Assistant",
    description: "Get personalized gift ideas and shopping suggestions powered by AI.",
    emoji: "✨",
    gradient: "from-amber-500 to-orange-600",
  },
] as const;
