# CivicPress Manifesto-Fit Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a comprehensive audit of the CivicPress monorepo and
`civicpress-broadcast-box` hardware repo evaluating **manifesto fit, technical
quality, architecture, roadmap alignment, AI-generation smells, and security
(light)** — culminating in a written report, actionable fix list, and
recommended follow-up sessions.

**Architecture:** Three-phase audit.

1. **Phase 0 — Preparation** (this session): switch to audit branch (already
   done), scaffold deliverables.
2. **Phase 1 — Parallel module sweeps** (this session, post sign-off): dispatch
   one fresh `general-purpose` subagent per audit target (10 targets); each
   writes a self-contained section file using a shared lens template. All 10
   dispatched in parallel.
3. **Phase 2 — Synthesis** (DEFERRED to next session): single-threaded synthesis
   — architecture review, roadmap alignment, consolidated fix list, executive
   summary. A follow-up plan will be written when Phase 1 results are in.

**Tech Stack:** Bash + `rg`/`find` for inventory, parallel `Agent` dispatch
(`general-purpose` subagents) for module audits, Markdown for all deliverables.
No code changes during the audit — only documents.

---

## 1. Background & Scope

### 1.1 Why this audit

The user has paused an in-progress broadcast-box device-page refactor
(WIP-committed at `47d0ff6` on `broadcast-box` branch) because the work "turned
out more complicated than expected" and they want to verify whether the
**current implementation approach is the right one** before continuing. The
audit is the lens for that decision.

### 1.2 Anchor documents (read once, reference often)

- **Manifesto:** `/Users/stakabo/Work/repos/civicpress/manifesto/manifesto.md` —
  sets the audit standard. Six principles + hard constraints.
- **Architecture:** `docs/architecture.md` — current architecture as documented.
- **Project status:** `docs/project-status.md` — claims about what's done (Feb
  2026, v0.2.0 Alpha).
- **Roadmap:** `docs/roadmap.md` — phases v0.2.x → v1.0.
- **Prior broadcast-box audit:**
  `docs/broadcast-box/CLEANUP-AND-TEST-AUDIT-REPORT.md` — January 2025,
  code/test/doc audit. Used as prior art for the broadcast-box section only.

### 1.3 What's in scope

- **Monorepo audit targets** (uniform depth, except broadcast-box which is
  deep):
  - `core/` — central business logic, DI, sagas, errors, caching
  - `cli/` — CLI commands
  - `modules/api/` — REST API
  - `modules/ui/` — Nuxt 4 web UI
  - `modules/realtime/` — Yjs WebSocket
  - `modules/broadcast-box/` — **FLAGSHIP, deeper depth**
  - `modules/storage/` — multi-provider files
  - `modules/legal-register/` — legal doc schema extensions
  - `modules/notifications/` — notification delivery
- **Sibling repo (moderate depth):**
  - `/Users/stakabo/Work/repos/civicpress/civicpress-broadcast-box/` —
    broadcast-box **hardware** side. Audits the _other side_ of the contract.

### 1.4 What's NOT in scope this session

- Deep code rewrites or fixes — audit produces findings; acting on them is
  separate.
- Full security audit (formal threat model, authn/authz tracing, pentest) —
  flagged for a dedicated follow-up.
- Performance benchmarking — flagged for a dedicated follow-up if findings
  warrant.
- The website (`site/`), data parser (`civicpress-ingest`), and `manifesto/`
  repos — out of scope for this audit.
- The Phase 2 synthesis (architecture review, roadmap alignment, executive
  summary, consolidated fix list) — DEFERRED to the next session, where a
  follow-up plan will be drafted using Phase 1 outputs as input.

---

## 2. Audit Lenses

Six lenses, applied to every module:

1. **Manifesto fit** — primary lens. Tests each module against the six
   principles below and hard constraints.
2. **Technical quality** — code clarity, type safety, error handling, test
   coverage, documentation.
3. **Security (LIGHT)** — auth/authz on endpoints, input validation, secret
   handling, civic-specific threat surfaces, obvious CVE risk. Flag anything
   that needs a dedicated security session.
4. **AI-generation smells** — the project was built largely with Cursor; watch
   for: over-engineering, unnecessary abstractions, fake comprehensiveness (lots
   of unused options), framework misuse, dead generated code, redundant
   explain-what-not-why comments.
5. **Architecture** — DI usage, internal boundaries, dependency hygiene,
   integration with core, separation of concerns.
6. **Roadmap alignment** — for each finding, mark which roadmap milestone it
   threatens or unblocks. Reality-check `project-status.md` claims against what
   the code actually delivers.

### 2.1 Manifesto principles

The six manifesto principles, with concrete audit checks:

