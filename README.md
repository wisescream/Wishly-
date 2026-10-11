# Wishly

Wishly is a React wishlist application backed by Supabase. Product imports can start from a retailer URL, a name/model search, an image, a barcode, or manual entry. Product metadata and offer results are best-effort: coverage depends on retailer access and configured providers, and Wishly does not claim to search every retailer worldwide.

## Stack

- React 18, TypeScript, Vite, Tailwind, React Router, TanStack Query
- Supabase Auth, PostgreSQL with RLS, and Edge Functions
- Vercel static frontend deployment

## Local setup

1. Install dependencies with `npm install`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the browser client.
3. Apply migrations in order: `001_initial_schema.sql`, `002_seed_data.sql` (optional demo content), and migrations `003` through `007` in order.
4. Deploy the Edge Functions in `supabase/functions/`: `fetch-product`, `search-products`, `resolve-product`, `refresh-offers`, `check-prices`, and the existing functions.
5. Set `SERPAPI_KEY` in Supabase Edge Function secrets for structured Google Shopping search. Set `OPENROUTER_API_KEY` for the AI assistant and a cited public-web fallback when Shopping has no high-confidence match. `OPENROUTER_MODEL` is optional; the default is `openai/gpt-4o-mini` routed through OpenRouter. Keep all provider keys server-side; never use `VITE_` variables for them.
6. Migration 005 enables `pg_cron` and `pg_net`, generates a private schedule token in Supabase Vault, and schedules `check-prices` hourly. Migration 006 applies security-advisor fixes; 007 makes the friend visibility helper obey caller RLS. The function validates the scheduler token against Vault through a service-role-only database function.

Without `SERPAPI_KEY`, URL extraction, internal catalog search, barcode databases, and manual wishlist entry can still run where their providers are reachable. OpenRouter web search may still discover cited retailer pages, but it is not a replacement for structured Shopping prices. UPCitemdb trial access and Open Food Facts have their own coverage and limits.

## Product import and offer behavior

- URL import calls the Supabase `fetch-product` Edge Function, preferring JSON-LD product/offer metadata and falling back to Open Graph tags. Unsupported or blocked pages fall back to manual review.
- Name search combines the internal catalog, UPCitemdb, Open Food Facts, and Google Shopping through SerpAPI when configured. Search results remain candidates for the user to confirm.
- Image import validates image type and size, then uses the browser's experimental `TextDetector` when available. OCR is not available on every browser; manual entry remains available. OCR prices are unverified observations.
- Barcode entry validates GTIN check digits and searches the internal catalog, UPCitemdb, and Open Food Facts. Camera scanning depends on browser `BarcodeDetector` support and camera permission.
- Saved items remain available when enrichment or offer search fails. The server-side `refresh-offers` function searches SerpAPI Google Shopping first, then uses OpenRouter's cited web-search results when it finds no high-confidence Shopping match. It preserves retailer URLs and original currencies, rejects conflicting variants, labels title-only/web-snippet results as possible matches, and never treats snippet prices or inferred stock as verified retailer data. Coverage depends on the connected sources; this does not search every retailer worldwide. OpenRouter web search can incur per-search and model-token charges.
- Offer refresh is cached for six hours per canonical product. Price alerts only use fresh offers with a known total, matching currency, known new condition, and in-stock status. The hourly job checks qualifying saved offers for alerts; it does not itself run a fresh Google Shopping search. Offer refresh currently starts after an item is saved.

## Commands

- `npm run dev` — local Vite server
- `npm run lint` — ESLint
- `npx tsc --noEmit` — TypeScript check
- `npm run build` — production frontend build

## Deployment configuration

Vercel needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Supabase Edge Functions use the platform-provided Supabase URL, anon key, and service-role key; configure `SERPAPI_KEY` and `OPENROUTER_API_KEY` in the Supabase Dashboard under Edge Functions → Secrets. Optionally set `OPENROUTER_MODEL` there to select another OpenRouter model. The service-role and provider keys must never be added to frontend or Vercel `VITE_` variables.
