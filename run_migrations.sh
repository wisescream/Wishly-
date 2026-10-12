#!/bin/sh
set -e

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$REPO_DIR"

echo "=========================================================="
echo "⚡ Wishly — Supabase Database Migration Runner"
echo "Project: pjpyfupkaubencuxnjyf (https://pjpyfupkaubencuxnjyf.supabase.co)"
echo "=========================================================="
echo ""
echo "Select how you would like to run migrations:"
echo "  1) Run via Supabase CLI (npx supabase db push)"
echo "  2) Run via psql (requires Database Password)"
echo "  3) Copy Migration SQL to Clipboard (for Supabase Web Dashboard)"
echo "  4) Print Migration SQL to terminal"
echo ""
printf "Enter choice [1-4] (default 1): "
read -r CHOICE || CHOICE="1"

case "$CHOICE" in
  2)
    echo ""
    printf "Enter your Supabase database password: "
    stty -echo 2>/dev/null || true
    read -r DB_PASS
    stty echo 2>/dev/null || true
    echo ""
    DB_URL="postgresql://postgres:${DB_PASS}@db.pjpyfupkaubencuxnjyf.supabase.co:5432/postgres"
    
    echo "Applying migrations via psql..."
    if command -v psql >/dev/null 2>&1; then
      psql "$DB_URL" -f supabase/migrations/001_initial_schema.sql
      psql "$DB_URL" -f supabase/migrations/003_product_enrichment.sql
      echo "✅ Migrations applied successfully via psql!"
    else
      echo "psql not found. Installing postgresql package in Termux..."
      pkg install -y postgresql
      psql "$DB_URL" -f supabase/migrations/001_initial_schema.sql
      psql "$DB_URL" -f supabase/migrations/003_product_enrichment.sql
      echo "✅ Migrations applied successfully via psql!"
    fi
    ;;
  3)
    SQL_FILE="$REPO_DIR/supabase/migrations/001_initial_schema.sql"
    if [ -f "$REPO_DIR/supabase/migrations/003_product_enrichment.sql" ]; then
      COMBINED="/tmp/wishly_migration.sql"
      cat "$REPO_DIR/supabase/migrations/001_initial_schema.sql" "$REPO_DIR/supabase/migrations/003_product_enrichment.sql" > "$COMBINED"
      SQL_FILE="$COMBINED"
    fi
    if command -v termux-clipboard-set >/dev/null 2>&1; then
      termux-clipboard-set < "$SQL_FILE"
      echo "📋 All migration SQL has been copied to your clipboard!"
    else
      echo "termux-clipboard-set not found."
    fi
    echo "👉 Now open https://supabase.com/dashboard/project/pjpyfupkaubencuxnjyf/sql and paste + click 'Run'!"
    ;;
  4)
    cat "$REPO_DIR/supabase/migrations/001_initial_schema.sql"
    echo ""
    cat "$REPO_DIR/supabase/migrations/003_product_enrichment.sql"
    ;;
  *)
    echo "Running via Supabase CLI..."
    echo "Linking project pjpyfupkaubencuxnjyf..."
    npx supabase link --project-ref pjpyfupkaubencuxnjyf || true
    echo "Pushing database migrations..."
    npx supabase db push || {
      echo ""
      echo "⚠️ If Supabase CLI requires authentication, run: npx supabase login"
      echo "Or paste the SQL directly into Supabase Dashboard:"
      echo "https://supabase.com/dashboard/project/pjpyfupkaubencuxnjyf/sql"
    }
    ;;
esac