| Principle        | Concrete check                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **Transparency** | Audit logs present, decisions traceable, no hidden automation, Git history meaningful                 |
| **Trust**        | Verifiable claims, security solid (light pass), tests actually exercise behavior, no false confidence |
| **Open-source**  | No license keys, no proprietary deps in critical path, code inspectable                               |
| **Public Good**  | Optimizes for civic outcomes not vendor/revenue, public interest visible in design                    |
| **Ease of Use**  | Clerk-usable, citizen-discoverable, no required expert tooling                                        |
| **Equity**       | Works on low-end hardware, low-bandwidth, multiple languages (i18n), no barriers to participation     |

Plus **three hard constraints** that override principle-by-principle judgment:

- **No vendor lock-in** — no cloud-only deps, no proprietary formats,
  municipality keeps control.
- **Markdown as civic format** — public records in plain MD where applicable.
- **Resilient archival** — record preservation/consultation works offline. Live
  features (collab editing, streaming, device control) may require network _if_
  they degrade gracefully and support auto-retry.

### 2.2 Severity scale

| Severity     | Definition                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Critical** | Violates a manifesto hard constraint, or creates a security risk affecting Trust/Transparency. Must fix before flagship deployment. |
| **High**     | Threatens a roadmap milestone or significantly degrades a manifesto principle. Fix in the next 1–2 cycles.                          |
| **Medium**   | Quality issue or future risk; cleanup or refactor warranted. Fix opportunistically.                                                 |
| **Low**      | Cosmetic, stylistic, or polish issue. Fix when convenient.                                                                          |

---

## 3. Per-Module Subagent Brief (TEMPLATE)

Every Phase 1 subagent receives this brief (with `{module-name}`,
`{module-path}`, `{depth}`, `{entry-files}`, `{special-focus}`, `{output-path}`
substituted).

````
You are auditing ONE module of the CivicPress project as part of a manifesto-fit audit. You are a fresh agent with no prior context — read the listed files first.

PROJECT CONTEXT:
- CivicPress is a civic-tech platform for municipal records, collaborative editing, and public transparency.
- 5 repos exist; you only touch the one(s) named below.
- The project was built largely with Cursor (AI-assisted coding). Watch for AI-generation smells: over-abstraction, fake comprehensiveness (unused options), framework misuse, dead generated code, redundant comments.
- Current git branch: `audit/2026-05-16-manifesto-fit`. Do NOT commit any code or test changes. Produce ONLY the audit section file at the path given below.
- Today's date: 2026-05-16.

REQUIRED READING (in order, before forming opinions):
1. `/Users/stakabo/Work/repos/civicpress/manifesto/manifesto.md` — the manifesto that sets the audit standard. Six principles: Transparency, Trust, Open-source, Public Good, Ease of Use, Equity. Hard constraints: no vendor lock-in, Markdown as civic format, archival must work offline (live features can require network with graceful degradation).
2. `/Users/stakabo/Work/repos/civicpress/civicpress/docs/plans/2026-05-16-civicpress-audit-plan.md` § "Audit Lenses" — the lens definitions and severity scale.
3. `/Users/stakabo/Work/repos/civicpress/civicpress/docs/roadmap.md` and `docs/project-status.md` — for roadmap-alignment checks.

YOUR MODULE: {module-name}
PATH: {module-path}
DEPTH: {depth}  (uniform = ~3 hours of careful reading + analysis; deep = ~5 hours)

ENTRY FILES (start here; expand as needed):
{entry-files}

SPECIAL FOCUS for this module:
{special-focus}

LENSES (apply ALL six to your module):

1. **Manifesto fit** — for each of the six principles + three hard constraints, assess pass/concern/fail with brief evidence. Be concrete.

