# CivicPress Full-Stack Security & Quality Audit — 2026-07-02

**Date:** 2026-07-02 **Repos:** monorepo `civicpress` @
`refactor/phase-5-broadcast-box-server` (tip `a83a340`) + hardware repo
`civicpress-broadcast-box` @ `refactor/phase-4-enrollment-hardening` (local-only
per the origin/main freeze) **Anchor master plan:**
`docs/plans/2026-05-17-base-refactor-master-plan.md` §4/§5 **Prior registry:**
`docs/audits/2026-05-16-manifesto-fit-findings.md` (the 205-finding
manifesto-fit audit) **Prior reports:** `docs/audits/phase-2a … phase-5` closure
reports **Convention:** `docs/plans/finding-tracking-convention.md` **Author:**
Claude (Fable 5), commissioned by the maintainer **Threat model:** CivicPress
API + UI are **internet-exposed** (public municipal transparency portal); the
BroadcastBox appliance sits on the **town-hall LAN** and dials out to the
server; a hostile actor may be on that LAN and the device↔server link may cross
untrusted networks; a malicious/compromised server is in scope for device-side
findings.

---

## Summary

This is a fresh, full-depth audit of the entire CivicPress surface — the base
platform (core, API, CLI, UI, storage), the reintroduced BroadcastBox server
module + protocol + transcription service, and the Python hardware appliance —
commissioned mid-refactor to find security gaps and improvement opportunities
before the origin/main unfreeze.

**Verdict: the base-refactor spine is holding — most of the 2026-05
manifesto-fit findings that were closed are genuinely closed (verified: storage
quotas enforced, failover probing real, cloud SDKs optional, DOMPurify wired,
the `@nuxt/ui-pro` vendor-lock removed from the monorepo UI, notifications
honesty restored). But the new work re-opened real ground, and several long-tail
base issues were never closed.** This audit confirms **4 Critical, 22 High, 40
Medium, and 16 Low** findings after adversarial verification (each Critical/High
was independently re-checked by two skeptical verifiers; a number of candidate
issues were **refuted or downgraded** and are recorded as such so the registry
stays honest).

The through-line is the refactor's own spine — _make truth true_: the most
dangerous findings are places where a **control that appears to exist does not
actually protect the thing it names**. The clerk's "in-camera" button does not
stop the camera. The "encryption at rest" stores the key next to the ciphertext.
`helmet`/`express-rate-limit` are installed but never wired. A "private" storage
folder is readable by the anonymous public. `validateTransition` guards one of
four status-write paths. These are not merely bugs; on a Trust/Transparency
platform they are trust theatre, and they are the report's priority.

### The four Criticals (headline)

1. **`FA-API-001` — Unauthenticated remote admin takeover.**
   `POST /api/v1/auth/simulated` is on the public (no-auth) router and gated
   only by `if (NODE_ENV === 'production')`. In a default deployment where
   `NODE_ENV` is unset, any anonymous remote user can
   `POST {"username":"x","role":"admin"}` and receive a **real admin bearer
   token**. Full auth+authz bypass. (Independently found twice — `V1` and `D6` —
   both survived 2/2 escalation.)
2. **`FA-BB-002` — Closed-session (in-camera) VIDEO is publicly downloadable.**
   The device never stops recording when a clerk toggles _in-camera_; the **full
   MP4 including the closed window** is uploaded to a storage folder marked
   `access: 'public'`, and `GET /api/v1/storage/files/:id` serves public-folder
   bytes **without auth**. Only the _transcript_ excludes in-camera. Amplified
   by `FA-STOR-001`, an unauthenticated endpoint that **enumerates every
   recording's UUID**, so no record needs to be published and no UUID needs
   guessing. This is a direct violation of the platform's core privacy promise
   and of municipal open-meeting law.
3. **`FA-BB-001` — Any enrolled device can rewrite another session's capture
   block.** `session.manifest` is applied to the device-supplied `session_id`
   with **no check that the sending device owns that session**. A single
   compromised/rogue enrolled appliance can reclassify another meeting's
   in-camera segments as `public`, causing the server to transcribe and publish
   closed-session audio, or bind a forged recording to a session.
4. **`FA-HW-001` — Device config API is unauthenticated on `0.0.0.0`.** "AP
   mode" never actually creates an access point (no `hostapd`/`dnsmasq`); the
   FastAPI config server binds all interfaces on plain HTTP with no auth,
   exposing the enrollment code, live camera preview, factory reset, and Wi-Fi
   password to any host on the town-hall LAN — and lets an attacker **repoint
   the device at their own server**.

### Master-plan exit-criteria — honest assessment

| Criterion                                                                             | Status                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base refactor (Phase 2a–2d) closed the 20 Critical + structural findings              | **MOSTLY TRUE** — verified closures are real; but `api-005` (no rate-limit/headers) and the `ui-003` SSR half remain **open**, and this audit surfaces new Criticals not in the 2026-05 registry.                                                                    |
| Phase 3 (realtime) reintroduced Yjs-only, excised device legacy                       | **TRUE** — the `realtime-001…004` findings are stale (they describe the old paused server); the new device-room code is cleaner, though it carries the `FA-BB-001` manifest-trust gap.                                                                               |
| Phase 4/5 (BroadcastBox) "device→record→transcript, in-camera excluded, proven blank" | **PARTIAL / MISLEADING** — the _transcript_ exclusion is real, but the **video is not redacted and is public** (`FA-BB-002`). The closure language "in-camera proven blank" is true of the transcript only and should be corrected to avoid overclaim.               |
| "All `broadcast-box-*` findings closed/hardened"                                      | **PARTIAL** — the 15 claimed closures largely verify (streaming upload, uuid room-keying, one-time codes, whisper `spawn`, fail-closed operator auth), but the enrollment code is **not bound to the device UUID** (`FA-BB-004`), undercutting the BB-HW-013 intent. |

---

## Where the audit rework stands (reconciled 2026-07-02)

> **Do not trust the stale trackers.** The findings-registry "Snapshot" table
> (`2026-05-16-manifesto-fit-findings.md:388-400`) was frozen ~2026-05-28 and
> never re-tallied; `docs/project-status.md` / `docs/roadmap.md` are a
> 2026-06-03 snapshot. Trust the per-finding closure rows. The tracking drift is
> itself a Medium finding (`FA-OPS-001`).

| Phase                  | Outcome                                                                                | Status                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 2a Bleed-Stop          | 15/20 Criticals closed; deps 143→21 advisories; dishonest audit rows purged            | DONE                                                                         |
| 2b Truth Restoration   | Honest status/specs; +161 real tests; `audit-truth-check` gate                         | DONE                                                                         |
| 2c / 2c.5 Foundation   | Delete-or-wire 11 orphaned subsystems; unified AuditChannel; killed dual-notifications | DONE                                                                         |
| 2d Structural          | God-files decomposed; module contract; `:any` casts 1621→223                           | DONE                                                                         |
| 3 Realtime             | Yjs-only; device legacy excised (`realtime-server` 3581→1495); Yjs→review-gated draft  | DONE (local)                                                                 |
| 4 BroadcastBox HW      | AGPL license; canonical protocol; one-time enrollment; single reconnection FSM         | **CONDITIONAL** — installer (BB-HW-009) in progress; audio artifact deferred |
| 5 BroadcastBox reintro | Module on clean contract; capture→record→transcript; meeting model; fail-closed perms  | **CONDITIONAL** — real-hardware capstone + narrative sync carried            |

**Ledger (reconciled):** 205 findings (20C/65H/79M/41L). **Criticals: 20/20
closed** (caveat: `ui-003` SSR half still open). **High: ~31 closed / ~33 open /
1 wontfix.** Medium+Low tail: largely untouched by design. Still-open High
themes the refactor has not resolved: the CLI safety/UX tail (`cli-002…006`),
the UI analytics-injection + config-drift (`ui-004/006/007`), storage
resilience/sanitization (`storage-005/007/008`), workspace hygiene + sensitive
data at rest (`workspace-002/004/005`), sibling-repo de-scoping never formalized
(`ingest-*`, `site-004`), and functional-claim stubs still shipping (`core-002`,
`api-005/006`).

---

## Method

Two-stage. **(1) Map:** six parallel readers built architecture + security maps
of core, API+auth, UI, the BroadcastBox server, and the Python device, plus a
conventions/ledger reconciliation. **(2) Verify + deepen:** a 24-task workflow
read the actual code for every candidate — 14 grouped verification tasks across
both repos, 6 cross-cutting deep traces (privacy chain, path-traversal
reachability, DDL-injection reachability, saga integrity, publication authz, and
the NODE_ENV-unset bypass matrix), and 4 gap-fillers (storage, CLI,
dependencies, completeness). **Every Critical/High finding was re-checked by two
independent adversarial verifiers** — one for reachability in a default
production deployment, one hunting for a compensating control. 36 agents, ~1.3M
tokens.

