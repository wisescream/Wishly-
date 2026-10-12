#!/bin/sh
set -e

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$REPO_DIR"

echo "=========================================="
echo "▲ Wishly Vercel CLI Deployment"
echo "=========================================="
echo ""

SUPABASE_URL="${VITE_SUPABASE_URL:-}"
SUPABASE_ANON="${VITE_SUPABASE_ANON_KEY:-}"

if [ -f "$REPO_DIR/.env" ]; then
  if [ -z "$SUPABASE_URL" ]; then
    SUPABASE_URL=$(grep -E '^VITE_SUPABASE_URL=' "$REPO_DIR/.env" | tail -n 1 | cut -d '=' -f2- | tr -d '"'\'' ')
  fi
  if [ -z "$SUPABASE_ANON" ]; then
    SUPABASE_ANON=$(grep -E '^VITE_SUPABASE_ANON_KEY=' "$REPO_DIR/.env" | tail -n 1 | cut -d '=' -f2- | tr -d '"'\'' ')
  fi
fi

SUPABASE_URL="${SUPABASE_URL:-https://pjpyfupkaubencuxnjyf.supabase.co}"
if [ -z "$SUPABASE_ANON" ] || [ "$SUPABASE_ANON" = "your-anon-key" ]; then
  echo "❌ Set VITE_SUPABASE_ANON_KEY in the environment or .env before deploying." >&2
  exit 1
fi

# 1. Check or link Vercel project
echo "Step 1: Linking Vercel project..."
npx --yes vercel link

# 2. Add Environment Variables (remove previous if existing, then add)
echo ""
echo "Step 2: Configuring Supabase environment variables on Vercel..."

set_vercel_env() {
  key="$1"
  val="$2"
  for target in production preview development; do
    npx --yes vercel env rm "$key" "$target" -y >/dev/null 2>&1 || true
    npx --yes vercel env add "$key" "$target" --type config --value "$val" --yes >/dev/null
    echo "  ✓ $key synced to Vercel ($target)"
  done
}

set_vercel_env "VITE_SUPABASE_URL" "$SUPABASE_URL"
set_vercel_env "VITE_SUPABASE_ANON_KEY" "$SUPABASE_ANON"

# 3. Deploy
echo ""
echo "Step 3: Building and deploying production release to Vercel..."
npx --yes vercel --prod

echo ""
echo "=========================================="
echo "🎉 Deployment complete! Your app is live!"
echo "=========================================="