2. **Technical quality** — code clarity, type safety, error handling consistency, test coverage (gaps and what's untested), documentation quality.

3. **Security (LIGHT)** — auth/authz coverage on endpoints, input validation, secret handling, civic-specific threats (e.g., enrollment code theft, device impersonation, recording tampering, motion/vote integrity, citizen PII). Do NOT run a full threat model. Flag specific surfaces that need a dedicated security session.

4. **AI-generation smells** — examples: classes/abstractions used only once, options never set anywhere, framework usage that fights the framework, dead code, comments that explain WHAT instead of WHY, over-elaborate error hierarchies for trivial domains, premature DI for code with no testability need.

5. **Architecture** — how this module integrates with core, DI container usage, internal layering, cross-module dependencies, whether boundaries are at the right places.

6. **Roadmap alignment** — for each non-trivial finding, note (a) which roadmap milestone it threatens or unblocks, and (b) whether `project-status.md` claims for this module match what you see in the code.

OUTPUT FORMAT — write the section file at:
{output-path}

Follow this exact template (fill every section; leave a one-line note if a lens doesn't apply):

```markdown
# Audit Section: {module-name}

**Date:** 2026-05-16
**Auditor:** parallel-agent
**Depth:** {depth}

## At-a-Glance

| | |
|---|---|
| Path | `{module-path}` |
| Purpose | <one-liner> |
| Claimed status | <from project-status.md if mentioned> |
| Test files | <count> |
| ~LoC | <rough estimate; `find ... | xargs wc -l` is fine> |
| Key dependencies | <top 3-5 direct deps from package.json or pyproject.toml> |

## Manifesto Fit

For each row: PASS / CONCERN / FAIL with 1–2 sentence evidence.

| Principle / Constraint | Verdict | Evidence |
|---|---|---|
| Transparency | | |
| Trust | | |
| Open-source | | |
| Public Good | | |
| Ease of Use | | |
| Equity | | |
| **HARD: No vendor lock-in** | | |
| **HARD: Markdown as civic format** | | |
| **HARD: Resilient archival** | | |

## Technical Quality

(2–4 paragraphs — code organization, types, errors, tests, docs)

## Security (LIGHT)

(2–4 paragraphs — flag obvious issues, list surfaces needing dedicated review)

## AI-Generation Smells

(2–4 paragraphs — specific examples with file:line if possible)

## Architecture

(2–4 paragraphs — boundaries, integration, dependencies)

## Roadmap Alignment

(1–2 paragraphs — reality check vs project-status; milestones threatened/unblocked)

## Findings

| ID | Severity | Description | Lens | Manifesto principle | Roadmap impact | Effort (S/M/L) |
|---|---|---|---|---|---|---|
| {module-name}-001 | Critical/High/Medium/Low | … | manifesto/tech/security/ai/arch/roadmap | … | … | S/M/L |

(Aim for 5–15 findings. Be specific. Reference file paths and line numbers where useful.)

## Notes / Open questions

(Bullets — things worth a human follow-up that don't fit as findings)
```

REPORT BACK (your tool-call return value, not the file):
A single paragraph under 200 words listing your top 3–5 findings by severity, with one-line description each. This summary will be aggregated into the Phase 1 appendix.

OUT OF SCOPE for you:
- Do NOT run the full test suite (it takes ~200s and one flaky test on `tests/api/lock-endpoints.test.ts` is known).
- Do NOT modify any code, tests, or non-audit docs.
- Do NOT write opinions about civic theory; tie everything to the manifesto.
- Do NOT propose how to fix findings — that's the next session's work.

Time budget: aim to complete within ~30 minutes of agent compute. If a section would require deep reading you don't have time for, mark it `[partial — needs deeper review next session]` in the relevant section and continue.
````

---

## 4. Per-Module Targets

10 audit targets. Each row maps to a Phase 1 subagent dispatch.

| #   | Module name                         | Path                                                             | Depth    | Output file                                                 |
| --- | ----------------------------------- | ---------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| 1   | core                                | `core/`                                                          | uniform  | `docs/audits/sections/core.md`                              |
| 2   | cli                                 | `cli/`                                                           | uniform  | `docs/audits/sections/cli.md`                               |
| 3   | api                                 | `modules/api/`                                                   | uniform  | `docs/audits/sections/api.md`                               |
| 4   | ui                                  | `modules/ui/`                                                    | uniform  | `docs/audits/sections/ui.md`                                |
| 5   | realtime                            | `modules/realtime/`                                              | uniform  | `docs/audits/sections/realtime.md`                          |
| 6   | **broadcast-box**                   | `modules/broadcast-box/`                                         | **DEEP** | `docs/audits/sections/broadcast-box.md`                     |
| 7   | storage                             | `modules/storage/`                                               | uniform  | `docs/audits/sections/storage.md`                           |
| 8   | legal-register                      | `modules/legal-register/`                                        | uniform  | `docs/audits/sections/legal-register.md`                    |
| 9   | notifications                       | `modules/notifications/`                                         | uniform  | `docs/audits/sections/notifications.md`                     |
| 10  | civicpress-broadcast-box (hardware) | `/Users/stakabo/Work/repos/civicpress/civicpress-broadcast-box/` | moderate | `docs/audits/sections/civicpress-broadcast-box-hardware.md` |

### 4.1 Per-target specifications

For each target, the substitutions to use in the template above.

#### Target 1 — core

- **module-name:** core
- **module-path:** `core/`
- **depth:** uniform
- **entry-files:**
  - `core/src/civic-core.ts` — central orchestrator
  - `core/src/civic-core-services.ts` — DI service registration
  - `core/src/di/container.ts` — DI container
  - `core/src/saga/` — saga pattern (read README + index)
  - `core/src/errors/` — error hierarchy (index + domain-errors)
  - `core/src/auth/` — auth service
  - `core/src/records/` — record manager
  - `core/src/search/` — search service
  - `core/src/indexing/` — indexing service
  - `core/src/audit/` — **the platform's audit-trail feature** (meta-relevant;
    check whether it actually delivers Transparency)
  - `core/src/hooks/` — hook system
  - `core/src/workflows/` — workflow engine
  - `core/src/git/` — git engine
  - `core/src/database/` — database service
  - `core/README.md`
- **special-focus:**
  - The DI container, saga pattern, unified caching, unified errors — heavy
    architecture. Is it justified for v0.2 Alpha, or is it AI-flavored
    over-engineering?
  - The `core/src/audit/` subfolder — does the audit-trail feature actually
    deliver Transparency, or is it cosmetic?
  - The saga pattern for DB+File+Git — manifesto Trust principle says civic
    operations must be reliable; does saga compensation actually work, or is it
    scaffolding?

#### Target 2 — cli

- **module-name:** cli
- **module-path:** `cli/`
- **depth:** uniform
- **entry-files:**
  - `cli/README.md`
  - `cli/package.json`
  - `cli/src/` — list and read the top-level command files
  - Look for `--json`, `--silent`, `civic diagnose`, `civic init`,
    `civic auth:simulated` flag handling
- **special-focus:**
  - **Manifesto Ease of Use applies hardest here** — can a town clerk actually
    use this CLI? Are command names plain, are errors clear, is help useful?
  - Does the CLI enable offline operation (archival) per the resilience
    constraint?
  - 25+ commands claimed — sample 5–10 and check they're real and usable.

#### Target 3 — api

- **module-name:** api
- **module-path:** `modules/api/`
- **depth:** uniform
- **entry-files:**
  - `modules/api/README.md`
  - `modules/api/src/index.ts` (or equivalent entry point)
  - `modules/api/src/app.ts` (if exists)
  - Route files — list and sample 5+ representative ones
  - Middleware: auth, CSRF, rate-limit
  - Error handler
- **special-focus:**
  - The prior broadcast-box audit flagged "50+ TODO comments… mostly
    auth/permission related" with API endpoints lacking authMiddleware. Check
    current state.
  - Authn/authz coverage: pick 5 random endpoints and verify they have auth
    middleware.
  - Saga pattern integration — does the API correctly use sagas for multi-step
    ops?
  - Response shape consistency.

#### Target 4 — ui

- **module-name:** ui
- **module-path:** `modules/ui/`
- **depth:** uniform
- **entry-files:**
  - `modules/ui/README.md`
  - `modules/ui/package.json` (note Nuxt UI Pro licensing)
  - `modules/ui/app/` — pages structure
  - `modules/ui/app/pages/` — key pages: records, settings, broadcast-box, auth
  - `modules/ui/app/composables/` — sample
  - `modules/ui/i18n/locales/en.json` and `fr.json` — i18n consistency
- **special-focus:**
  - **Clerk-usability** (manifesto Ease of Use) and **citizen-discoverability**
    ("if a citizen can't find it, it's not public").
  - Nuxt UI Pro is a paid component library — check for vendor-lock-in risk vs
    the no-lock-in hard constraint.
  - i18n: is the EN/FR coverage actually complete, or are there hardcoded
    English strings?
  - WIP refactor area (broadcast-box device page is paused on the
    `broadcast-box` branch); on this audit branch, the page is the pre-WIP
    version.

#### Target 5 — realtime

- **module-name:** realtime
- **module-path:** `modules/realtime/`
- **depth:** uniform
- **entry-files:**
  - `modules/realtime/README.md`
  - `modules/realtime/src/realtime-server.ts`
  - `modules/realtime/src/__tests__/` — list test files
  - Binary y-protocols handling, room management
- **special-focus:**
  - Manifesto resilience: this is a live feature (collab editing). Verify it
    degrades gracefully when offline — does the client recover, are snapshots
    persistent, can a record be edited offline and synced later?
  - Connection limiting / rate limiting — Trust principle.
  - The known `generateParticipantColor()` in `realtime-server.ts` is unused but
    retained per CLAUDE.md — confirm and flag.

#### Target 6 — broadcast-box (FLAGSHIP, DEEP)

- **module-name:** broadcast-box
- **module-path:** `modules/broadcast-box/`
- **depth:** DEEP
- **entry-files:**
  - `modules/broadcast-box/README.md`
  - `modules/broadcast-box/src/api/` — devices, sessions, uploads
  - `modules/broadcast-box/src/services/` — device-manager,
    device-command-service, session-controller, enrollment-cleanup
  - `modules/broadcast-box/src/models/` — enrollment-code, device-event
  - `modules/broadcast-box/src/middleware/rate-limiter.ts`
  - `modules/broadcast-box/src/websocket/` — command-handlers, event-handlers
  - `modules/broadcast-box/src/rooms/device-room.ts`
  - `modules/broadcast-box/src/types/` — note "legacy" comments
  - `modules/broadcast-box/src/__tests__/` — list and assess coverage
  - **`docs/broadcast-box/CLEANUP-AND-TEST-AUDIT-REPORT.md`** — prior audit,
    January 2025. Compare findings to current state.
  - **The WIP changes on `broadcast-box` branch:** the prior conversation
    captured them. Check the prior commit `47d0ff6` if useful via
    `git show 47d0ff6 -- modules/broadcast-box/` — these reflect the in-flight
    redesign you're trying to evaluate as "right approach or not."
  - The integration doc (committed in the WIP): retrievable via
    `git show 47d0ff6:docs/broadcast-box-integration.md`.
  - Hardware repo (other side of contract):
    `/Users/stakabo/Work/repos/civicpress/civicpress-broadcast-box/` — read
    README + agent/protocol/comms layer to understand contract from both sides.
    (Hardware repo deep-dive is target 10; you cover the contract from the
    software side.)
- **special-focus:**
  - **THE CENTRAL QUESTION the user wants answered: is the current
    implementation approach correct?**
  - **Critical framing — read the code with this lens:** broadcast-box was
    originally a "one day it would be cool" backlog item, NOT core. The team
    pushed it to flagship as a "quick win + BANG," and it turned out a bigger
    bite than expected. So the complexity you'll see is partly **unplanned scope
    creep** from a feature that grew past its original design — not necessarily
    AI-over-engineering or bad architecture. Distinguish "this is bad code" from
    "this is unplanned-scope code grown beyond its original seams." The latter
    calls for an architectural refactor recommendation, not just cleanup notes.
  - The user has stated the contract with broadcast-box is "not always clear"
    and "controlling the box and setting up the live event server was not
    optimal." This module's audit must specifically address: (a) the device
    control protocol (commands, ACKs, state machine), (b) the live event server
    setup flow, (c) the seam/contract between software and hardware.
  - **Civic artifact question:** does the recording pipeline produce
    **Markdown-friendly civic artifacts** (timestamps, attendee list, motion
    markers, transcripts), or just media blobs? If just blobs, that's a
    manifesto gap (Markdown as civic format).
  - Broadcast-box is **flagship** — manifesto's hardest standards apply (no
    lock-in, resilient archival, clerk-usable).
  - The prior audit flagged 50+ TODOs (mostly auth) and missing tests on
    rate-limiter, device-command-service, status-message-handler,
    enrollment-cleanup, enrollment-code-model. Check whether these were
    addressed.
  - **Roadmap alignment is interesting here:** broadcast-box doesn't appear as a
    named milestone in `docs/roadmap.md`, and the manifesto
    (`manifesto/manifesto.md` §3.5) still names **Ledger** as the flagship —
    both predate the strategic shift to broadcast-box-as-flagship. Frame this as
    a Transparency-principle gap: docs that don't reflect intent erode trust.
    Recommend updating both as a post-audit cleanup item.