**Refuted / downgraded (kept honest):** the `record-manager` `relativePath`
traversal is **not remotely reachable** (no API route binds it — downgraded to a
defense-in-depth core hardening item); the core `migrations.ts` DDL sites use
**hardcoded identifiers** (refuted; only the admin-gated diagnostics auto-fix is
injectable); the backup-restore zip-slip is **CLI-only, admin-triggered** with
`node-tar` protections (refuted as remotely exploitable); the `RoleManager`
unknown-role fallback is **fail-_safe_** to least-privilege, not fail-open; the
`mock-` token and OAuth test bypasses require `NODE_ENV==='test'` and are
**inactive** when unset; `config.ts`'s fail-open gate is **unreachable**;
`system.ts` exposes only UI-needed record-type metadata;
`notifications-002/003/006`, `storage-001/004/006`, and `deps-006/007`
(axios/h3) are **genuinely fixed**; no committed secrets were found.

---

## Findings — Critical

Effort: **S** ≤ ½ day · **M** ~1–3 days · **L** > 3 days / cross-cutting.

### FA-API-001 · Critical · S · **closed** (`da2ff38`, branch `refactor/phase-6-audit-remediation-criticals`) · Unauthenticated admin-session minting via `POST /api/v1/auth/simulated`

`modules/api/src/routes/auth.ts:239-307` mounts `/simulated` on the public auth
router (`index.ts:277-285`, no `authMiddleware`). The only guard is
`if (process.env.NODE_ENV === 'production') return 403` (`auth.ts:240`). The
body `{username, role}` is validated only by `isValidRole` (`admin` passes); it
calls `authenticateWithSimulatedAccount`
(`core/src/auth/auth-service/oauth-ops.ts:267-303`), which persists a real DB
user at the requested role and returns a **real session token — no credential
required**. With `NODE_ENV` unset (the realistic default) the guard is false and
the endpoint is live. **Impact:** complete unauthenticated auth + privilege
escalation to admin (read/write all records incl. closed-session material, user
management), plus a persistent backdoor user. **Fix:** fail-closed — enable only
when `NODE_ENV==='development'|'test'` **and** an explicit opt-in flag
(`CIVIC_ALLOW_SIMULATED_AUTH`); never treat unset as non-production. Prefer not
mounting the route at all absent the dev flag. **Fixed (shipped `da2ff38`):**
new core helper `isSimulatedAuthEnabled()` — allowed only under `NODE_ENV==='test'`
or `NODE_ENV==='development'` **with** `CIVIC_ALLOW_SIMULATED_AUTH=true`; unset /
`production` / anything else denied. Enforced in the API route, the CLI twin
(`FA-CLI-001`), and core `authenticateWithSimulatedAccount` (throws) as a
defense-in-depth backstop. Tests: 6 policy unit cases + API 403 cases for both
unset `NODE_ENV` and `production`.

### FA-BB-002 · Critical · L · Closed-session (in-camera) video recorded, uploaded, and served publicly unauthenticated

> **CLOSED 2026-07-13.** Full fail-closed redaction pipeline, Commits A–G
> (`a046f73`, `99da16b`, `ba9f711`, `32b53cb`, `8275a3c`, `30e68da`,
> `782f406`); live dev backfilled + redacted; closed window verified black +
> silent on the PUBLISHED bytes. Design + closure detail:
> `docs/specs/2026-07-07-fa-bb-002-redaction-design.md`.

End-to-end trace (both repos, all links verified):

- **Device** — `command_handler.py:1155-1187` (`set_visibility('in_camera')`)
  only publishes an event; the sole consumer (`upload_coordinator.py:112-119`)
  appends a timestamp. **Nothing pauses/blanks/stops the encoder.** The full MP4
  is uploaded (`upload_coordinator.py:121-160`); the in-camera "exclusion" is a
  best-effort `segments` hint in `session.manifest` that is **lost if the socket
  is down** (`session_manifest_emitter.py:78-85`).
- **Server** — the recording is stored with `folder:'recordings'`
  (`upload-processor.ts:249`), which is `access:'public'` in both merged config
  and the `getDefaultConfig()` fallback (`storage-config-manager.ts:45-51`).
  `GET /api/v1/storage/files/:id` runs under `optionalAuth` and serves the bytes
  when the folder is public and `!req.user` (`single-file-handlers.ts:290-304`).
  **No server-side video redaction exists** — `applySessionManifest` only writes
  `segments` into metadata, and the transcription worker (`worker.ts:41-101`)
  uses them to exclude in-camera from the **transcript only**. **Impact:**
  legally-privileged closed-session A/V (personnel, litigation, land/labour) is
  captured in full and is downloadable by any unauthenticated remote user. The
  transcript exclusion is security theatre — it hides the words while the raw
  video of the same segment stays public. Directly reachable in default prod, no
  `NODE_ENV` dependency. **Fix (defense in depth):** (1) **device-side hard
  gate** — `set_visibility('in_camera')` must signal the encoder to stop/split
  so closed A/V is never written or uploaded (strongest; immune to a dropped
  manifest); **or** (2) **server-side physical redaction** — cut the in-camera
  ranges out of the stored MP4 before exposure, and default a recording with
  unknown segments to _not public_. **Immediate stopgap (S):** change
  `recordings.access` from `'public'` to `'authenticated'`/`'private'` and
  require a permission on `storage:download` — but this alone still exposes
  closed A/V to any logged-in `storage:download` holder, so it must be paired
  with (1) or (2). This finding is the collision between the intentional "A/V
  always public" architecture decision and the in-camera feature: the closed
  window must be exempted from "always public."

### FA-BB-001 · Critical · M · `session.manifest` has no device-ownership check (cross-session capture tampering)

> **CLOSED 2026-07-13.** Ownership check `4da2f51`; manifest can no longer
> bind `av_file` (FA-BB-013, `99da16b`); Ed25519-signed manifests (CP
> `e90dbc4` + HW `c38a0c6`): device key registered at enrollment (migration
> 004), signature over the exact wire bytes verified with replay/freshness
> checks, unsigned manifests dropped once a key is on record.

`device-room-handler.ts` (~567-613) reads `payload.session_id` +
`payload.capture` from an authenticated device and calls
`sessionController.applySessionManifest(sessionId, capture)`; the authenticated
`deviceAuth.deviceId` is **never passed down or compared**
(`session-controller.ts:552-596` writes `metadata.capture` as system-admin
`{id:1,role:'admin'}` to whatever session the device names). **Impact:** a
single compromised/rogue enrolled device (realistic on the hostile LAN per the
threat model, or via a stolen enrollment credential) can send `session.manifest`
for **any** `session_id` and overwrite `capture.segments`, reclassifying
in-camera windows as `public` — the transcription worker then transcribes and
publishes closed-session audio — or overwrite `av_file` to bind a forged
recording. Cross-tenant auth bypass on a Trust-critical write. **Fix:** pass
`deviceAuth.deviceId` into `applySessionManifest`; look up the broadcast session
and reject unless its `deviceId` matches the authenticated device; validate
`segment.visibility` against the enum and reject unknown session ids.

### FA-HW-001 · Critical · M · Device config API binds `0.0.0.0` unauthenticated (LAN takeover of enrollment credentials)

> **CLOSED 2026-07-13** (HW repo `e249fc9`). Loopback-only default bind
> (`AP_MODE_BIND_HOST` opt-in for LAN setup); mandatory per-boot setup token
> on every `/api` route except `/api/health` (console/journal +
> `data/setup_token` 0600); CORS credentials off; enrollment code never
> returned once enrolled; frontend carries the token via `?token=` →
> `X-Setup-Token`.

`web_server.py:103-109` binds uvicorn `0.0.0.0:8443` plain HTTP; `:59-65` sets
CORS `allow_origins=['*'] allow_credentials=True`; **no auth dependency on any
route**. Crucially `ap_mode/service.py::activate()` starts only the web server —
there is **no `hostapd`/`dnsmasq`/wlan setup anywhere** — so "AP mode" is a
misnomer that listens on the wired town-hall LAN. Any LAN host can
`GET /api/config` / `/api/enrollment/info` (enrollment code + `civicpress_url`
in plaintext) and `POST /api/config` to overwrite
`civicpress_url`/`device_uuid`/`enrollment_code`. **Impact:** an unauthenticated
LAN attacker reads the pairing secret and **repoints the device at an
attacker-controlled server**, MITMing all meeting A/V (including future closed
sessions), or enrolls a rogue device with the stolen one-time code. **Fix:**
bind to the AP-interface IP or `127.0.0.1`; add a mandatory device-generated
token (shown on local console/QR) enforced on every `/api` route;
`allow_credentials=False`; never return the enrollment code once enrolled.

---

## Findings — High

