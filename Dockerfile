# CivicPress — demo / pilot deployment image.
#
# Multi-stage: build the monorepo, then a slim runtime with ffmpeg. The
# container is a thin wrapper over the verified CLI (`civic init` / `doctor` /
# `serve`); see deploy/docker-entrypoint.sh.
#
# Build-verified 2026-08-04 on an aarch64 host: `docker compose up` brings up
# api + ui + nginx, the API self-initializes, and admin login works through nginx.

# ---------- builder ----------
FROM node:22-bookworm AS builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# Source only (node_modules / dist / instance state are excluded by
# .dockerignore and rebuilt here).
COPY . .

RUN pnpm install --frozen-lockfile

# The core<->storage cycle defeats pnpm's build ordering; build core first,
# then everything (mirrors CI).
RUN pnpm --filter @civicpress/core run build

# The UI's API base URL is baked at BUILD time (the UI is an SPA, ssr:false).
# Empty = same-origin, so the browser calls /api on whatever host serves it —
# correct behind the reverse proxy.
ENV CIVIC_API_CLIENT_BASE=""
RUN pnpm -r run build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime

# Runtime deps:
#  - git: CivicPress commits records to a Git repo (`civic init` runs git init +
#    an initial commit); required, not optional.
#  - ffmpeg/ffprobe: broadcast-box redaction and (optionally) transcription.
#  - tini: correct signal handling / zombie reaping.
# Transcription (whisper.cpp) is intentionally NOT bundled to keep the image
# lean and the build network-independent; enable it by mounting a whisper-cli
# binary + ggml model and setting transcription.* in data/.civic/config.yml.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app /app
COPY deploy/docker-entrypoint.sh /usr/local/bin/civic-entrypoint
RUN chmod +x /usr/local/bin/civic-entrypoint

# The instance (data/, .system-data/, storage/) is created + persisted here;
# mount a volume at /instance.
WORKDIR /instance

EXPOSE 3000 3001 3030
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/civic-entrypoint"]
CMD ["serve"]
