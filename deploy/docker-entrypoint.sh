#!/usr/bin/env bash
# CivicPress container entrypoint — a thin wrapper over the verified CLI.
#
#   serve  (default) : first run stands up the instance (civic init --profile
#                      demo + admin), runs a preflight (civic doctor), then
#                      `civic serve` (API + realtime + transcription +
#                      broadcast-box, in-process).
#   ui               : serve the built Nuxt SPA.
#   <anything else>  : exec it verbatim (escape hatch, e.g. `civic doctor`).
set -euo pipefail

CLI=(node /app/cli/dist/index.js)
INSTANCE_DIR="${CIVIC_INSTANCE_DIR:-/instance}"
mode="${1:-serve}"

case "$mode" in
  ui)
    export PORT="${UI_PORT:-3030}"
    # The API base URL was baked empty at build time, so the browser calls /api
    # on its own origin (behind the reverse proxy).
    exec node /app/modules/ui/.output/server/index.mjs
    ;;

  serve)
    cd "$INSTANCE_DIR"

    # CivicPress commits records to Git; a fresh container has no git identity,
    # so the initial commit would fail. Set a default (override via env).
    git config --global user.email "${CIVIC_GIT_EMAIL:-civicpress@localhost}" >/dev/null 2>&1 || true
    git config --global user.name "${CIVIC_GIT_NAME:-CivicPress}" >/dev/null 2>&1 || true

    if [ ! -f "$INSTANCE_DIR/.civicrc" ]; then
      echo "civic: no instance at $INSTANCE_DIR — initializing…"
      profile="${CIVIC_PROFILE:-demo}"
      admin_user="${CIVIC_ADMIN_USER:-admin}"
      admin_email="${CIVIC_ADMIN_EMAIL:-admin@example.org}"

      admin_pw=""
      if [ -n "${CIVIC_ADMIN_PASSWORD_FILE:-}" ] && [ -f "${CIVIC_ADMIN_PASSWORD_FILE}" ]; then
        admin_pw="$(cat "${CIVIC_ADMIN_PASSWORD_FILE}")"
      elif [ -n "${CIVIC_ADMIN_PASSWORD:-}" ]; then
        admin_pw="${CIVIC_ADMIN_PASSWORD}"
      fi

      if [ -n "$admin_pw" ]; then
        printf '%s' "$admin_pw" | "${CLI[@]}" init --yes --profile "$profile" \
          --admin-user "$admin_user" --admin-email "$admin_email" \
          --admin-password-stdin
      else
        echo "civic: WARNING — no CIVIC_ADMIN_PASSWORD[_FILE]; creating an instance without an admin (use 'civic users:bootstrap-admin' later)." >&2
        "${CLI[@]}" init --yes --profile "$profile"
      fi
    fi

    # Preflight — surface environment problems in the logs; non-fatal (a hard
    # failure like a missing secret would stop `serve` anyway).
    "${CLI[@]}" doctor || echo "civic: doctor reported problems (see above)."

    exec "${CLI[@]}" serve
    ;;

  *)
    exec "$@"
    ;;
esac
