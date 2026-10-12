#!/bin/sh
set -eu

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_REF="${PROJECT_REF:-${SUPABASE_PROJECT_ID:-pjpyfupkaubencuxnjyf}}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-${SUPABASE_TOKEN:-}}"

echo "=========================================="
echo "⚡ Wishly Supabase Migration Runner"
echo "=========================================="
echo "Project Ref: $PROJECT_REF"
echo ""

if [ -z "$TOKEN" ]; then
  echo "❌ SUPABASE_ACCESS_TOKEN (or SUPABASE_TOKEN) is required." >&2
  exit 1
fi

python3 - "$REPO_DIR/supabase/migrations" "$PROJECT_REF" <<'PY'
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

migrations_dir = Path(sys.argv[1])
project_ref = sys.argv[2]
token = os.environ.get("SUPABASE_ACCESS_TOKEN") or os.environ.get("SUPABASE_TOKEN")
dry_run = os.environ.get("MIGRATIONS_DRY_RUN") == "1"
endpoint = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"


def query(sql):
    request = urllib.request.Request(
        endpoint,
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API response ({error.code}): {detail}") from None
    except Exception as error:
        raise RuntimeError(f"Supabase API request failed: {error}") from None
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        raise RuntimeError(f"Supabase API returned invalid JSON: {payload[:500]}") from None


def migration_names(path):
    stem = path.stem
    match = re.match(r"^\d+_(.+)$", stem)
    names = {stem}
    if match:
        names.add(match.group(1))
    # Historical migration ledger names differ from the original filenames.
    aliases = {
        "001_initial_schema": "001_schema",
    }
    if stem in aliases:
        names.add(aliases[stem])
    return names


try:
    rows = query("SELECT version, name FROM supabase_migrations.schema_migrations;")
    if not isinstance(rows, list):
        raise RuntimeError("Could not read Supabase migration history.")
    applied = {row.get("name") for row in rows if isinstance(row, dict)}
    latest_version = max(
        (int(row["version"]) for row in rows if isinstance(row, dict) and str(row.get("version", "")).isdigit()),
        default=0,
    )
except Exception as error:
    print(f"❌ Could not read Supabase migration history: {error}", file=sys.stderr)
    sys.exit(1)

files = sorted(migrations_dir.glob("*.sql"))
if not files:
    print("No SQL migration files found.")
    sys.exit(0)

for path in files:
    names = migration_names(path)
    if names & applied:
        print(f"⏭️  Already applied: {path.name}")
        continue

    if dry_run:
        print(f"🔎 Would apply: {path.name}")
        continue

    print(f"Applying: {path.name}...", flush=True)
    match = re.match(r"^(\d+)_", path.stem)
    if not match:
        print(f"❌ Migration filename must start with a numeric version: {path.name}", file=sys.stderr)
        sys.exit(1)
    # Use timestamp versions compatible with the Supabase migration ledger.
    # Incrementing avoids collisions when legacy filenames share a sequence.
    next_version = max(
        latest_version + 1,
        int(datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")),
    )
    version = str(next_version)
    ledger_name = path.stem
    escaped_name = ledger_name.replace("'", "''")
    migration_sql = path.read_text(encoding="utf-8")
    sql = (
        migration_sql
        + "\nINSERT INTO supabase_migrations.schema_migrations (version, name, statements)\n"
        + f"VALUES ('{version}', '{escaped_name}', ARRAY[]::text[]);\n"
    )
    try:
        query(sql)
    except Exception as error:
        print(f"❌ Failed to apply {path.name}: {error}", file=sys.stderr)
        sys.exit(1)

    applied.add(ledger_name)
    latest_version = next_version
    print(f"✅ Successfully applied {path.name}")

print("🎉 All pending migrations executed successfully!")
PY
