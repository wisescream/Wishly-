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
5. Set `SERPAPI_KEY` in Supabase Edge Function secrets to enable Google Shopping candidate search and offer refresh. Keep this key server-side; do not use a `VITE_` variable.
6. Migration 005 enables `pg_cron` and `pg_net`, generates a private schedule token in Supabase Vault, and schedules `check-prices` hourly. Migration 006 applies security-advisor fixes; 007 makes the friend visibility helper obey caller RLS. The function validates the scheduler token against Vault through a service-role-only database function.

Without `SERPAPI_KEY`, URL extraction, internal catalog search, barcode databases, and manual wishlist entry can still run where their providers are reachable, but external shopping results and ongoing offer refresh are unavailable. UPCitemdb trial access and Open Food Facts are external services with their own coverage and limits.

## Product import and offer behavior

- URL import calls the Supabase `fetch-product` Edge Function, preferring JSON-LD product/offer metadata and falling back to Open Graph tags. Unsupported or blocked pages fall back to manual review.
- Name search combines the internal catalog, UPCitemdb, Open Food Facts, and Google Shopping through SerpAPI when configured. Search results remain candidates for the user to confirm.
- Image import validates image type and size, then uses the browser's experimental `TextDetector` when available. OCR is not available on every browser; manual entry remains available. OCR prices are unverified observations.
- Barcode entry validates GTIN check digits and searches the internal catalog, UPCitemdb, and Open Food Facts. Camera scanning depends on browser `BarcodeDetector` support and camera permission.
- Saved items remain available when enrichment or offer search fails. The server-side `refresh-offers` function checks supported shopping results, filters for model/identifier and obvious variant mismatches, stores original currency and verification time, and leaves shipping/taxes unknown unless a source provides them.
- Offer refresh is cached for six hours per canonical product. Price alerts only use fresh offers with a known total, matching currency, known new condition, and in-stock status. The hourly job checks qualifying saved offers for alerts; it does not itself run a fresh Google Shopping search. Offer refresh currently starts after an item is saved.

## Commands

- `npm run dev` — local Vite server
- `npm run lint` — ESLint
- `npx tsc --noEmit` — TypeScript check
- `npm run build` — production frontend build

## Deployment configuration

Vercel needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Supabase Edge Functions use the platform-provided Supabase URL, anon key, and service-role key; configure `SERPAPI_KEY` in the Supabase Dashboard under Edge Functions → Secrets. The service-role key must never be added to frontend or Vercel `VITE_` variables.
