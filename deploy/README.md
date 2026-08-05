# Deploying CivicPress (demo / pilot)

This directory deploys a full CivicPress instance — the API (+ in-process
realtime, transcription, and the **broadcast-box** appliance backend) and the
Nuxt UI — behind an nginx reverse proxy.

Two paths: **Docker** (recommended) or **manual**. Both stand the instance up
through the same verified CLI commands (`civic init` → `civic doctor` →
`civic serve`).

> **Status:** **build-verified 2026-08-04** (aarch64) — `docker compose up`
> brings up api + ui + nginx, the API self-initializes (secret + modules +
> admin), `civic doctor` passes, and admin login works through nginx. (Building
> it caught + fixed a missing `git` in the runtime image.)

---

## Ports (corrected)

`docs/specs/deployment.md`'s port table is inverted. The real model:

| Component | Port | Notes |
| --------- | ---- | ----- |
| API (+ broadcast-box routes) | **3000** | `$PORT` |
| Realtime WS (collab + device) | **3001** | path `/realtime`, in the API process |
| UI (Nuxt SPA) | **3030** | `nuxt preview` |

nginx maps `/` → UI, `/api/` → API, `/realtime` → the WS.

---

## Option A — Docker (recommended)

**Prereqs on the host:** Docker + Docker Compose, a DNS name pointing at it, and
ports 80/443 open. ffmpeg is baked into the image; whisper.cpp (transcription)
is opt-in (see below).

```bash
# 1. Secrets (never commit these)
mkdir -p deploy/secrets deploy/certs
openssl rand -hex 32 > deploy/secrets/civicpress_secret
printf 'Ch4ngeMe-Str0ng!' > deploy/secrets/civic_admin_password

# 2. Build + run
cd deploy
docker compose up -d --build          # api + ui + nginx

# 3. TLS (Let's Encrypt) — put fullchain.pem + privkey.pem in deploy/certs/,
#    then uncomment the 443 server in nginx/civicpress.conf and:
docker compose restart nginx

# 4. Curated public content (see "Seeding"), then preflight:
docker compose exec api node /app/cli/dist/index.js doctor
```

On first boot the entrypoint runs `civic init --yes --profile demo` (creating the
admin from `CIVIC_ADMIN_PASSWORD_FILE`), so the instance is loginable
immediately. The instance persists in the `civic-instance` volume.

---

## Option B — Manual (systemd / pm2 + nginx)

**Prereqs:** Node ≥ 22, pnpm ≥ 9, **ffmpeg**, nginx, certbot. Optional for
transcripts: whisper.cpp + a ggml model.

```bash
pnpm install && pnpm run build

# Pin a secret (so sessions survive restarts) and stand the instance up:
export CIVICPRESS_SECRET=$(openssl rand -hex 32)
printf 'Ch4ngeMe-Str0ng!' | node cli/dist/index.js init --yes --profile demo \
  --admin-user admin --admin-email admin@your-town.ca --admin-password-stdin

# Curated public content + a preflight:
deploy/seed-demo.sh .
node cli/dist/index.js doctor          # exits non-zero on a hard problem

# Run the two processes (keep NODE_ENV=production; do NOT set simulated auth):
NODE_ENV=production TRUST_PROXY=true node cli/dist/index.js serve   # API :3000/:3001
NODE_ENV=production PORT=3030 pnpm --filter @civicpress/ui preview  # UI  :3030
```

Put both under `systemd` (or pm2/forever). Example unit for the API:

```ini
# /etc/systemd/system/civicpress-api.service
[Service]
WorkingDirectory=/srv/civicpress-instance
Environment=NODE_ENV=production TRUST_PROXY=true CIVICPRESS_SECRET_FILE=/etc/civicpress/secret
ExecStart=/usr/bin/node /srv/civicpress/cli/dist/index.js serve
Restart=always
```

Front both with nginx (`deploy/nginx/civicpress.conf`) and certbot for TLS.

---

## Seeding curated content

Public reads are gated only by `workflow_state != 'internal_only'` — **not by
`status`** — and indexing publishes **every** on-disk record. So place only
records that are safe to be public:

```bash
deploy/seed-demo.sh /path/to/instance   # copies a curated subset + index --sync-db
# Docker: copy records into the volume, then:
docker compose exec api node /app/cli/dist/index.js index --sync-db
```

Edit the `CURATED` list in `seed-demo.sh` to control exactly what is public.

---

## Recording a demo broadcast session (the compelling part)

The broadcast-box **pipeline** (record → upload → verified redaction → publish →
transcript) is ready, but a session record needs **real A/V** — so it is created
by recording a meeting on the running instance, not seeded:

1. In CivicPress, register a device and mint a one-time enrollment code
   (`POST /api/v1/broadcast-box/devices`).
2. Point a device at the deployed HTTPS host and enroll (the device refuses
   cleartext to a non-loopback host, so real TLS is required). The device can be
   the appliance, a **laptop webcam**, or a **synthetic** source
   (`SYNTHETIC_CAPTURE_SOURCE=testsrc`) — see the `CivicPress/BroadcastBox` repo.
3. Start a session, record with an in-camera (redacted) window, stop.
4. Watch it upload → redact → (optionally) transcribe, then open the published
   session record: the redacted video plays and the in-camera window is black +
   silent. The fully self-contained `e2e/broadcast-box-live/` harness does this
   end-to-end without hardware.

Enable transcription (optional) by installing whisper.cpp + a ggml model and
setting `transcription.enabled/engine/whisper_cpp.*` in
`data/.civic/config.yml`; `civic doctor` / `civic serve` will show it live.

---

## Pre-public security checklist

Run `civic doctor` — it fails (exit 1) on the hard ones. Before exposing:

- [ ] **Secret pinned** — `CIVICPRESS_SECRET` (≥64 hex) or `CIVICPRESS_SECRET_FILE`.
- [ ] **Admin password set** — a fresh instance's `admin` has no password until
      you set one (done by `init --admin-*` / `users:bootstrap-admin`).
- [ ] **`NODE_ENV=production` and `CIVIC_ALLOW_SIMULATED_AUTH` unset** — the
      simulated-auth backdoor must be off (doctor fails if it is on).
- [ ] **`TRUST_PROXY=true`** behind nginx (correct client IPs + `req.secure`).
- [ ] **Index only public records** — "public = indexed"; curate the seed.
- [ ] **Raw recordings stay private** — `recordings_raw` is fail-closed
      (admin-only); only redacted variants are ever published.
- [ ] **Editor attachments follow their record** — uploads from the record
      editor land in the `attachments` folder (`access: authenticated`), so a
      DRAFT's attachments are staff-only. They open to citizens automatically
      once a record referencing the file is `published`. Files a user picks
      from the `public` folder are public immediately, as before — check the
      folder before attaching something that should wait for publication.
- [ ] **UI security headers at nginx** — the API ships helmet; the UI (Nitro)
      does not. `civicpress.conf` adds them for the UI origin.
- [ ] **No stray cloud keys** in `.system-data/` (e.g. a GCS service-account
      JSON) before copying/backing up the instance.
- [ ] **Rate limits** are on by default (API 1000/15m, auth 30/15m).
