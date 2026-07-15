# CivicPress — Audit-to-Date Progress Retrospective

**Date:** 2026-06-18
**Purpose:** A high-level before/after of the project from the start of the
manifesto-fit audit (2026-05-16) to today, in two groups: the **CivicPress base
platform** and the **BroadcastBox flagship**.
**Authoritative sources:** `docs/audits/2026-05-16-manifesto-fit-findings.md`
(the 205-finding registry), the per-phase closure reports in `docs/audits/`, and
`docs/audits/known-test-issues.md`. This document summarizes; it does not
supersede them.

---

## Where we started (the audit verdict, May 2026)

> "The implementation approach is roughly right but the seams are wrong" — and
> more broadly: **"the platform is overclaimed and underwired."**

The manifesto-fit audit catalogued **205 findings** across 14 surfaces:

| Severity | Count |
|---|---|
| Critical | 20 |
| High | 65 |
| Medium | 79 |
| Low | 41 |
| **Total** | **205** |

By group: **166 findings in the CivicPress base**, **39 in BroadcastBox**
(22 monorepo module + 17 hardware repo). The cross-cutting theme was
**structural dishonesty** — code paths and docs that claimed more than was true.

---

## Group 1 — CivicPress (the base platform)

*core · api · ui · storage · notifications · cli · realtime · deps ·
legal-register · ingest · site · workspace — 166 findings*

| Dimension | At audit (2026-05-16) | Now (2026-06-18) |
|---|---|---|
| **Refactor status** | Not started; 17 of the 20 Criticals live here | **Phases 0–3 complete** (Bleed-stop → Truth restoration → Foundation cleanup → Structural hardening → Realtime), each with a closure report |
| **Critical security** | XSS via unsanitized `v-html`; DoS amplifier (per-request `CivicPress` init on an unauth endpoint); stub routers mounted without auth; storage quota defined but never enforced | All closed — DOMPurify sanitization, injected instances, `501`/auth gates, quota wired into the upload path |
| **"Make truth true"** | Notification audit log hardcoded `success: true`; stub routers faked `200 OK`; "100% Functional" + "0 critical vulnerabilities" claims; spec frontmatters claimed `stable v1.0.0` over stubs | Audit log computes real outcomes; routers return honest `501`; roadmap/project-status/site copy corrected; specs demoted to honest status; CI truth-check gate added |
| **Dependencies** | **140 advisories, 4 Critical CVEs** | **21 advisories, 0 Critical** (Renovate now watching) |
| **Test suite** | Broken — jest misconfigured, no per-workspace vitest configs, ~78 failing, build failed from a clean checkout | **1324 node + 186 UI tests green, lint 0 errors**; per-workspace runners all work; `known-test-issues.md` cleared of real failures |
| **Realtime** | 3,581-LoC god-file with broadcast-box code bled through | **Yjs-only, 1,495 LoC**; all 14 realtime findings closed |
| **Architecture** | God-files, unchecked type-casts, no module-contract layer | Decomposed; type-cast inventory addressed; module-contract layer in place |
| **`main` posture** | Behind; mirroring overclaims to municipal evaluators | Honest, green — a **shippable milestone** (merge pending the maintainer's call) |

**Tally:** roughly **158 of 166** base findings resolved (closed-with-commit /
recon / superseded / wontfix-by-strategy); the remainder are deliberate
deferrals. **The base is essentially done.**

---

## Group 2 — BroadcastBox (the flagship: monorepo module + hardware repo)

*broadcast-box module (22) + BB-HW hardware (17) — 39 findings*

| Dimension | At audit (2026-05-16) | Now (2026-06-18) |
|---|---|---|
| **Role in the project** | Named flagship; actively bleeding into the base | **Pulled out and paused**; the base was fixed underneath it (manifesto §2 re-grounding) |
| **License (hardware)** | None — README said "TBD"; legally undeployable by a municipality | **AGPL-3.0-or-later** (`f63edaf`) |
| **Self-assessment** | A generated `engineering-analysis.md` self-grading *"Top 0.1% Senior Engineer / 95% production-ready"* | Deleted (`6c881db`); replaced by an honest **"alpha, not pilot-ready"** posture |
| **Version/status honesty** | Three contradictory claims (pyproject `0.1.0` vs CHANGELOG "design & documentation phase" vs goals "✅ CORE IMPLEMENTATION COMPLETE") | Reconciled to **0.1.0 alpha, unreleased** across pyproject / CHANGELOG / goals / README (`6b45fc9`) |
| **AP-mode security** | Enrollment Wi-Fi AP left open indefinitely (`timeout_minutes = 0  # Disabled for testing`) | **Auto-deactivate timeout** re-enabled, 15-min default, configurable (`afda81d`) |
| **Credential encryption** | Audit flagged doc-vs-code drift ("encrypted in SQLite" with no visible encryption) | Verified **real** (Fernet + PBKDF2); the doc claim is now true (recon-closed) |
| **Civic artifacts (the mission)** | Recordings output `.mp4` blobs only — **0 Markdown civic records** (no transcript, motions, speaker turns) | ⏳ **Still pending** — Phase 4 AI-port pipeline (video → transcript → Markdown record) |
| **Protocol contract** | Hardware protocol doc disagreed with the code; three on-the-wire formats | ⏳ **Still pending** — Phase 4 canonical shared protocol artifact |
| **Installer / appliance ISO** | Promised in the README; `docker/` empty, no ISO | ⏳ **Still pending** — Phase 4 |
| **Module reintroduction** | Tangled into the base | Realtime path reintroduced clean (Yjs) in Phase 3; the broadcast-box **module** re-entry is **Phase 5** |

**Tally:** the cheap **honesty + security wins are closed** (license, self-grade,
AP timeout, encryption, version/status) — but the **mission-defining work is
still ahead**: ~13 findings remain `wontfix-pending-phase-4/5`. **BroadcastBox is
mostly still in front of us** (a multi-week cycle).

---

## One-line summary

- **CivicPress base:** from *"overclaimed and underwired"* to **honest, green, and
  shippable.**
- **BroadcastBox:** **de-escalated and made honest**, but its core mission
  (public meetings → Markdown civic records) is **still the road ahead**
  (Phase 4 hardware + AI pipeline, Phase 5 module reintroduction).

## What's next

Phase 4 (broadcast-box hardware) proper: the canonical protocol artifact
(BB-HW-001), the AI-port civic-artifact pipeline (BB-HW-003), and a real
installer/ISO (BB-HW-009). See the master plan §5 Phase 4 and the
`broadcast-box-ai-port` design notes.