#### Target 7 — storage

- **module-name:** storage
- **module-path:** `modules/storage/`
- **depth:** uniform
- **entry-files:**
  - `modules/storage/README.md`
  - `modules/storage/src/providers/` — local, s3, azure, gcs
  - Failover, retry, circuit-breaker code
  - UUID storage system entry
- **special-focus:**
  - **Vendor lock-in hard constraint:** multi-provider claim — does local
    actually work standalone (no implicit cloud dep)?
  - Public/private folder separation — does it actually enforce access control?
  - Civic data sensitivity: file metadata is in DB — could a leak expose citizen
    submissions?

#### Target 8 — legal-register

- **module-name:** legal-register
- **module-path:** `modules/legal-register/`
- **depth:** uniform
- **entry-files:**
  - `modules/legal-register/README.md`
  - `modules/legal-register/src/` — list and read main files
  - Check how it extends core record types
- **special-focus:**
  - Is this a real working module or scaffolded-and-abandoned? Manifesto §3.1
    promises modularity — verify the module pattern actually works.
  - If lightweight, audit accordingly — don't fabricate findings.

#### Target 9 — notifications

- **module-name:** notifications
- **module-path:** `modules/notifications/`
- **depth:** uniform
- **entry-files:**
  - `modules/notifications/package.json`
  - `modules/notifications/src/` — list and read main files
  - Channels: email, SMS, webhook
  - **NOTE:** no `README.md` was found in `modules/notifications/` — this is
    itself a finding (manifesto Open-source / Ease of Use: undocumented module).
