#!/usr/bin/env bash
# Seed a CivicPress instance with a small, CURATED set of public civic records.
#
# Why curated: public reads are gated only by `workflow_state != 'internal_only'`
# (NOT by `status`), and indexing publishes EVERY on-disk record. So on a public
# demo you must place ONLY records that are safe to be public. This copies a
# hand-picked subset of the bundled demo records — all inherently-public civic
# documents — and syncs them into the queryable index (`index --sync-db`).
#
# A broadcast SESSION is deliberately NOT seeded here: it needs real A/V + a
# redacted recording + a transcript, produced by recording a meeting on the
# running instance (device or synthetic capture). See deploy/README.md.
#
# Usage:  deploy/seed-demo.sh [INSTANCE_DIR]     (defaults to the current dir)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI=(node "$REPO/cli/dist/index.js")
SRC="$REPO/cli/src/demo-data/records"
INSTANCE_DIR="${1:-$PWD}"

# Hand-picked, obviously-public civic documents. Edit to taste.
CURATED=(
  bylaw-parking-regulations.md
  bylaw-noise-ordinance.md
  bylaw-zoning-code.md
  policy-environmental-protection.md
  policy-accessibility.md
  resolution-budget-2025.md
)

dest="$INSTANCE_DIR/data/records"
mkdir -p "$dest"
count=0
for f in "${CURATED[@]}"; do
  if [ -f "$SRC/$f" ]; then
    # Normalize to published for the viewer (visibility is by index, not status).
    sed 's/^status:.*/status: published/' "$SRC/$f" >"$dest/$f"
    echo "  seeded: $f"
    count=$((count + 1))
  else
    echo "  (skip, not found: $f)" >&2
  fi
done

echo "civic: seeded $count curated record(s) into $dest; syncing to the index…"
(cd "$INSTANCE_DIR" && "${CLI[@]}" index --sync-db)
echo "civic: done — ONLY these $count records are public. Edit the CURATED list to change that."
