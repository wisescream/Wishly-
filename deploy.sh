#!/bin/sh
set -eu

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$REPO_DIR"

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Not inside a Git repository; refusing to publish." >&2
  exit 1
fi

BRANCH=$(git branch --show-current)
if [ -z "$BRANCH" ]; then
  echo "Detached HEAD; check out the intended branch before publishing." >&2
  exit 1
fi

COMMIT_MSG="${1:-"fix: auto migrations and auth configuration updates"}"

if [ -n "$(git status --porcelain)" ]; then
  echo "Staging and committing pending updates..."
  git add -A
  git commit -m "$COMMIT_MSG"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No origin remote is configured. Add one using a credential manager." >&2
  exit 1
fi

# Load token from .env if not exported
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ -f "$REPO_DIR/.env" ]; then
  TOKEN_FROM_ENV=$(grep -E '^(SUPABASE_ACCESS_TOKEN|SUPABASE_TOKEN)=' "$REPO_DIR/.env" 2>/dev/null | cut -d '=' -f2- | tr -d '"'\'' ')
  if [ -n "$TOKEN_FROM_ENV" ]; then
    export SUPABASE_ACCESS_TOKEN="$TOKEN_FROM_ENV"
  fi
fi

# Run migrations if credentials are provided locally
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || [ -n "${SUPABASE_TOKEN:-}" ]; then
  echo "Executing Supabase migrations..."
  sh "$REPO_DIR/run-migrations.sh"
fi

echo "Pushing the committed $BRANCH branch to origin..."
exec git push origin "$BRANCH"