- **special-focus:**
  - Third-party email/SMS providers — vendor lock-in surface.
  - Citizen contact PII handling — Trust principle.
  - Rate limiting against notification spam — Trust / civic-credibility.

#### Target 10 — civicpress-broadcast-box (HARDWARE)

- **module-name:** civicpress-broadcast-box-hardware
- **module-path:**
  `/Users/stakabo/Work/repos/civicpress/civicpress-broadcast-box/`
- **depth:** moderate (the deep hardware-side dive is the next dedicated
  session)
- **entry-files:**
  - `civicpress-broadcast-box/README.md`
  - `civicpress-broadcast-box/QUICK-START.md`
  - `civicpress-broadcast-box/CHANGELOG.md`
  - `civicpress-broadcast-box/pyproject.toml`
  - `civicpress-broadcast-box/Makefile`
  - `civicpress-broadcast-box/src/` — list structure
  - `civicpress-broadcast-box/agent/` — agent layer
  - `civicpress-broadcast-box/docker/` — deployment shape
  - WebSocket protocol layer (the contract from the hardware side)
- **special-focus:**
  - **Audit the contract from the hardware side.** The software side (target 6)
    audits it from the server's perspective. Compare the two — does the hardware
    actually implement what the server expects? Are there mismatches?
  - **Ease of Use for installer/clerk:** can a non-expert install/maintain this
    hardware? Is the QUICK-START realistic?
  - **Output artifacts:** what does the hardware produce when recording
    finishes? Files? Metadata? Are formats open and Markdown-friendly?
  - **Vendor lock-in:** does it depend on proprietary services (cloud, specific
    hardware drivers)?
  - **Resilience:** can it record reliably with intermittent network?

