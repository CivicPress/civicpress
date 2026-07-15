#!/usr/bin/env bash
# audit-truth-check: scans the working tree for documented overclaim
# patterns and exits non-zero if any are found outside the allow-list.
#
# Background: the 2026-05 CivicPress manifesto-fit audit found 205
# findings, many tied to language like "production-ready" / "100%
# Functional" / "Top 0.1%" / "stable v1.0.0" appearing in user-facing
# docs that didn't match the code. Phase 2b — Truth Restoration —
# cleans this up; this script is the recurring gate that prevents
# the language from creeping back.
#
# Usage:
#   ./scripts/audit-truth-check.sh              # scan whole repo
#   ./scripts/audit-truth-check.sh path1 path2  # scan specific paths
#   make audit-truth-check                       # same as no-arg form
#
# Allow-list: scripts/audit-truth-check-allowlist.txt
# Patterns:  defined below in PATTERNS array.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ALLOWLIST="$SCRIPT_DIR/audit-truth-check-allowlist.txt"

PATTERNS=(
  "production-ready"
  "Production-Ready"
  "100% Functional"
  "100% functional"
  "Stable & Production"
  "stable v1.0"
  "Stable v1.0"
  "Top 0\\.1%"
  "95% production"
  "All goals completed"
  "All targets met"
  "Fully Implemented and Production"
)

# Build a grep --exclude-dir / --exclude args list from the allow-list.
EXCLUDE_ARGS=()
while IFS= read -r line; do
  # Skip blank / comment lines.
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  # Strip trailing slash for grep semantics.
  trimmed="${line%/}"
  if [[ "$trimmed" == */* ]]; then
    # Path with a slash → exclude as a file path, also as a dir name match.
    EXCLUDE_ARGS+=("--exclude=$(basename "$trimmed")")
  else
    EXCLUDE_ARGS+=("--exclude=$trimmed")
  fi
done < "$ALLOWLIST"

# Directory excludes (one per allow-list entry that ends in /).
EXCLUDE_DIRS=()
while IFS= read -r line; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  if [[ "$line" == */ ]]; then
    EXCLUDE_DIRS+=("--exclude-dir=$(basename "${line%/}")")
  fi
done < "$ALLOWLIST"

# Default scan paths: the repo root.
if [[ $# -eq 0 ]]; then
  SCAN_PATHS=(".")
else
  SCAN_PATHS=("$@")
fi

found_any=0

for pattern in "${PATTERNS[@]}"; do
  matches=$(grep -rn \
    "${EXCLUDE_ARGS[@]}" \
    "${EXCLUDE_DIRS[@]}" \
    --include='*.md' \
    --include='*.json' \
    --include='*.ts' \
    --include='*.tsx' \
    --include='*.vue' \
    --include='*.yaml' \
    --include='*.yml' \
    --binary-files=without-match \
    -E "$pattern" "${SCAN_PATHS[@]}" 2>/dev/null || true)

  # Additional allow-list filter: drop matches whose path is allow-listed.
  if [[ -n "$matches" ]]; then
    filtered=""
    while IFS= read -r m; do
      [[ -z "$m" ]] && continue
      path="${m%%:*}"
      skip=0
      while IFS= read -r al; do
        [[ -z "$al" || "$al" =~ ^[[:space:]]*# ]] && continue
        # Match if the path starts with the allow-list entry
        if [[ "$path" == "$al"* ]] || [[ "./$path" == "./$al"* ]] || [[ "$path" == "./$al"* ]]; then
          skip=1
          break
        fi
        # Also match if the allow-list entry is a directory and the path is inside.
        if [[ "$al" == */ ]] && [[ "$path" == *"${al}"* ]]; then
          skip=1
          break
        fi
      done < "$ALLOWLIST"
      if [[ "$skip" -eq 0 ]]; then
        filtered+="$m"$'\n'
      fi
    done <<< "$matches"
    if [[ -n "$filtered" ]]; then
      found_any=1
      echo "PATTERN: $pattern"
      echo "$filtered"
    fi
  fi
done

if [[ "$found_any" -eq 1 ]]; then
  echo
  echo "audit-truth-check: FAILED — overclaim patterns found outside allow-list."
  echo "Fix the matches or extend scripts/audit-truth-check-allowlist.txt with rationale."
  exit 1
fi

echo "audit-truth-check: PASS — no overclaim patterns found outside allow-list."
exit 0
