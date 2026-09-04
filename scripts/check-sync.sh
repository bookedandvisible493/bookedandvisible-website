#!/usr/bin/env bash
# Run before starting any work in this repo. Cloudflare Pages deploys
# straight from `main` with no staging step, and this repo has a history of
# being edited directly on github.com (see "Add files via upload" commits) —
# so a local checkout can go stale without any local signal that it happened.
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch origin --quiet

behind=$(git log --oneline HEAD..origin/main | wc -l | tr -d ' ')
ahead=$(git log --oneline origin/main..HEAD | wc -l | tr -d ' ')

if [ "$behind" -eq 0 ] && [ "$ahead" -eq 0 ]; then
  echo "In sync with origin/main."
  exit 0
fi

if [ "$behind" -gt 0 ]; then
  echo "WARNING: local main is $behind commit(s) behind origin/main:"
  git log --oneline HEAD..origin/main
  echo
  echo "Run 'git pull' (or 'git reset --hard origin/main' if you have no local"
  echo "work worth keeping) before editing anything."
fi

if [ "$ahead" -gt 0 ]; then
  echo "NOTE: local main is $ahead commit(s) ahead of origin/main:"
  git log --oneline origin/main..HEAD
fi

exit 1