---

## 5. Audit Report Scaffold

### 5.1 Master report (one file)

`docs/audits/2026-05-16-manifesto-fit-audit.md` — assembled in Phase 2. In Phase
0 we create a minimal scaffold with header, lens definitions, table-of-contents,
and placeholders for per-module sections + synthesis chapters.

### 5.2 Per-module sections (10 files)

`docs/audits/sections/<module>.md` — one per audit target. Each written by a
parallel subagent in Phase 1.

### 5.3 Findings file (Phase 2)

`docs/audits/2026-05-16-manifesto-fit-findings.md` — consolidated table
extracted from all section files, sortable by severity/lens/module. Built in
Phase 2.

---

## 6. Phase 0: Preparation

### Task 0.1: Scaffold audit deliverables

**Files:**

- Create: `docs/audits/2026-05-16-manifesto-fit-audit.md`
- Create: `docs/audits/sections/.gitkeep`

- [ ] **Step 1: Create directories**

Run:

```bash
mkdir -p docs/audits/sections
touch docs/audits/sections/.gitkeep
```

Expected: directories exist, no errors.

- [ ] **Step 2: Write the master report scaffold**

Write to `docs/audits/2026-05-16-manifesto-fit-audit.md` (exact content):

```markdown
# CivicPress Manifesto-Fit Audit Report

**Date:** 2026-05-16
**Branch:** `audit/2026-05-16-manifesto-fit`
**Status:** Phase 1 (per-module sweeps) in progress. Phase 2 (synthesis) deferred to follow-up session.
**Audit plan:** `docs/plans/2026-05-16-civicpress-audit-plan.md`

---

## Executive Summary

_To be written in Phase 2 once Phase 1 sections are complete._

## Methodology

This audit applies six lenses to every module:

1. **Manifesto fit** (primary) — Transparency, Trust, Open-source, Public Good, Ease of Use, Equity; plus hard constraints (no vendor lock-in, Markdown as civic format, resilient archival).
2. **Technical quality** — code clarity, types, errors, tests, docs.
3. **Security (light)** — auth/authz, input validation, civic threat surfaces. Dedicated security session recommended for full coverage.
4. **AI-generation smells** — over-abstraction, fake comprehensiveness, framework misuse, dead code (project was built largely with Cursor).
5. **Architecture** — integration with core, DI usage, boundaries.
6. **Roadmap alignment** — reality check vs `project-status.md` claims; milestones threatened/unblocked.

Severity scale: Critical (manifesto hard-constraint or security risk), High (manifesto principle degraded or roadmap milestone threatened), Medium (quality/future risk), Low (cosmetic/polish).

Full methodology and per-module subagent brief: `docs/plans/2026-05-16-civicpress-audit-plan.md`.

## Per-Module Sections

Each section was produced by a fresh subagent reading its module independently against the shared lens template. Sections live as separate files; this index links them.

1. [core](sections/core.md) — _to be filled in Phase 1_
2. [cli](sections/cli.md) — _to be filled in Phase 1_
3. [api](sections/api.md) — _to be filled in Phase 1_
4. [ui](sections/ui.md) — _to be filled in Phase 1_
5. [realtime](sections/realtime.md) — _to be filled in Phase 1_
6. [broadcast-box (FLAGSHIP, deep)](sections/broadcast-box.md) — _to be filled in Phase 1_
7. [storage](sections/storage.md) — _to be filled in Phase 1_
8. [legal-register](sections/legal-register.md) — _to be filled in Phase 1_
9. [notifications](sections/notifications.md) — _to be filled in Phase 1_
10. [civicpress-broadcast-box (hardware)](sections/civicpress-broadcast-box-hardware.md) — _to be filled in Phase 1_

## Architecture Review

_To be written in Phase 2 once Phase 1 sections are complete._

## Roadmap Alignment

_To be written in Phase 2 once Phase 1 sections are complete._

## Consolidated Findings

_To be extracted into `docs/audits/2026-05-16-manifesto-fit-findings.md` in Phase 2._

## Recommended Next Sessions

_To be written in Phase 2._
```

