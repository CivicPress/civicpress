# Plan: Deployment & Onboarding Layer (BroadcastBox demo enabler)

**Created:** 2026-08-04
**Branch:** `feat/deploy-onboarding-layer` (off `develop`; PR → `develop` when coherent)
**Status:** in progress — D1 done

## Why

External interest in the BroadcastBox feature → we want a shareable,
product-looking demo (a thin operator UI + the live pipeline) on a deployed
instance. Two source-verified review passes (server + hardware, then CLI/init +
deployment) found:

- **BroadcastBox itself is demo-ready** end-to-end: capture → upload → _verified_
  redaction (only black+silent variants ever published) → publish → transcript.
  Hardware-free capture works (laptop webcam **or** `SYNTHETIC_CAPTURE_SOURCE`).
- **The app has a real production run path** — two processes: the API
  (`node modules/api/dist/index.js`, :3000) hosting realtime (:3001) +
  transcription + broadcast-box **in-process**, and the UI (`nuxt preview`,
  :3030) — but **zero deployment glue** (no Docker/nginx/systemd/deploy scripts;
  `docs/specs/deployment.md` is `planned`, and its port table is inverted).
- **The init→run flow is dev-only**, with four P0 blockers for an
  unattended/public stand-up (see Deliverables).
- **Security gotcha — public reads = _indexed_, not `status=published`.**
  `record-store` list/search filter only `workflow_state != 'internal_only'`;
  get-by-id filters nothing; `civic index` loads every on-disk record as public
  (default `draft`). Curate what we index on a public demo; file the missing
  published-only gate to the backlog.

**Decision (2026-08-04):** build the deployability layer first, then deploy to a
**fresh cloud VM**. (This dev VM is NAT'd — no inbound; a `cloudflared` tunnel is
the fastest tunnel-to-live if we ever want one.) Then build the operator UI.

## Deliverables

- [x] **D1 — `civic users:bootstrap-admin`** (empty-instance guard;
      `--password-stdin`): a scriptable first admin over the real password path,
      without the simulated-auth backdoor. **Fixes Blocker 2.**
      _`cli/src/commands/users.ts`; verified E2E: create → guard-refuse → login._
- [x] **D2 — Secret + env UX:** `civic init` ensures/persists/prints a secret
      (`SecretsManager.ensureSecretPersisted`); `CIVICPRESS_SECRET_FILE` (Docker
      secrets); `.env.example`. **Fixes Blocker 3.** _(dotenv loading + secrets
      unit tests deferred.)_
- [x] **D3 — Complete `--yes` init:** routes `--yes` through the full pipeline
      (DB, storage, secret, git, index) + `--admin-*` flags + `--modules` /
      `--profile demo` module enablement — one command → a loginable,
      demo-configured instance. **Fixes Blocker 4.** _(standalone `civic
      config:enable` + idempotency hardening deferred.)_
- [x] **D4 — `civic serve`:** boots the API (+ in-process realtime /
      transcription / broadcast-box) as a child process, forwarding signals,
      with a ready-banner showing each subsystem's live/idle state.
      **Fixes Blocker 1 (FA-CLI-006).**
- [x] **D5 — Packaging:** multi-stage `Dockerfile` (node 22 + ffmpeg) +
      `deploy/docker-compose.yml` (api / ui / nginx, Docker secrets) + nginx
      reverse-proxy config + a thin `deploy/docker-entrypoint.sh` over
      `civic init --profile demo` / `civic doctor` / `civic serve`. Secret via
      `CIVICPRESS_SECRET_FILE`; admin via `CIVIC_ADMIN_PASSWORD_FILE`. whisper
      left opt-in (lean, network-independent build). ⚠️ **build-verify on a
      Docker host** — authored without a local daemon; bash/YAML/UI-output-path
      checked.
- [ ] **D6 — Curated demo seed:** only the records we want public (incl. one
      broadcast session), respecting "public = indexed".
- [ ] **D7 — Runbook + pre-public security checklist;** promote
      `deployment.md` from `planned` + fix its inverted port table; backlog note
      for the missing published-only gate.

- [x] **D8 — `civic doctor`** (env preflight): checks node, signing secret,
      auth posture (fails on the simulated-auth backdoor), ffmpeg/ffprobe,
      whisper, and modules — each with a fix hint; exits non-zero on a hard
      failure so it can gate a deploy. Standalone command sharing the status
      inspector (`env-status.ts`) with `civic serve`.

## Design goal (2026-08-04)

**"Deploy a public instance" and "a new dev boots a local instance" are the same
`zero → running, loginable` path** — the environment flips the posture. One
command must "just work" on localhost with zero config (dev), and fail safe +
loud under production `NODE_ENV` (deploy).

### Refinements folded into the deliverables

- **D3 becomes a true one-shot:** `civic init --yes` is complete and takes
  `--admin-user/--admin-password[-stdin]` + `--profile demo` (enables
  broadcast-box+transcription and seeds curated data). Init is **idempotent**
  (safe re-run). Module enablement via `civic config:enable <module>` (no YAML
  hand-edits).
- **D2 secret is 12-factor:** accept `CIVICPRESS_SECRET` **or**
  `CIVICPRESS_SECRET_FILE` (Docker/K8s secrets); on-disk `secrets.yml` for dev.
- **D4 `civic serve` prints a ready-banner** showing each subsystem's real state
  (`transcription: OFF (whisper not found …)`) — makes the crash-safe silent
  gates visible — plus `--with-ui` / `--open`.
- **D5 Docker image also backs a `.devcontainer.json`** (clone → reopen in
  container → `civic init --yes --profile demo` → `civic serve`, zero local
  ffmpeg/whisper). Wire if the image lands cleanly.

## Sequence

1. bootstrap + secrets (D1 + D2) → 2. complete `--yes` one-shot (D3) →
   3. `civic serve` + `civic doctor` (D4 + D8) → 4. packaging + seed (D5 + D6) →
   5. runbook + security (D7).

Each deliverable ships tested + committed on the branch.

## Pre-public security must-dos (for the eventual deploy)

Pin `CIVICPRESS_SECRET`; set the admin password (D1); `NODE_ENV=production` +
unset `CIVIC_ALLOW_SIMULATED_AUTH`; `TRUST_PROXY=true`; **curate what is
indexed**; keep `recordings_raw` private (already fail-closed); add security
headers for the UI origin at nginx (the API already ships helmet); remove any
stray cloud service-account key from `.system-data`.

## Not in scope (roadmap-tier)

Full productionization (Terraform/IaC, blue-green, multi-region, autoscaling);
SSG public prerender (`ui-003`); the operator-UI build (separate workstream once
a deployed instance exists).
