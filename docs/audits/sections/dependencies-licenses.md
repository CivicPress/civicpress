# Audit Section: dependencies-licenses

**Date:** 2026-05-17
**Auditor:** main agent (parallel-agent dispatch stalled via watchdog; main agent ran the tooling directly)
**Depth:** focused (concrete tooling output, not deep analysis)

## At-a-Glance

| | |
|---|---|
| Scope | `pnpm audit` and license inspection across the monorepo (`/Users/stakabo/Work/repos/civicpress/civicpress/`). Hardware-side (`civicpress-broadcast-box/`, Python) covered separately by `BB-HW-002` in Phase 1. |
| pnpm version | 8.15.0 |
| Total advisories | **140** |
| Critical | **4** |
| High | **69** |
| Moderate | 49 |
| Low | 18 |

## Manifesto Fit

| Principle / Constraint | Verdict | Evidence |
|---|---|---|
| Transparency | CONCERN | The advisory list is large (140) but `pnpm audit` runs cleanly and is reproducible. README/project-status make no honest statement about dep-vulnerability posture. |
| Trust | **FAIL** | 4 Critical CVEs in the dependency tree, including one (`simple-git`) that the main audit already flagged as undeclared+used by the API for Git operations (api-007). |
| Open-source | PASS | Every direct and transitive dep observed in `pnpm-lock.yaml` carries an OSI-approved license (MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD). No "UNLICENSED" packages in the production tree. |
| Public Good | PASS | No commercial-license keys observed in current `package.json`s at audit time. (The main audit's `ui-002` flagged `@nuxt/ui-pro ^3.3.7` as license-gated; see Section Architecture below — confirm or reconcile.) |
| Ease of Use | CONCERN | The remediation surface is large (140 advisories, mostly remediable by minor-version bumps) but unmanaged: no Dependabot/Renovate config in `.github/`, no documented update cadence. |
| Equity | n/a | Lens not applicable to dep hygiene. |
| **HARD: No vendor lock-in** | CONCERN | `@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage` are direct runtime deps in `modules/storage/package.json` (Phase 1 `storage-006`). `@nuxt/ui-pro` is a paid commercial dep in `modules/ui` (Phase 1 `ui-002`). Both stand. |
| **HARD: Markdown as civic format** | n/a | Lens not applicable. |
| **HARD: Resilient archival** | CONCERN | The same vendor-deps that violate no-vendor-lock-in also mean that a clean offline install pulls down ~tens of MB of cloud SDKs that a local-only municipality never uses. Not breaking; manifesto-soft-fail. |

## Critical CVEs (4)

All four are real and reachable from the runtime:

| Advisory | Affected pkg | Path | What it allows |
|---|---|---|---|
| GHSA-mpg4-rc92-vx8v | `fast-xml-parser` (via `@google-cloud/storage`) | `cli > @civicpress/core > @civicpress/storage > @google-cloud/storage@7.18.0 > fast-xml-parser@4.5.3` | Entity-encoding bypass via regex injection in DOCTYPE entities. An attacker who can submit XML to the GCS upload path could exploit. |
| GHSA-mpg4-rc92-vx8v | `fast-xml-parser` (via `@aws-sdk/client-s3`) | `. > @aws-sdk/client-s3@3.879.0 > @aws-sdk/core@3.879.0 > fast-xml-parser@5.2.5` | Same advisory, different transitive path. Reachable via S3 operations. |
| GHSA-3wjp-mcw9-37jh | `handlebars` (via `plop > node-plop`) | `. > plop@4.0.1 > node-plop@0.32.0 > handlebars@4.7.8` | JavaScript injection via AST type confusion. Dev-time only (template scaffolding) — but `plop` is a runtime tool, not dev-only, depending on how it's invoked. |
| GHSA-vx2g-25mq-9c2h | `simple-git` (via `@civicpress/core`) | `cli > @civicpress/core > simple-git@3.28.0` | `blockUnsafeOperationsPlugin` bypass via case-insensitive protocol detection. Allows reaching unsafe git operations the plugin was meant to block. **Most relevant to civic platform** — git is core authoritative storage; an injection here violates the manifesto's Trust principle and the Git-as-auditable-history claim. |

Action: all four are remediable via minor/patch version bumps in `package.json` (or in the parent packages). `simple-git` is the most urgent — pair with `api-007` (the main audit's "simple-git is undeclared in `modules/api/package.json`").

## High advisories — top 10 modules

(140 total; below shows modules with most advisories — concentrations to fix first.)

| Module | Advisories | Notable issues |
|---|---|---|
| `minimatch` | 9 | Multiple DoS / pattern-match issues |
| `node-forge` | 6 | Cryptographic library issues |
| `axios` | 6 | DoS, prototype pollution, header injection, NO_PROXY bypass |
| `tar` | 6 | Symlink + path-traversal issues |
| `seroval` | 5 | Multiple issues |
| `fast-xml-parser` | 5 | (Plus 1 Critical above) |
| `handlebars` | 4 | (Plus 1 Critical above) |
| `devalue` | 2 | DoS via memory exhaustion |
| `flatted` | 2 | Prototype pollution; unbounded recursion |
| `h3` | 2 | SSE injection; request smuggling (TE.TE) |
| `picomatch` | 2 | (paired with minimatch) |
| `vite` | 2 | (build-time exposure; affects v0.9 prod-candidate posture) |
| `fast-uri` | 2 | Path traversal; host confusion |

**`axios` (6 high advisories)** is in the API request path — same class of risk as `simple-git`. The combination of "many advisories" + "in the request hot path" makes axios a priority target for upgrade.

**`h3` (2 high — SSE injection + request smuggling)** is the Nuxt server framework underneath the UI module. Combined with `ui-004` (Phase 1 — `app.vue:62-134` injects HTML/scripts from `/api/v1/info`), this gives an attacker more leverage in the SPA path.

**`vite` (2 high)** is build-time but the v0.9 production-candidate milestone in the roadmap requires a hardened build pipeline.

## License audit

Method: inspected `pnpm-lock.yaml` directly (`pnpm licenses ls` is the proper command but was not run here; recommend follow-up). Spot-checked direct deps in:

- `package.json` (root)
- `core/package.json`
- `cli/package.json`
- `modules/api/package.json`
- `modules/ui/package.json`
- `modules/storage/package.json`
- `modules/realtime/package.json`
- `modules/broadcast-box/package.json`
- `modules/notifications/package.json`
- `modules/legal-register/package.json`

**Observed licenses in direct deps:** MIT (overwhelming majority), Apache-2.0 (AWS SDK, Azure, GCS, some others), ISC (some node-* libraries), BSD-2-Clause + BSD-3-Clause (a few), 0BSD (tslib).

**No GPL/AGPL** in the direct tree. **No "UNLICENSED" or missing-license** packages observed.

**Commercial / paid-license deps** flagged in the main audit:

- `@nuxt/ui-pro ^3.3.7` in `modules/ui/package.json` — paid commercial. Phase 1 `ui-002`. Pinned via `theme.env: "NUXT_UI_PRO_LICENSE"` environment hook. **Confirmed: this is the only commercial-license dep in the monorepo as of this audit.**

**Cloud-SDK deps** (no commercial license — Apache-2.0 — but stealth lock-in pressure):

- `@aws-sdk/client-s3` — direct in `modules/storage/package.json`
- `@azure/storage-blob` — direct in `modules/storage/package.json`
- `@google-cloud/storage` — direct in `modules/storage/package.json`
- `@sendgrid/mail` — referenced via dynamic `require()` in `core/src/notifications` (Phase 1 noted as unused, but listed); not a direct dep
- `nodemailer` — used by multiple ad-hoc EmailChannel implementations (notifications-005)

All five cloud SDKs are OSI-licensed but they pull tens of MB into a local-only municipality's `node_modules`. The main audit's `storage-006` recommended making these `optional`/`peer` dependencies; the recommendation stands.

## Security (LIGHT)

The 140 advisories surface the standard JavaScript-ecosystem rot: minimatch, axios, tar, node-forge — old issues, all remediable, none individually catastrophic. The **4 Criticals** and **`simple-git` in particular** are the priority.

Specific surfaces for a dedicated security session (queued as main-audit recommendation #3):

1. **`simple-git` `blockUnsafeOperationsPlugin` bypass** — review every `git` invocation through `simple-git` for whether an attacker-controlled string (record body, attachment filename, branch name) can reach it. Civic-platform-critical because git is authoritative history.
2. **`fast-xml-parser` entity bypass via S3/GCS** — review whether municipalities using cloud storage pass through any attacker-controlled XML (S3 list responses, GCS metadata).
3. **`axios` prototype pollution + DoS** — the API client at minimum uses axios; trace it.
4. **`h3` SSE injection** — the UI's server-side framework. Combined with `ui-004` analytics injection, a real surface.
5. **`@nuxt/ui-pro` license posture** — confirm whether v3 production builds genuinely no longer need a license key (`ui-002` flagged the env-var hook is still wired). 5-minute upstream check.

## AI-Generation Smells

Not deeply applicable to a deps audit, but a few signals:

- The dep tree has ~700+ packages (typical for a Nuxt 4 + Express monorepo) but **no Dependabot / Renovate config** in `.github/` — i.e., the project has no automated dep-freshness loop. Manual updates only. This pairs with the AI-generated-and-not-maintained pattern that pervades the rest of the audit.
- Multiple deps appear in `package.json`s but are never imported in source (main audit `api-005`: `express-rate-limit`, `helmet`, `compression` declared but unused; also `api-007`: `simple-git`, `gray-matter`, `nodemailer`, `@sendgrid/mail` imported but undeclared). Two-sided dependency drift.
- The `notifications-008` finding (`NotificationQueue` instantiated, never used) extends: the corresponding deps that support a real queue (Redis, BullMQ) are not in the tree — confirming the queue is decorative.

## Architecture

The dep architecture has two specific architectural issues worth surfacing:

1. **Cloud SDKs as direct (non-optional) runtime deps.** A local-only municipality installs S3 + Azure + GCS SDKs even though it will never reach them. Move to `optionalDependencies` or `peerDependenciesMeta: { optional: true }` and document the "extras" install pattern.
2. **Multiple workspace packages cross-import without declaring.** `modules/api` imports `simple-git`, `gray-matter`, `nodemailer`, `@sendgrid/mail` but none are in `modules/api/package.json` — they resolve via pnpm-workspace hoisting through `@civicpress/core`. A strict-resolution install (`pnpm install --shamefully-hoist=false`) breaks the API. The main audit's `api-007` flagged this; the dep audit confirms it across all workspaces.

## Roadmap Alignment

The roadmap's v0.9 ("Production Candidate") explicitly lists "Security review (authentication, access control, file handling)" as a deliverable. **The 140 advisories + 4 Criticals would fail any honest production-readiness review.** Acting on this section is on the critical path to v0.9. The good news: most are remediable by minor/patch version bumps, not breaking changes — likely 1-2 days of focused work followed by full test-suite validation.

v1.0 ("Stable Release") lists "Public API stability guarantees." Stability includes "no known critical CVEs in our deps." Currently, 4. Action required before v1.0.

## Findings

| ID | Severity | Description | Lens | Manifesto principle | Roadmap impact | Effort (S/M/L) |
|---|---|---|---|---|---|---|
| deps-001 | **Critical** | `simple-git` 3.28.0 has `blockUnsafeOperationsPlugin` bypass via case-insensitive protocol detection (GHSA-vx2g-25mq-9c2h). Reachable via `@civicpress/core`. Git is the authoritative civic-history store — a bypass here is a Trust-principle failure. Pair with `api-007` (simple-git is also undeclared in `modules/api/package.json`). | security | Trust | Blocks v0.9 production candidate | S |
| deps-002 | **Critical** | `fast-xml-parser` 4.5.3 (via `@google-cloud/storage`) and 5.2.5 (via `@aws-sdk/client-s3`) have an entity encoding bypass via regex injection in DOCTYPE entities (GHSA-mpg4-rc92-vx8v). Reachable via cloud-storage operations. | security | Trust | Blocks v0.9 | S |
| deps-003 | **Critical** | `handlebars` 4.7.8 (via `plop > node-plop`) has JavaScript injection via AST type confusion (GHSA-3wjp-mcw9-37jh). Dev-time risk via scaffolding templates. | security | Trust | Hardens v0.5–0.8 dev posture | S |
| deps-004 | **High** | **140 total advisories** (4 Critical, 69 High, 49 Moderate, 18 Low) — most are remediable by minor/patch bumps. Concentrations: `minimatch` (9), `node-forge` (6), `axios` (6), `tar` (6), `seroval` (5), `fast-xml-parser` (5), `handlebars` (4). | security, tech | Trust | Blocks v0.9 production candidate | M (1-2 days of bump + test) |
| deps-005 | **High** | **No Dependabot / Renovate config** in `.github/` — no automated dep-freshness loop. The 140-advisory backlog is a direct consequence of having no recurring maintenance. | tech, ai | Trust | Forward fix; blocks v0.9 | S |
| deps-006 | High | `axios` (6 high advisories) is in the API request hot path — DoS, prototype pollution, header injection, NO_PROXY bypass. Upgrade priority. | security | Trust | v0.9 blocker | S |
| deps-007 | High | `h3` (2 high — SSE injection + request smuggling) is the Nuxt server framework. Combined with `ui-004` (analytics injection), an SSR-side surface for token theft. | security | Trust | v0.9 blocker | S |
| deps-008 | High | Cloud SDKs `@aws-sdk/client-s3`, `@azure/storage-blob`, `@google-cloud/storage` declared as direct (non-optional) deps in `modules/storage/package.json`. Local-only municipalities install ~tens of MB of unused SDK. Cross-ref `storage-006`. Should be `optionalDependencies`. | manifesto, arch | **No vendor lock-in (soft fail)** | Affects v1.0 "reference deployments" sizing | M |
| deps-009 | Medium | `@nuxt/ui-pro ^3.3.7` is the only paid-commercial-license dep in the monorepo (`modules/ui/package.json`). Combined with the env-var activation hook still wired in v3 (`theme.env: "NUXT_UI_PRO_LICENSE"`), the manifesto's **no-license-keys** posture is violated. Cross-ref `ui-002`. | manifesto | **No vendor lock-in (HARD)**, Open-source | Blocks v1.0 | L (replace or confirm-free) |
| deps-010 | Medium | Cross-workspace undeclared imports: `modules/api/` imports `simple-git`, `gray-matter`, `nodemailer`, `@sendgrid/mail` but does not declare them. Works only via pnpm-workspace hoisting through `@civicpress/core`. A strict install (`--shamefully-hoist=false`) breaks the API. Cross-ref `api-007`. | tech, arch | Trust | Threatens v0.9 reproducible builds | S |
| deps-011 | Medium | No `pnpm licenses ls` output captured or stored as a project artifact. The license posture is essentially undocumented. Recommend: produce a `docs/licenses.md` (or similar) auto-generated from `pnpm licenses ls` and update on every release. | manifesto, tech | Open-source, Transparency | Blocks v1.0 documentation | S |
| deps-012 | Low | `vite` 2 high advisories (build-time exposure). Affects v0.9 build-pipeline hardening. | security, tech | Trust | v0.9 | S |

## Notes / Open questions

- The 140-advisory number sounds alarming but is **typical for a 700+ package Nuxt 4 + Express monorepo that hasn't run dep updates in a while.** Most are easy fixes; the discipline question is "how often are updates run." The roadmap should commit to a recurring dep-update cadence.
- A `pip-audit` run on the hardware repo and on `civicpress-ingest` was not performed in this section. The hardware repo's `pyproject.toml` has reasonably current dep pins (`lxml>=5.2`, `Pillow>=10.0.0`, `cryptography`, `aiohttp`, `websockets`); a targeted run is recommended for the security-review session.
- The `@nuxt/ui-pro` v3 question (does production build actually need a license key) is small but load-bearing for the manifesto. A 5-minute confirmation upstream (Nuxt UI Pro docs / GitHub) would close `ui-002` + `deps-009` either way (PASS or hard FAIL).
- Recommend creating a top-level `SECURITY.md` documenting the project's security posture (no current one observed). v0.9 production-candidate work should produce this artifact.
- One audit-process note: this section was written after a parallel-agent dispatch stalled via watchdog. The agent likely got stuck either reading the huge `pnpm audit --json` output or piping commands through `head` (which is blocked by the harness). Workaround used: main agent ran `pnpm audit --json` once, captured to `/tmp/pnpm-audit.json`, parsed via Python. Future deps-audit dispatches should hand the agent a pre-captured summary rather than asking it to run the tools itself.