- [ ] **Step 3: Verify**

Run:

```bash
ls docs/audits/ docs/audits/sections/
wc -l docs/audits/2026-05-16-manifesto-fit-audit.md
```

Expected: directories listed, scaffold file ~50 lines.

### Task 0.2: Commit Phase 0 scaffold

**Files:**

- Modify: none beyond Task 0.1

- [ ] **Step 1: Stage and commit**

Run:

```bash
git add docs/audits/ docs/plans/2026-05-16-civicpress-audit-plan.md
git commit -m "audit: scaffold manifesto-fit audit plan and report

Phase 0 of the manifesto-fit audit. Sets up the audit plan,
report scaffold, and per-module section directory. No findings yet
— Phase 1 (parallel module sweeps) follows.

Plan: docs/plans/2026-05-16-civicpress-audit-plan.md
Report: docs/audits/2026-05-16-manifesto-fit-audit.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: commit succeeds (pre-commit hook runs full test suite — may take
~200s; a known flaky test on `tests/api/lock-endpoints.test.ts` may need a
retry).

- [ ] **Step 2: Verify commit landed**

Run:

```bash
git log -1 --pretty=format:"%h %s"
git status --short
```

Expected: latest commit is the scaffold; status clean.

---

## 7. Phase 1: Parallel module sweeps

### Task 1.1: Dispatch 10 parallel subagents

**Files (created by subagents):**

- Create: `docs/audits/sections/core.md`
- Create: `docs/audits/sections/cli.md`
- Create: `docs/audits/sections/api.md`
- Create: `docs/audits/sections/ui.md`
- Create: `docs/audits/sections/realtime.md`
- Create: `docs/audits/sections/broadcast-box.md`
- Create: `docs/audits/sections/storage.md`
- Create: `docs/audits/sections/legal-register.md`
- Create: `docs/audits/sections/notifications.md`
- Create: `docs/audits/sections/civicpress-broadcast-box-hardware.md`

- [ ] **Step 1: Dispatch all 10 subagents in a single message**

Make ten parallel `Agent` calls with `subagent_type: "general-purpose"` in ONE
message. For each, the prompt is the brief in § 3 with the per-target
substitutions from § 4.1.

Example for target 1 (core):

```
Agent({
  description: "Audit core module against manifesto",
  subagent_type: "general-purpose",
  prompt: <full brief from § 3, with {module-name}=core, {module-path}=core/, {depth}=uniform, {entry-files}=<target 1 entry files>, {special-focus}=<target 1 special focus>, {output-path}=/Users/stakabo/Work/repos/civicpress/civicpress/docs/audits/sections/core.md>
})
```

…and similarly for targets 2 through 10. All 10 dispatched in the same message
so they run concurrently.

Expected: 10 subagent invocations start; we get a notification per completion.
Each writes its section file and returns a ~200-word summary as its tool-call
return value.

- [ ] **Step 2: Wait for all 10 to complete**

Do NOT poll. Each completion produces a notification. Wait for all 10 before
proceeding. If any agent fails or returns without writing its section file,
re-dispatch just that one with a clarifying note about the failure.

- [ ] **Step 3: Verify all section files exist**

Run:

```bash
ls -la docs/audits/sections/
wc -l docs/audits/sections/*.md
```

Expected: 10 `.md` files (excluding `.gitkeep`), each 200+ lines.

- [ ] **Step 4: Quick consistency check**

Skim each section for:

- The required template structure (At-a-Glance, Manifesto Fit, Tech Quality,
  Security, AI Smells, Architecture, Roadmap, Findings, Notes).
- Severity ratings using the agreed scale (Critical/High/Medium/Low).
- File paths referenced in findings actually exist (spot-check 5).

If any section is malformed or thin, note it as `[review needed in Phase 2]` in
`notes-phase1.md` rather than re-dispatching — Phase 2 synthesis will surface
the gap.

### Task 1.2: Write Phase 1 summary appendix

**Files:**

- Modify: `docs/audits/2026-05-16-manifesto-fit-audit.md` (append "Phase 1
  Summary" section)
- Create: `docs/audits/sections/phase-1-summary.md` (aggregates the 10 ~200-word
  summaries from agents)

- [ ] **Step 1: Aggregate summaries**

Write `docs/audits/sections/phase-1-summary.md` with the structure:

```markdown
# Phase 1 Summary — Per-Module Audit Reports

Each section below is the top-findings paragraph returned by the subagent that audited that module. Use this as the index before reading full sections.

## core
<paragraph from core agent>

## cli
<paragraph from cli agent>

…etc for all 10 targets
```

- [ ] **Step 2: Append "Phase 1 complete" note to master report**

Edit `docs/audits/2026-05-16-manifesto-fit-audit.md` — change the status line
and link the phase-1-summary file.

### Task 1.3: Commit Phase 1

- [ ] **Step 1: Stage and commit**

Run:

```bash
git add docs/audits/sections/
git commit -m "audit: Phase 1 — per-module sweeps (10 sections)

10 parallel subagents each audited one module/repo against the
manifesto-fit lens framework. Each produced a self-contained
section file at docs/audits/sections/<module>.md.

Phase 2 (synthesis) is deferred to the next session: architecture
review, roadmap alignment, consolidated findings, executive summary.

Plan: docs/plans/2026-05-16-civicpress-audit-plan.md
Report: docs/audits/2026-05-16-manifesto-fit-audit.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Verify**

Run:

```bash
git log -3 --pretty=format:"%h %s"
git status --short
```

Expected: Phase 1 commit at HEAD; clean tree.

---

## 8. Phase 2 (DEFERRED — next session): Synthesis

Phase 2 work is intentionally not specified in detail here, because its shape
depends on Phase 1 outputs. In the next session, the first action is to write a
follow-up plan (`docs/plans/<date>-civicpress-audit-synthesis-plan.md`) using
the Phase 1 section files as input. That plan will cover:

- **Architecture review** — cross-cutting observations (DI/saga/error sprawl,
  module boundaries, broadcast-box positioning, monorepo vs sibling-repo split
  rationale).
- **Roadmap alignment** — (a) reality check: roadmap claims vs code state; (b)
  forward-fit: each Phase 1 finding mapped to the roadmap milestone it threatens
  or unblocks. The broadcast-box-as-flagship-but-not-on-roadmap gap is a known
  starter finding.
- **Consolidated findings file** — extract all per-module findings into a single
  sortable table at `docs/audits/2026-05-16-manifesto-fit-findings.md`.
- **Executive summary** — top 5 findings, manifesto-fit verdict per module,
  critical issues.
- **Recommended next sessions** — broadcast-box deep-dive (already queued),
  dedicated security review, and (if findings warrant) performance /
  accessibility / WIP-refactor-resume.

---

## 9. Follow-up sessions (anticipated)

- **Broadcast-box deep dive** — the most likely next session after Phase 2. Goes
  deeper into the contract between `modules/broadcast-box` and the hardware
  repo, the device state machine, recording artifact format, and the WIP
  refactor on `broadcast-box` branch (decide: resume / restart / cherry-pick).
- **Dedicated security review** — full threat model, authn/authz tracing,
  dependency vulnerability scan, pentest-style review using the
  `/security-review` skill.
- **WIP refactor decision session** — once the audit has clarified whether the
  current broadcast-box approach is right.
- **Architecture cleanup** — if AI-smell findings warrant collapsing
  over-engineering (likely candidates: DI for code with no testability need,
  saga for trivial single-step ops, duplicate error hierarchies).

---

## Appendix A: Self-Review Checklist (run after writing this plan)

- [x] Spec coverage: every audit target has a Task and a target spec (1–10).
- [x] Placeholder scan: no "TBD" / "add appropriate" / "similar to Task N" —
      every step shows the actual content or command.
- [x] Type consistency: lens names (manifesto fit / technical quality / security
      / AI smells / architecture / roadmap) used identically throughout.
- [x] Severity scale defined once, referenced everywhere.
- [x] Output file paths consistent: `docs/audits/sections/<name>.md` everywhere.
- [x] Phase 2 explicitly deferred (with reason — depends on Phase 1 outputs)
      rather than fake-detailed.