| ID          | Effort | Area           | Finding                                                                                                                                                                                                                                                                                                                                                           | Old ref                      |
| ----------- | ------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FA-API-002  | S      | API auth       | `BYPASS_AUTH=true` makes `middleware/auth.ts:26-37` trust the `X-Mock-User` header verbatim as the user (incl. `role`), with **no `NODE_ENV` hard-guard** — latent full bypass if the env var ever ships (e.g. leaked from CI). Not default-active.                                                                                                               | —                            |
| FA-API-003  | S      | API authz      | Geography `POST/PUT/DELETE` (`geography.ts:101/335/388`, mounted `optionalAuth` `index.ts:314`) check only `if(!req.user)` — **no `requirePermission`**; `GeographyManager` takes the user as an unused `_user`. Any self-registered `public` user can create/overwrite/**delete** municipal boundary GeoJSON.                                                    | —                            |
| FA-API-004  | S      | API infoleak   | Unauthenticated `GET /api/status`, `/status/git`, `/status/records` (`status.ts`, mounted no-auth `index.ts:335`) expose git file paths + **commit messages/authors**, **draft/pending/rejected record ids & filenames**, the `.civic` config listing, and `process.memoryUsage()`/`NODE_ENV`.                                                                    | —                            |
| FA-API-005  | S      | API traversal  | `POST /api/validation/record` (`validation.ts:342-357,401-421`, only `records:view`) path-joins a caller `recordId` containing `../` and `readFileSync`s the result — a self-registered `public` user reads arbitrary `.md` incl. closed-session minutes. Same shape in `diff/record-paths.ts`.                                                                   | —                            |
| FA-API-006  | S      | API hardening  | `helmet` + `express-rate-limit` + `compression` are declared in `modules/api/package.json` but **never wired** (zero call sites) — no security headers (HSTS/CSP/X-Frame/nosniff) and no rate limiting on the internet-exposed API.                                                                                                                               | api-005                      |
| FA-API-007  | M      | API DoS        | No lockout/throttle on `/auth/login`, `/auth/password`, `/users/register`; the `maxLoginAttempts`/`lockoutDuration` in `auth-config.ts:125-130` are **dead config**. bcrypt(12) on unauthenticated `/register` enables cheap CPU-amplification DoS + unlimited credential stuffing.                                                                               | —                            |
| FA-API-008  | M      | API authz      | Status-transition authorization is enforced only on `POST /:id/status` (`listing.ts:123-139` calls `validateTransition`). `PUT /:id`, `POST /:id/publish`, and create write `status` **verbatim** with only a coarse `records:edit` check — a restricted `clerk`/`legal_dept` role can fabricate an `approved`/`archived` record, bypassing separation-of-duties. | core-002                     |
| FA-CORE-001 | M      | Saga integrity | Crash-recovery **never runs** — `getStuckSagas`/`getFailedSagas` exist but have no production caller and there is no `SagaRecovery`. A process death between the SQLite write (step 1) and git commit (step 3) leaves SQLite and git **permanently divergent**, with the saga row stuck `executing`.                                                              | core-004                     |
| FA-STOR-001 | S      | Storage        | `GET /api/v1/storage/folders/recordings/files` (`listing-handlers.ts:61-209`, `optionalAuth`) **enumerates every recording's UUID unauthenticated** for any `access:'public'` folder — nullifying UUID-unguessability for `FA-BB-002` and leaking even unpublished/draft recordings.                                                                              | storage-002 (over-corrected) |
| FA-STOR-002 | S      | Storage        | The default `private` folder is readable/listable by the lowest-priv `public` role: handlers gate non-public folders only on `userCan('storage:download')`, which `roles.yml` grants to `public`, and `private` is treated identically to `authenticated`. "Authorized users only" confers no protection.                                                         | —                            |
| FA-BB-003   | S      | BB upload      | Device-controlled `fileName` (`uploads.ts:44`, only `isString`) flows into `path.join(uploadDir, fileName)` in `upload-processor.ts:98/218` — `../` escapes; attacker-controlled chunk bytes are written to an arbitrary path **before** the SHA-256 check → arbitrary file write (config/hook overwrite → plausible RCE) by a compromised/MITM'd device.         | —                            |
| FA-BB-004   | S      | BB enrollment  | `registerDevice` (`device-manager.ts:104-368`) looks the code up by hash and **never compares the client `deviceUuid` to the code's bound UUID** (the line-112 comment admits it). An intercepted one-time code lets an attacker register a rogue device **first** and receive a valid device token, locking out the real appliance. Defeats BB-HW-013's intent.  | BB-HW-013                    |
| FA-HW-002   | M      | HW privacy     | `POST /api/preview/offer` (`routes.py:662-684`, no auth) streams a live camera+mic WebRTC feed of the chamber to any LAN client; if AP mode overlaps a closed session, in-camera A/V leaks.                                                                                                                                                                       | —                            |
| FA-HW-003   | S      | HW DoS         | `POST /api/factory-reset` (`routes.py:586-626`) gates only on the constant string `"RESET"` (no auth) and wipes device identity + enrollment — any LAN user takes the appliance offline (recording DoS).                                                                                                                                                          | —                            |
| FA-HW-004   | S      | HW secrets     | The Fernet key is stored in the **same** SQLite `device_config` table as the token ciphertext (`credentials.py:44-78`) — the docstring admits it. Anyone who reads the DB recovers the long-lived device token.                                                                                                                                                   | BB-HW-013                    |
| FA-HW-005   | S      | HW secrets     | `state/manager.py:28-60` creates the DB dir/file with default umask (world-readable) and no `chmod 0600`, holding the key + ciphertext + **plaintext enrollment code + plaintext Wi-Fi password**. Any local unprivileged process reads them → device-identity takeover + LAN Wi-Fi disclosure.                                                                   | BB-HW-013                    |
| FA-HW-006   | S      | HW traversal   | Server-supplied `session_id` (`command_handler.py:1059`) flows unsanitized into `storage_root/<session_id>/…` and the ffmpeg output path (`:1117-1123`, `storage/service.py:58/95`) — `../` writes MP4s/dirs outside `storage_root` as the appliance user (malicious/compromised server).                                                                         | —                            |
| FA-HW-007   | S      | HW injection   | Server RTMP `url` is used as an ffmpeg **output target** with only a presence check (`command_handler.py:1920-1936` → `rtmp_service.py:76-88` → `ffmpeg_capture.py:1307-1308`); a `file:`/bare-path value makes ffmpeg overwrite an arbitrary file with FLV data.                                                                                                 | —                            |
| FA-HW-008   | S      | HW hijack      | `update_config` (`command_handler.py:1198-1213`) writes **any** server-supplied config key with no allowlist — a compromised/MITM server persistently overwrites `civicpress_url` (permanent redirect) or `encryption_key`.                                                                                                                                       | —                            |
| FA-HW-009   | M      | HW transport   | No TLS floor: `main.py:363` picks `ws` for any non-`https://` URL (the documented example is `http://`), and the token/enrollment code are then sent; there is **no refusal or warning** on cleartext. Bearer token + one-time code + uploads travel unencrypted across the (untrusted) network.                                                                  | —                            |
| FA-UI-001   | M      | UI XSS         | `app/app.vue:62-135` fetches `/api/v1/info` and **re-materializes `<script>` elements** from `analytics.inject_head/body_*` into `<head>`/`<body>` with no sanitization/allow-list/CSP; combined with JWT+CSRF in `localStorage` (`stores/auth.ts:115`, `useCsrf.ts`) any injected script exfiltrates tokens. Still-present.                                      | ui-004                       |
| FA-CLI-001 · **closed** (`da2ff38`) | S | CLI auth | `civic auth:simulated` is gated only by `NODE_ENV==='production'` (`cli/src/commands/auth.ts:328`), and core `authenticateWithSimulatedAccount` has no env check — on a host with `NODE_ENV` unset, `--role admin` mints a real admin token with no credential (the CLI twin of `FA-API-001`). **Fixed** with the shared `isSimulatedAuthEnabled()` gate + core backstop. | cli-010 |

**Closed on `refactor/phase-6b-audit-highs` (2026-07-13):**

- **FA-API-003** — `4d4c6f0`: `geography:manage` permission required on
  geography POST/PUT/DELETE (granted to admin + clerk); `generateFilename`
  sanitization confirmed.
- **FA-API-005** — `0e9f858`: `resolveInsideRecordsRoot` containment guard on
  every caller-influenced record-path join (`validation.ts` + `diff/record-paths.ts`).
- **FA-API-006** — `a6439dd`: `helmet` (CORP cross-origin for media),
  `express-rate-limit` (global + a strict auth window — also partial
  `FA-API-007`), and `compression` wired.
- **FA-BB-003** — `dcf3259`: upload `fileName` must be a plain basename
  (processor guard + route validator) before any disk write.
- **FA-BB-004** — `64d9392`: the enrollment code is bound to its issued
  `deviceUuid`; a mismatched UUID is rejected as an invalid code.
- **FA-UI-001** — `0086dfa`: analytics injection no longer executes inline
  scripts; external scripts need an https/same-origin `src` + attribute
  allowlist, other markup passes DOMPurify.
- **FA-API-002** — `5421ea1`: `BYPASS_AUTH`/`X-Mock-User` (auth + the CSRF
  skip) gated behind the fail-closed `isSimulatedAuthEnabled()` policy — inert
  in production even if the env var leaks.
- **FA-API-004** — `eb482ca`: `/api/status*` diagnostics moved behind
  auth + `system:admin` (were unauthenticated); liveness stays on `/health`.
- **FA-API-008** — `99158f5`: create/update/publish now enforce the
  workflow-transition rules (via `getControlledStatuses`), not just
  `POST /:id/status` — no more fabricating an approved/archived record.
- **FA-API-007** — `9cbe171`: real account lockout (`LoginThrottle` +
  `login_attempts` table) after N failed logins; complements the FA-API-006
  per-IP limit.
- **FA-CORE-001 / FA-CORE-006** — `22aa44c`: `SagaRecoveryService` runs at
  startup — releases orphaned locks + flags crashed-mid-flight sagas out of
  the permanent `executing` limbo; also fixed the `getFailedSagas` precedence
  bug it relies on.

**Closed in the BroadcastBox HW repo (`refactor/phase-4-enrollment-hardening`, 2026-07-13):**

- **FA-HW-004/005** — `bba2113`: Fernet key moved to a 0600 `device_key` file
  outside the DB (legacy key migrated + cleared); state DB dir/file chmod'd
  0700/0600.
- **FA-HW-006/007/008** — `bba2113`: `sessionId` validated before it becomes a
  path; RTMP url must be `rtmp(s)://`; `update_config` allowlists operational
  keys only (no `civicpress_url`/`encryption_key` hijack).
- **FA-HW-009** — `bba2113`: TLS floor — the device refuses to send credentials
  over cleartext `ws://` to a non-loopback host without an explicit opt-in.

### Medium/Low tail — saga cluster CLOSED (2026-07-14, monorepo `f37f2a7`)

- **FA-CORE-007** — resource-lock TTL defaults to saga timeout + 30 s
  (was 30 s vs 300 s); a concurrent saga on the same record now reliably
  gets `SagaLockError` for the whole run.
- **FA-CORE-008** — idempotency is real: auto keys = SHA-256 of stable
  operation content (user + target + request payload), not the per-call
  timestamp; explicit keys scoped per saga type + user; retry of a
  completed run returns the cached result (5-min auto / 24-h explicit
  window); identical in-flight op → new `SagaDuplicateError` (409);
  failed runs stay retryable.
- **FA-CORE-009** — UpdateRecord compensation always reverts
  `geography`/`attachedFiles`/`linkedRecords`/`linkedGeographyFiles`;
  fields *added* by the failed update are reset to SQL NULL.
- **FA-CORE-010** — archive `CommitToGit` stages the original path's
  deletion alongside the archive copy; committed tree verified via
  `git ls-tree` in the integration test.
- **FA-CORE-015** — CreateRecord contexts carry a pre-generated
  `metadata.recordId`, so creates acquire a resource lock like
  update/archive (double-submit creates also covered by FA-CORE-008).

Tests: `core/src/saga/__tests__/saga-hardening.integration.test.ts`
(9 cases, real SQLite) + FA-CORE-009/010 cases in the update/archive
saga integration suites.

### Medium/Low tail — BroadcastBox server mediums CLOSED (2026-07-14, monorepo `08fb4f7`)

- **FA-BB-005** — device-token signature compare is `crypto.timingSafeEqual`
  (length checked first), no longer `===`.
- **FA-BB-006** — token-level revocation: `broadcast_revoked_device_tokens`
  jti denylist (migration 005) checked on every validation, **fail-closed**
  on DB errors; refresh revokes the rotated-out jti (old token no longer
  valid until exp); `DeviceAuthService.revokeToken()` for leaked tokens.
- **FA-BB-007** — declared `fileSize` capped (16 GiB default,
  `BROADCAST_BOX_MAX_UPLOAD_BYTES` override) and enforced as a hard budget
  per chunk (overflow fails + cleans the upload); finalize verifies the
  combined bytes equal the declaration; `chunkNumber` validated.
- **FA-BB-009** — `redactSecretFields` strips `stream_key`/token/password/
  secret from `device_events` writes and logs; the INFO full-command
  serialization removed; migration 006 scrubs historical rows via
  `json_set`.
- **FA-BB-010** — `extractToken` no longer accepts `?token=` (header/
  subprotocol only; explicit rejection warning); device WS auth no longer
  logs a token prefix. HW device (Authorization header) and UI
  (`auth.<token>` subprotocol) already complied — no client change needed.

Tests: device-auth, upload-processor, redact-secret-fields, realtime auth
suites + full module and repo e2e runs green.

### Medium/Low tail — API/CORE/CLI/storage/BB batch CLOSED (2026-07-15, `refactor/phase-6c-audit-mediums`)

- **FA-DEP-001/002** — `4c95d99`: nodemailer 7.0.5→7.0.13 (addressparser
  recursion DoS) + js-yaml 4.1.0→4.3.0 (quadratic merge-key DoS on record
  frontmatter). Lockfile resolves only the new versions.
- **FA-API-009/010/011/012** — `bd4a248`: role fallback fires only for an
  UNKNOWN role, not a defined 0-perm role (which now gets none); `cache` →
  `system:admin`; indexing `/stats`(records:view)+`/validate`(records:import)
  gated; config raw `:type` allowlisted `^[a-z0-9-]+$` (api + core, plus a
  latent `key`-vs-`configType` bug in the core twin).
- **FA-API-013/017/018** — `04696c9`: CORS fail-closed by default (no
  `*`+credentials; explicit `CORS_ORIGIN` or deny in prod); SMTP
  `tls.rejectUnauthorized` defaults **true** across all three construction
  sites; removed the unconditional `X-CSRF-Bypass` skip (no caller; the API has
  no cookie auth, so token session-binding is an accepted residual).
- **FA-CORE-003/005/014** — `2e0b61f`: FTS5 prefix terms quoted as phrase-
  prefixes (punctuation no longer errors → no 500 oracle/DoS); schema auto-fix
  `ALTER TABLE` restricted to `search_index` + a known-column allowlist +
  identifier regex; `autoFix` honors `dryRun` (preview no longer mutates).
- **FA-CORE-002/004** — `f386756`: `SecretsManager` refuses to auto-generate a
  disk-only root secret in production unless `CIVICPRESS_ALLOW_GENERATED_SECRET`
  is set; `AuditLogger` counts dropped writes (`getWriteFailureCount`) and can
  `failFast`.
- **FA-CORE-012/017** — `f066902`: `verifyCurrentEmail` consumes the token by
  primary key (the `token` column is a hash — the old delete-by-raw-token was a
  no-op, breaking single-use); the buffer upload path now shares the sanitizing
  stored-filename generator + sanitizes the extension.
- **FA-API-014/015/016** — `2a1f3af`: geography `linked-records` reuses the
  shared `RecordsService` + paginates + bounds the scan; per-request
  `api_access` audit is fire-and-forget and opt-out; uploads buffer to a temp
  DIR (`multer.diskStorage`) and stream into storage via `uploadFileStream`
  (opened only after folder validation + quota pass; temp files unlinked).
  Also fixed three pre-existing geography-preset bugs exposed when `core/dist`
  was rebuilt (get echoes key; apply accepts null mappings; apply always
  returns both mapping keys as JSON-safe null).
- **FA-CLI-002/003/004** — `b3df3e8`: `cleanup --force` also requires
  `--yes-i-know`, and the interactive challenge is the configured org name (not
  the constant `civicpress`); tokens resolve from `--token` /
  `CIVIC_TOKEN` / `~/.civicpress/token` (argv `--token` warned as deprecated);
  `create`/`status` validate against config-driven type/status keys.
- **FA-STOR-003** — `171790d`: lifecycle `archive` no longer reports a phantom
  `archived: N` — an `archiveAfterDays` policy is honestly ignored (warned once)
  and produces no action; real archival drift stays with `OrphanedFileCleaner`.
- **FA-BB-008** — `376e9e3`: `start_session` is ack-gated via
  `DeviceCommandService.executeCommand` (resolves only on a device ack, rejects
  on disconnect/timeout/nack); the session reaches `recording` only on
  confirmation, else it is marked `failed` and the error rethrown.

Verified with targeted vitest runs (green standalone); `core`, `storage`, and
`cli` dist rebuilt so the API integration suites exercise the new code. Note:
`core/dist` + `storage/dist` are gitignored and had drifted behind source at
session start — rebuilding them is what surfaced the latent geography-preset
bugs (fixed in `2a1f3af`).

**Second batch (same session, feature-completion tail):**

- **FA-CORE-011** — `53d493f`: geography create/update/delete now mirror into a
  new `geography_files` table (via `GeographyStore`, delegated from
  `DatabaseService`) so DB-backed consumers can see geography. The markdown file
  stays authoritative; the DB is an optional `GeographyManager` dependency and a
  mirror error is logged, not fatal.
- **FA-STOR-004** — `9828ff6`: each locally-stored file gets a `.meta.json`
  sidecar (written on upload, removed on delete, excluded from the orphan scan);
  `reconstructFromManifests()` rebuilds the `storage_files` rows from disk after
  a metadata-DB loss — closing the "lose the DB → files unreachable" gap.
- **FA-CLI-005** — `65d2a7d`: the duplicated init default record-type/status
  config blocks are hoisted to two module constants (kept CLI-local — core's
  set has drifted larger; importing it would change what `init` seeds). Seeded
  `.civicrc` verified byte-identical.
- **FA-CLI-006** — **DEFERRED (accepted):** `--json` already emits emoji-free
  structured output; a minimal `--no-emoji` would still leak emoji from the many
  direct `logger.info/warn` calls that bypass `CliOutput`, and a complete fix is
  L-sized i18n work. No code change; use `--json` where emoji-free output is
  needed.

**HW repo (`refactor/phase-4-enrollment-hardening`) — CLOSED same session:**

- **FA-HW-010/011/012** — `3ef97a6`: AP mode is not auto-started once enrolled
  (unless `AP_MODE_FORCE=true`); the Wi-Fi PSK is no longer persisted to the
  state DB (NetworkManager owns it); AP-mode CORS origins are pinned (no
  wildcard).
- **FA-HW-013** — `c7cce82`: new `utils/redaction.py` scrubs stream keys /
  tokens / enrollment codes from the raw WS-frame INFO logs and masks the RTMP
  URL on stream start.
- **FA-DEP-004** — `ffc3dab`: hash-pinned `requirements-lock.txt` (uv compile,
  universal) + `make lock` / `install-locked` / `deps-check` targets.
- **FA-DEP-005** — `556f0f0`: hardware frontend migrated off the paid
  `@nuxt/ui-pro` to MIT `@nuxt/ui` v4 (Dashboard components merged into the free
  package); typecheck + build pass with no licence key.

**Still open after 2026-07-15:** only **FA-OPS-001** (tracking-doc drift) and
the residual **Low** tier (defense-in-depth / latent / polish — FA-API-019/020/
021, FA-BB-011/012/013 partials, FA-CORE-013/016, FA-CLI-006 deferred, etc.).
All Criticals, Highs, and the actionable Medium/Low security + correctness tail
across both repos are now closed.

---

## Findings — Medium

| ID          | Eff | Area           | Finding                                                                                                                                                                                                                                                                                  | Old ref          |
| ----------- | --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| FA-API-009  | M   | authz          | RBAC resolves an unknown/permission-less role to `public` permissions — fail-_safe_ (least-privilege), but an intentionally locked-down (0-perm) role silently gets public read; verify config-defined empty roles behave as intended.                                                   | —                |
| FA-API-010  | S   | authz          | `cache` routes require auth but no permission — any authenticated `public` user reads operational cache stats.                                                                                                                                                                           | —                |
| FA-API-011  | S   | authz          | `indexing /stats` + `/validate` lack `requirePermission` while sibling routes enforce `records:view/import` — leaks index counts / orphaned-reference info to any account.                                                                                                               | —                |
| FA-API-012  | S   | traversal      | `PUT/GET /config/raw/:type` (`config.ts:176-184` + `configuration-service.ts:52-67`) path-joins `../` in `:type` → arbitrary `.yml` write/read. Admin-gated (`config:manage`) but a write primitive.                                                                                     | —                |
| FA-API-013  | S   | CORS           | Default `origin:'*'` with `credentials:true` (`index.ts:138-143`). Static `*` (not a reflector, so browser blocks credentialed reads) — insecure default posture, set `CORS_ORIGIN` explicitly.                                                                                          | —                |
| FA-API-014  | M   | DoS            | Unauthenticated `geography /:id/linked-records` loads ≤1000 records into memory + builds a `RecordsService` per request (`geography.ts:432-462`).                                                                                                                                        | —                |
| FA-API-015  | M   | perf           | `logAuthEvent` does a synchronous audit-table INSERT on **every** authenticated request (`auth.ts:112-117`) — hot-path DB load + unbounded growth.                                                                                                                                       | —                |
| FA-API-016  | M   | DoS            | File upload uses multer `memoryStorage` at 100 MB/file — a few parallel uploads exhaust heap.                                                                                                                                                                                            | —                |
| FA-API-017  | S   | email          | SMTP channel defaults `tls.rejectUnauthorized:false` (`notifications.ts:77-79`) when no explicit TLS block — silent cert-validation bypass. Admin-gated (`system:admin`).                                                                                                                | —                |
| FA-API-018  | S   | CSRF           | CSRF is bypassable by any client via `X-CSRF-Bypass:true` or `X-Mock-User` (`middleware/csrf.ts:36-44`), and tokens are not session-bound — defeats the defense-in-depth layer (practical impact bounded by the Bearer-header API surface).                                              | —                |
| FA-CORE-002 | S   | secrets        | Root secret auto-generated + persisted with no prod guard; `validateSecret` only checks hex length. **Partial** — the generated root is 512-bit CSPRNG at `0o600` with warnings, so not a direct bypass; risks are silent-misconfig + secret-loss-on-restart availability.               | —                |
| FA-CORE-003 | S   | injection      | FTS5 query builder leaves user input unquoted in the prefix term (`query-parser.ts:100-155`) — crafted punctuation raises a MATCH error → 500 (query DoS / error oracle).                                                                                                                | —                |
| FA-CORE-004 | M   | audit          | Audit-log write failures are swallowed (`audit-logger.ts:70-89`) — a full/racing disk yields invisible gaps in the trust/transparency trail. **Partial** (DB sink may still record).                                                                                                     | —                |
| FA-CORE-005 | S   | injection      | Diagnostics auto-fix builds `ALTER TABLE <table> ADD COLUMN <column> <type>` from `issue.details` in the `POST /diagnose/fix` body (`auto-fixes.ts:162`) — identifier injection. Admin-gated; single-statement driver caps blast radius to one arbitrary `ADD COLUMN`. Add an allowlist. | —                |
| FA-CORE-006 | S   | saga           | `getFailedSagas` has an operator-precedence bug (missing parens around `OR`) — any recovery driver built on it selects the wrong sagas.                                                                                                                                                  | —                |
| FA-CORE-007 | M   | saga           | Resource-lock TTL (30 s) ≪ saga timeout (300 s) and is never renewed — two sagas can hold the "lock" for one record and interleave SQLite + file + git → lost update / corrupted markdown.                                                                                               | —                |
| FA-CORE-008 | M   | saga           | Idempotency keys are unique per call — double-submits create duplicate/double-applied writes; the subsystem is inert against real retries.                                                                                                                                               | —                |
| FA-CORE-009 | S   | saga           | UpdateRecord compensation only restores fields that were non-empty in the original — added `attachedFiles`/`geography`/`linkedRecords` are not reverted on rollback.                                                                                                                     | —                |
| FA-CORE-010 | S   | saga           | Archive git commit stages only the new path, not the deletion of the original — the committed git tree stays inconsistent after every archive.                                                                                                                                           | —                |
| FA-CORE-011 | M   | data           | Geography persistence is filesystem-only; the DB write is a TODO, so DB-backed consumers (search, linked-records joins) never see geography rows.                                                                                                                                        | —                |
| FA-BB-005   | S   | BB auth        | Device-token signature verified with non-constant-time `===` (`device-auth.ts:209`) — timing side-channel on the bearer credential; use `timingSafeEqual`.                                                                                                                               | —                |
| FA-BB-006   | M   | BB auth        | No token-level revocation / `jti` denylist — a leaked device token stays valid up to 7 days (revocation only via device-status re-check).                                                                                                                                                | —                |
| FA-BB-007   | M   | BB DoS         | No total-size / chunk-count cap and declared `fileSize` never verified (`upload-processor.ts:100/122`) — a malicious authenticated device fills the server disk.                                                                                                                         | —                |
| FA-BB-008   | M   | BB correctness | Session marked `recording` on fire-and-forget send (`session-controller.ts:71`) — FSM diverges from device reality if the command never arrives.                                                                                                                                         | —                |
| FA-BB-009   | S   | BB secrets     | RTMP `stream_key` persisted to `device_events` + logged at INFO (`device-command-service.ts:380/541`); `sanitizeCommandPayload` omits `stream.configure`.                                                                                                                                | —                |
| FA-BB-010   | S   | BB secrets     | WS auth still accepts `?token=` in the URL (`realtime/auth.ts:156`) → proxy/access logs; token prefix logged at `device-websocket-auth.ts:160`.                                                                                                                                          | bb (bb-010 area) |
| FA-HW-010   | S   | HW exposure    | The no-auth config/preview/reset surface auto-starts on **every boot** regardless of enrollment (`main.py:280-292`, default on, 15-min window) — recurring LAN re-exposure of `FA-HW-001/002/003`.                                                                                       | —                |
| FA-HW-011   | M   | HW network     | Wi-Fi password stored plaintext + unauthenticated `POST /api/network/connect` (`routes.py:553-555`) can move the device onto an attacker network (MITM pivot).                                                                                                                           | —                |
| FA-HW-012   | S   | HW CORS        | `allow_origins=['*']` + `allow_credentials=True` on the device API enables DNS-rebinding / drive-by reads of `/api/config` from an operator's browser.                                                                                                                                   | —                |
| FA-HW-013   | S   | HW secrets     | INFO logs write full raw inbound WS frames (RTMP keys, config payloads) and the full RTMP URL incl. stream key (`websocket_client.py:450-453`, `command_handler.py:2036-2040`).                                                                                                          | —                |
| FA-STOR-003 | M   | storage        | Lifecycle "archive" is a silent no-op reported as `archived: N` (DB `folder` column flipped, file never moved).                                                                                                                                                                          | storage-003      |
| FA-STOR-004 | M   | storage        | File access depends entirely on the SQLite metadata DB — loss makes all stored files unreachable via the API (no sidecar manifest); a resilient-archival gap.                                                                                                                            | storage-007      |
| FA-CLI-002  | M   | CLI safety     | `cleanup --force` wipes `data/` + `.system-data/civic.db` with **no confirmation**; the non-force gate is the constant word `"civicpress"` for every install — irreversible loss of a municipality's records.                                                                            | cli-006          |
| FA-CLI-003  | M   | CLI secrets    | Session tokens passed via `--token` on 18 subcommands leak through shell history and `ps`/`proc`.                                                                                                                                                                                        | cli-009          |
| FA-CLI-004  | M   | CLI            | Hardcoded record-type/status whitelists reject config-driven types/statuses (even the config's own `pending_review`/`expired`).                                                                                                                                                          | cli-003          |
| FA-DEP-001  | S   | supply-chain   | `nodemailer@7.0.5` — addressparser recursion DoS (GHSA-rcmh-qjqh-p98v, **High**); reachable if any parsed address field is attacker-influenced. Bump.                                                                                                                                    | —                |
| FA-DEP-002  | S   | supply-chain   | `js-yaml@4.1.0` quadratic merge-key DoS — record YAML frontmatter is attacker-controlled; a writer can pin CPU.                                                                                                                                                                          | —                |
| FA-DEP-004  | M   | supply-chain   | BroadcastBox Python deps use `>=` lower bounds with **no lockfile/hashes** — non-reproducible builds + drift on `cryptography`/`aiortc`/`av`/`Pillow` on a device that terminates WebRTC/crypto on untrusted networks.                                                                   | —                |
| FA-DEP-005  | M   | vendor-lock    | The **hardware `frontend/` still depends on `@nuxt/ui-pro ^3.3.7`** (paid/license-gated) — the exact vendor-lock the monorepo UI removed in `ui-002`. Migrate to MIT `@nuxt/ui` v4 for consistency + the no-vendor-lock hard constraint.                                                 | ui-002 (HW twin) |
| FA-OPS-001  | S   | process        | Tracking-doc drift: the findings-registry Snapshot table + `project-status.md`/`roadmap.md` are stale and disagree; a Phase-2d closure report was caught overclaiming green suites. The "truth" spine has a gap in its own bookkeeping.                                                  | —                |

_(node-tar path-traversal advisories are build-time-only via
`sqlite3`/`node-gyp` — recorded as `FA-DEP-003`, Low/mitigated.)_

---

## Findings — Low (defense-in-depth / latent / polish)

| ID          | Area    | Finding                                                                                                                                                                                                           | Status           |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| FA-CORE-012 | auth    | `verifyCurrentEmail` deletes by signed token but the DB stores the hash — the token is not consumed (single-use broken).                                                                                          | confirmed        |
| FA-CORE-013 | boot    | Boot storage-module loader imports from a `process.cwd()`-derived path under a broad silent `catch`.                                                                                                              | mitigated        |
| FA-CORE-014 | diag    | Diagnostics auto-fix ignores `dryRun` — a "preview" request mutates the DB (VACUUM/DDL).                                                                                                                          | confirmed        |
| FA-CORE-015 | saga    | CreateRecord saga acquires no resource lock (context omits `metadata.recordId`).                                                                                                                                  | **closed** `f37f2a7` |
| FA-CORE-016 | audit   | `core-001` (updateRecord audit without `userId`) is now written with `userId`.                                                                                                                                    | mitigated/closed |
| FA-CORE-017 | storage | Two divergent stored-filename generators; the upload path does not sanitize the base name.                                                                                                                        | confirmed        |
| FA-API-019  | CSRF    | CSRF tokens non-session-bound (defense-in-depth only; Bearer API has no cookie CSRF surface).                                                                                                                     | mitigated        |
| FA-API-020  | header  | `Content-Disposition` echoes unsanitized `original_name` — CRLF blocked by Node; residual quote/param spoofing.                                                                                                   | mitigated        |
| FA-API-021  | secrets | Hardcoded JWT secret fallback (`auth-config.ts:114`) is latent — the opaque-token path never consumes it.                                                                                                         | mitigated        |
| FA-BB-011   | BB auth | Hardcoded fallback device-token secret latent (prod DI always injects a real `SecretsManager`, which throws if unregistered).                                                                                     | mitigated        |
| FA-BB-012   | BB      | Leaked `FileHandle` on every upload finalize (`fs.open('w')` never used/closed).                                                                                                                                  | confirmed        |
| FA-BB-013   | BB      | Device-controlled `capture.av_file` steers the transcription fetch + temp-write name — arbitrary existing-blob selection; path-traversal on the write is latent (gated by the same ownership fix as `FA-BB-001`). | partial          |
| FA-CLI-005  | CLI     | `init.ts` duplicates the full default-config literal block 4–5×.                                                                                                                                                  | confirmed        |
| FA-CLI-006  | CLI     | CLI output is English + emoji only, no `--no-emoji`/i18n.                                                                                                                                                         | confirmed        |
| FA-DEP-006  | license | Device is AGPL-3.0-or-later, monorepo is MIT — confirmed; note the network-copyleft obligation for anyone deploying the appliance.                                                                                | note             |

---

## Cross-cutting themes

1. **"Unset `NODE_ENV` = development" is the single most dangerous systemic
   pattern.** It turns a Critical (`FA-API-001`) and a High (`FA-CLI-001`)
   live-by-default and leaves `BYPASS_AUTH` (`FA-API-002`) one env-var from full
   bypass. **One fix pays for several:** treat unset `NODE_ENV` as production
   everywhere a dev/test path is gated, and require an explicit positive opt-in
   (`CIVIC_DEV_MODE=1`) for every simulated/mock/bypass path.
2. **The device is trusted where it is only semi-trusted.** `session_id`,
   `fileName`, `av_file`, the RTMP `url`, `update_config` keys, and
   `session.manifest` ownership all accept unvalidated data crossing the trust
   boundary (`FA-BB-001/003`, `FA-HW-006/007/008`). Add input validation + an
   ownership check + allowlists at every device↔server ingress; the wire schema
   validates envelopes but explicitly _not_ payload contents.
3. **"A/V always public" collides with in-camera privacy.** The intentional
   architecture decision is right for genuinely-public meeting A/V but must
   **exempt the closed window** — which today is carved out of the transcript
   but not the video (`FA-BB-002`, `FA-STOR-001`). This is the report's headline
   and should gate the Phase-5 sign-off.
4. **The internet-exposed API has no hardening floor.** No rate limiting, no
   security headers, no lockout, no CSP (`FA-API-006/007`, `FA-UI-001`). These
   are installed-but-unwired or absent; wiring them is low-effort, high-value.
5. **Authorization is per-route and inconsistent.** A new unguarded router is
   public by default; geography is unguarded (`FA-API-003`), status-transition
   is checked on one of four paths (`FA-API-008`), and `private` storage =
   `authenticated` (`FA-STOR-002`). Consider a default-deny posture +
   centralizing status/transition + storage-folder authz.
6. **Secrets at rest, in transit, and in logs.** Device key beside ciphertext in
   a world-readable DB (`FA-HW-004/005`), cleartext transport defaults
   (`FA-HW-009`), and stream-keys/raw-frames in logs (`FA-BB-009/010`,
   `FA-HW-013`).
7. **Transactional integrity has real correctness gaps** — no crash recovery,
   short lock TTL, inert idempotency, partial compensation
   (`FA-CORE-001/006-010`). On a platform whose manifesto makes git the source
   of truth, DB↔git divergence is a Trust defect.

---

## Recommendations

### Security (priority order)

1. **Fail-closed the dev/auth switches** (`FA-API-001`, `FA-CLI-001`,
   `FA-API-002`) — treat unset `NODE_ENV` as prod; gate simulated/mock/bypass
   behind explicit opt-in. _Highest leverage, S-effort._
2. **Stop publishing closed-session video** (`FA-BB-002`) — device-side capture
   gating or server-side redaction; stopgap: make `recordings` non-public + fix
   folder enumeration (`FA-STOR-001`). _Headline._
3. **Bind device trust** — `session.manifest` ownership (`FA-BB-001`),
   enrollment-code↔UUID (`FA-BB-004`), sanitize `session_id`/`fileName`/RTMP
   scheme/`update_config` allowlist (`FA-HW-006/007/008`, `FA-BB-003`).
4. **Lock down the device LAN surface** — auth + interface-bind the config API;
   gate on unenrolled (`FA-HW-001/002/003/010`); harden creds at rest
   (`FA-HW-004/005`); enforce a TLS floor (`FA-HW-009`).
5. **Wire the hardening floor** — `helmet` + `express-rate-limit` + account
   lockout + CSP (`FA-API-006/007`, `FA-UI-001`).
6. **Fix the authz gaps** — geography (`FA-API-003`), status-transition
   centralization (`FA-API-008`), private-folder access (`FA-STOR-002`), the two
   path-traversal reads (`FA-API-005/012`).

### Architecture

- **Centralize authorization.** Move `validateTransition` into
  `RecordManager.updateRecord`/`publishDraft` so no API path can skip it; adopt
  a default-deny mount posture (a router without an explicit guard should 500,
  not serve). Retire the log-only `WorkflowEngine` stubs (`core-002`) or wire
  them as the real enforcement point.
- **Make the device↔server contract validate payloads, not just envelopes.** The
  canonical schema is a genuine win; extend per-action payload schemas (or
  server-side validators) so the "payloads are the device's problem" gap
  (`FA-BB-001/003`) closes structurally.
- **Finish the saga story or simplify it.** Either add the `SagaRecovery`
  driver + fix lock TTL/idempotency (`FA-CORE-001/006-010`), or, if full 2-phase
  saga semantics aren't needed for a single-node git+SQLite write, consider a
  simpler write-ahead+reconcile approach — the current half-built saga
  infrastructure is complexity without the safety it implies.
- **Storage access model.** Introduce a real `private`/`authenticated`/`public`
  distinction with distinct permissions, and carve A/V "always public" to
  exclude closed segments.
- **God-objects.** `record-manager.ts` (939), `record-parser.ts` (823), and the
  HW `command_handler.py` (2412) remain large; continue the Phase-2d
  decomposition into these.

### Tech stack

- **Keep the wins:** opaque-token auth (not JWT) is fine and parameterized
  SQLite is safe; the `@nuxt/ui` v4 (MIT) migration correctly resolved `ui-002`
  — **but reunify the hardware `frontend/` off `@nuxt/ui-pro`** (`FA-DEP-005`).
- **Pin dependencies.** Add a Python lockfile + hashes to the appliance
  (`FA-DEP-004`); bump `nodemailer`/`js-yaml` (`FA-DEP-001/002`). All 44
  `pnpm audit --prod` advisories are dominated by build-time `node-tar` (low
  risk) + `nodemailer` (fix).
- **CSP + security headers** are absent across both the API and the SPA; add
  them as a stack-level default.

### DX

- **The `NODE_ENV` default is a DX trap** — a clerk/CI host that forgets to set
  it silently enables admin backdoors. Make the safe path the default and log
  loudly on any dev-mode activation.
- **Guard destructive CLI** — `cleanup --force` needs a real confirmation (typed
  install name, not the constant `"civicpress"`), and `--token` should be
  replaced by `--token-file`/`CIVIC_TOKEN` (`FA-CLI-002/003`).
- **Appliance install** — `docker/` is still empty; the bring-up is a manual
  `git clone` + shell script + `systemd` with no signed image or firewall for
  `:8443`. A reproducible image (pinned, integrity-checked) closes both a DX and
  a supply-chain gap.
- **Fix the tracking drift** (`FA-OPS-001`) — re-tally the registry Snapshot and
  refresh `project-status.md`/`roadmap.md`; the flaky pre-commit suite (per
  project memory) should be repaired so `--no-verify` stops being routine.

### UI/UX

- **Remove the analytics `<script>` re-execution** (`FA-UI-001`) — render
  analytics via a strict allow-list or a nonce'd CSP, never
  `innerHTML`+`createElement('script')`; move JWT out of `localStorage` toward
  an `httpOnly` cookie or in-memory token to blunt XSS token theft.
- **Delete the shipped `setMockUser()` admin backdoor** (`stores/auth.ts:271`)
  from the bundle.
- **Finish `ui-003`** — the `<noscript>` fallback is thoughtful, but public
  records should be server-rendered/crawlable (SSR or prerender) so the
  transparency portal works without JS; add a service worker for the
  offline/resilience promise.
- **Config-driven presentation** — record type/status **icons and colors** are
  still hardcoded (`useIcons.ts`, `useRecordTypes.ts`), so custom municipal
  vocab renders generic; and several admin/config pages remain
  hardcoded-English.
- **Accessibility** — ~6 `alt` / 37 `aria-*` across ~120 components is thin for
  a public-sector (WCAG/AODA) portal; budget an a11y pass.

---

## Carry-forward — not audited this pass (recommend follow-up)

- `core/src/indexing` rebuild logic (FTS injection / `rebuild=true` resource
  exhaustion).
- `modules/api/src/routes/config.ts` value reflection/sanitization beyond the
  traversal sink.
- `core/src/search` FTS5 index-fix + query-builder beyond `FA-CORE-003`.
- Geography `generateFilename(name,…)` — confirm it strips `/`/`..` now that any
  user can reach it (`FA-API-003`).
- `POST /sessions/quick-start` + `GET /sessions/by-meeting/:id` authz (the
  Phase-5 create-on-demand path).
- The `e2e/broadcast-box-live` harness logic (reviewed for secrets only).
- **Phase 4/5 closure claims asserted-not-independently-verified here:**
  "transcript excluding in-camera — proven blank, zero leak" (harness-asserted;
  note `FA-BB-002` shows the _video_ is not blank), the uuid-room-keying fix,
  and the real-hardware capstone. Validate via the broadcast-box sub-audit
  rather than assume closed.

---

## Anti-deletion check

No finding was removed from `docs/audits/2026-05-16-manifesto-fit-findings.md`.
This report is a **new findings registry** (`FA-*` prefix) per the
finding-tracking convention's "future audits append a new file" rule. Where a
new finding is a still-open instance or regression of a prior one, the **Old
ref** column links it (e.g. `FA-API-006` ⟶ `api-005`, `FA-STOR-001` ⟶
over-corrected `storage-002`, `FA-DEP-005` ⟶ `ui-002` in the HW repo). Prior
findings this audit **verified as genuinely closed** — `storage-001/004/006`,
`notifications-002/003/006`, `deps-006/007`, `core-001`, the markdown-XSS
`ui-001`, and `ui-002` (monorepo) — should have their tracker rows confirmed
`closed`, not reopened.

## Status tracker (this registry)

**Updated 2026-07-15 (FA-OPS-001 reconciliation).** The remediation is
essentially complete — the per-finding closure banners above (and their
`closes: FA-...` commits) are authoritative:

- **Criticals (4/4 closed):** FA-API-001/CLI-001, FA-BB-001, FA-BB-002,
  FA-HW-001.
- **Highs (all closed):** FA-API-002/003/004/005/006/007/008, FA-BB-003/004,
  FA-UI-001, FA-CORE-001/006, FA-HW-004–009, plus the live-hardware addendum
  FA-API-023 / FA-HW-014–017.
- **Medium/Low security + correctness tail (closed 2026-07-14/15):** the saga
  cluster (FA-CORE-007/008/009/010/015), BB server mediums
  (FA-BB-005/006/007/009/010), the API/CORE/CLI/storage batch
  (FA-DEP-001/002, FA-API-009–018, FA-CORE-002/003/004/005/011/012/014/017,
  FA-CLI-002/003/004/005, FA-STOR-003/004, FA-BB-008), and the HW tail
  (FA-HW-010/011/012/013, FA-DEP-004/005/006).
- **Remaining OPEN:** `FA-OPS-001` (this doc reconciliation — in progress) and
  the residual **Low** defense-in-depth / latent tier (FA-API-019/020/021,
  FA-BB-011/012/013, FA-CORE-013, FA-CLI-006 deferred). See the Findings — Low
  table for each item's status.

Remediation lives on `refactor/phase-6c-audit-mediums` (monorepo) and
`refactor/phase-4-enrollment-hardening` (BroadcastBox HW); `origin/main` stays
frozen pending a confirming pre-merge re-audit.

## Sign-off

This audit is **advisory input to the origin/main unfreeze**, not a closure. The
base refactor's verified closures hold and the BroadcastBox engineering is
substantially complete — but **4 Critical findings (one of them, `FA-BB-002`, a
direct violation of the platform's central privacy promise) and 22 High findings
are open**, several of them in the newly-added surface. Per the standing freeze,
nothing pushes to `origin/main` until these land and a confirming re-audit is
clean. The honest read: the refactor made the base true; the new work now needs
the same treatment before it goes public.

🏛️ — _Make truth true again._

---

## Addendum — live real-hardware capstone (2026-07-03)

A real BroadcastBox appliance (BOSGAME E3 / Intel N150, Razer Kiyo Pro + MS2131
HDMI dongle) was brought up and driven **end-to-end against a live CivicPress
dev server**. This validated the integration and surfaced five new findings: one
server-side (`FA-API-023`, fixed) and four device-side capture-pipeline bugs
(`FA-HW-014/015/016/017`, **all fixed 2026-07-03**, see below). With those
closed, a full meeting now records → uploads → becomes a civic record +
transcript on real hardware — which in turn let `FA-BB-002` be **confirmed
live** rather than inferred.

**Proven working live on real hardware:** appliance install + hardware H.264
(VAAPI) encode; device enrollment against CivicPress (real token);
device↔CivicPress WebSocket connection; full command round-trip with ACKs
(`sources.set`, `preview.start`, `start_session`, `set_visibility`
in-camera/public, `stop_session`); CivicPress session-record lifecycle (draft →
recording → stopping → **complete**); device capability reporting; and — after
the fixes below — **a headless `sources.set` → `quick-start` → in-camera toggle
→ `stop` capturing 1080p VAAPI A/V, uploading, and producing a `session` record
with a capture block (public/in-camera/public segments) plus an automated WebVTT
transcript that excludes the in-camera window.** Encoder **detection is
correct** (selects Intel QuickSync/`h264_vaapi`, not the Pi `h264_v4l2m2m`).

### FA-API-023 · High · S · `security`/`correctness` · **closed-with-commit-`8f6a791`** · In-process broadcast-box HTTP API was 404-shadowed on the real server

`modules/api/src/index.ts` registered `notFoundHandler` + `errorHandler` in
`initialize()` (before `app.listen()`), but broadcast-box mounts its
device/session/upload routers in `start()` (after `listen()`, so the realtime WS
server can be bridged in). Express matches middleware in registration order, so
the catch-all 404 shadowed **every** broadcast-box HTTP route — enrollment,
sessions, and uploads all returned 404 on a normally-deployed server. It only
ever worked in the `e2e/broadcast-box-live` / `broadcast-box-mount-e2e`
harnesses, which build the Express app without a 404 handler — a "green tests,
dead in prod" gap. **Fix (shipped):** register the 404/error handlers at the END
of `start()`, after `startBroadcastBox()`; added two regression tests pinning
the ordering. This is why the closure report's "proven end-to-end hardware-free"
did not catch it — the harness constructs the app differently from the real
entrypoint.

### FA-HW-014 · High · M · `correctness` · **closed** (BroadcastBox `12508ab`) · `start_session` ignores `sources.set`; capture only starts from a PiP layout or a running preview

`main.py:497` `handle_session_start` builds `video_sources` **only** from
`get_pip_layout()` (`:519-523`) or an already-running preview (`:567-597`) — it
never reads the single-camera source that `sources.set` persisted to
`session_defaults`. So an API-driven `start_session` without a prior
`preview.start` logs "No video sources available or FFmpeg capture service not
available" and records nothing (the CivicPress session then hangs in `stopping`,
no upload, no capture block, no transcript). The documented single-camera flow
(`sources.set` → `start_session`) does not work unattended. **Fix (shipped):**
when the PiP/preview paths leave the source lists empty, `handle_session_start`
now falls back to `command_handler._get_active_sources()` — the same resolver
that reads `session_defaults` — so a headless `start_session` records.

### FA-HW-015 · High · M · `correctness` · **closed** (BroadcastBox `12508ab`) · Preview→record transition leaves the audio device busy → recording ffmpeg fails

Using a preview to work around FA-HW-014, `start_session` then fails: the
combined recording ffmpeg dies with
**`cannot open audio device plughw:1 (Device or resource busy)`**. The preview's
separate audio ffmpeg holds the Kiyo's ALSA capture device, and the
preview→record transition calls `stop_capture()` on the **video** capture
(`main.py:607`) but does not release the **audio** device. **Fix (shipped):** on
Linux the combined recording process now owns the ALSA device — the separate
audio-preview process is skipped when combined outputs are requested, and the
preview→record transition terminates any surviving audio-preview process before
opening `plughw:N` (macOS AVFoundation still allows the concurrent open and is
unchanged).

### FA-HW-016 · High · M · `correctness` · **closed** (BroadcastBox `12508ab`) · Recording produces no MP4 — dangling rawvideo preview pipe stalls the mux

The combined recording command appended a `rawvideo … pipe:1` preview output
**even when nothing was reading it**; with no consumer, the ~14 MB/s raw-RGB
pipe fills its OS buffer within milliseconds and FFmpeg blocks on the write,
which stalls the MP4 muxer too — the session dir is created but stays empty, so
nothing uploads. (The manual reference command wrote a file precisely because it
had no such pipe.) **Fix (shipped):** request `preview_stream` only when the
preview encoder is actually encoding; a headless session emits a single clean
`-f mp4 <path>`. Two adjacent defects fixed in the same pass: VAAPI `hwupload`
is now chained **inside** `-filter_complex` for watermark/PiP video (FFmpeg
rejects `-vf` alongside `-filter_complex`), and the vainfo parse requires a real
H264 **encode** entrypoint (`VAEntrypointEncSlice`/`…LP`) — a decode-only `VLD`
line no longer marks VAAPI usable, and `-low_power` is added only on
low-power-**only** iGPUs (this box has the full entrypoint, so its recordings
correctly omit the flag).

### FA-HW-017 · High · M · `correctness` · **closed** (BroadcastBox `12508ab`) · Real capture path never triggered an upload (only the synthetic encoder did)

Found once FA-HW-014/015/016 let a recording actually write. The
`UploadCoordinator` enqueues on `encode.unified.stopped` (and anchors segment
`t0` on `encode.unified.started`), but **only the synthetic
`UnifiedEncoderService` published those events** — the real FFmpeg capture path
finalized the MP4 on disk and then silently orphaned it, leaving the CivicPress
session stuck in `stopping` with no capture block. **Fix (shipped):**
`handle_session_start`/`handle_session_stop` publish `encode.unified.started`
(t0 anchor) and `encode.unified.stopped` (with `file_path`/`file_size`/`sha256`)
for the real path, so the existing coordinator → `UploadQueue` →
`session.manifest` chain runs.

### FA-BB-002 — **live-confirmed on real hardware (2026-07-03), remains OPEN**

With the pipeline fixed, a session was driven with a genuine mid-meeting
in-camera window (public 0–24.1 s, **in-camera 24.1–39.2 s**, public 39.2–53.6
s). Result: `GET /api/v1/storage/files/<av_file>` **with no `Authorization`
header** returned **HTTP 200 and the full 13,295,553-byte MP4** (53.03 s,
1920×1080 h264 + 48 kHz AAC); a frame extracted at **t=30 s (inside the closed
window)** decoded fine. The `session` record's `capture.segments` correctly
labels that range `in_camera`, and the automated WebVTT transcript correctly
**excludes** it (one cue, `00:00:00.000 → 00:00:24.097`, ending exactly at the
first public→in-camera boundary). So the finding stands exactly as written:
**the transcript redacts the closed window; the video does not, and it is served
publicly unauthenticated.** This is now demonstrated on real hardware rather
than inferred from code — the redaction gap is device/server-side, unaffected by
the capture-pipeline fixes, and is still the report's headline Critical.

**Net:** the device-app A/V recording pipeline is now **complete and validated
on real hardware** — a meeting records (1080p VAAPI A/V) → uploads → becomes a
`session` civic record with a capture block and an automated transcript that
excludes the in-camera window (FA-HW-014/015/016/017 closed in BroadcastBox
`12508ab`, with an offline regression suite
`tests/unit/test_recording_pipeline.py`). The capstone's remaining open item is
the **privacy** finding, not the plumbing: FA-BB-002 (+ FA-STOR-001 enumeration)
is confirmed live and still gates the Phase-5 sign-off.

🏛️ — _Make truth true again._
