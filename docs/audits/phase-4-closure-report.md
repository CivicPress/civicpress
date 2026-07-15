# Phase 4 — BroadcastBox Hardware Audit + Fix — Closure Report

**Date:** 2026-06-30 (closure; conditional — see Sign-off)
**Repo:** `civicpress-broadcast-box` (the hardware appliance; backed up to the private
`CivicPress/BroadcastBox` remote) — branches `refactor/phase-4-w0` … `refactor/phase-4-enrollment-hardening`
**Anchor master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` §4 + §5 (Phase 4)
**Plan docs:** `docs/plans/2026-06-18-base-refactor-phase-4-broadcast-box-hw.md`,
`docs/plans/2026-06-18-base-refactor-phase-4-w1-protocol-artifact.md`
**Findings registry:** `docs/audits/2026-05-16-manifesto-fit-findings.md` (BB-HW-* rows carry the per-commit evidence)

> Phase 4 ran partly interleaved with Phase 5 (the kickoff note in the Phase 5 plan
> explains why: the enrollment + reconnect work is gated on the server half of the
> contract). The canonical protocol is a two-sided artifact — its device binding is
> Phase 4 (BB-HW-004), its server binding is Phase 5 (P5b).

---

## Summary

Phase 4 audited + hardened the hardware appliance repo: it now has a **license**,
speaks **one canonical wire format** bound to `@civicpress/broadcast-protocol`,
has **one-time revocable enrollment** with real credential encryption and
**header-only** auth, a **single consolidated reconnection state machine**, and
**honest** version/status/docs. Combined with Phase 5's capture path, a recording
produces a **civic record + transcript** (the AI-port first leg).

**Status: substantially complete on its security + protocol + structural scope,
but two named exit criteria are carried forward** — the **clerk-installable path**
(ISO / tested install script) and the **audio version** of the civic artifact —
plus the hardware-repo **doc consolidation**. Closure is therefore **conditional**
(see Sign-off), flagged honestly rather than rubber-stamped.

### Master-plan exit criteria — honest assessment

| Exit criterion (master plan §5 Phase 4) | Status |
|---|---|
| Hardware repo has a license (BB-HW-002) | **MET** — AGPL-3.0-or-later (`f63edaf`). |
| Canonical protocol-spec artifact exists; both repos consume it; one format only | **MET** — `@civicpress/broadcast-protocol`; device binds + validates (`c6c71e7`, BB-HW-004), server binds (Phase 5 P5b); the three legacy inbound shapes deleted. |
| Recordings ship with a Markdown civic-record sidecar (+ **audio version**) automatically | **PARTIAL** — transcript + capture block ship via the Phase 5 capture path; the **audio version** is deferred (BB-HW-003 / bb-002, decision pending). |
| A clerk-installable path exists (ISO OR tested install script) | **NOT DONE** — BB-HW-009. Synthetic→real **runbook** (`docs/hardware-bring-up.md`) + capture smoke (`scripts/check_capture.py`) are ready, but no ISO/tested-install path yet. |
| Hardware repo is pushed to a remote | **MET** — pushed to the private `CivicPress/BroadcastBox` backup. |

---

## Workstream outcomes (BB-HW findings closed, with commits)

### W0 — Unblock + truth restoration ✓
- **BB-HW-002** (`f63edaf`) — AGPL-3.0-or-later license added (unblocks the manifesto open-source claim + any pilot).
- **BB-HW-008** (`6c881db`) — deleted the 765-line `engineering-analysis.md` self-grading "Top 0.1% Senior Engineer / 95% production-ready"; replaced with an honest pending pointer.
- **BB-HW-015** (`6b45fc9`) — aligned version/status across `pyproject.toml`/CHANGELOG/README/agent on **0.1.0, alpha, unreleased — not pilot-ready** (maintainer framing).
- **BB-HW-007** (Phase-4 W0 base commit) — the appliance is now documented in the published base `roadmap.md` + `project-status.md` (honest about the gaps).
- **BB-HW-012** (`closed-by-recon`) — the "credentials encrypted in SQLite" doc claim is now TRUE: `credentials.py` implements Fernet + PBKDF2HMAC (added since the audit snapshot).

### W1 — Canonical protocol + dispatch + reconnect ✓
- **BB-HW-004** (`c6c71e7`) — hardware speaks ONE wire format: the receive loop validates every frame against the vendored canonical schema; the three defensive inbound shapes deleted. **Closes BB-HW-001** (the protocol-doc-lies finding — the doc is now the canonical schema, consumed by both sides).
- **BB-HW-005** (`c6c71e7`) — replaced the 22-branch `if/elif command_type` chain with a `{action: handler}` dispatch table.
- **BB-HW-006** (`1c5606d`) — collapsed 3–4 overlapping disconnect→reconnect paths into one `ReconnectionManager` over a single `ConnectionState` (`websocket_client.py` 1,432 → 1,124 LoC; reconnect logic in a 212-LoC module). Phase 4 W1 complete.

### Security + enrollment hardening ✓
- **BB-HW-010** (`7e5978f`, follow-up `e03b4d9`) — header-only device auth; the `?token=` query param is stripped from the wire URL; the redundant `X-Device-Token` header dropped.
- **BB-HW-013** (device `17a1759` + server `3c02e2c`) — one-time, server-revocable enrollment: the device deletes the enrollment code after success (no plaintext at rest), `_attempt_re_enrollment` is a no-op (dormant on `AUTH_FAILED`; re-pair needs a fresh code); server `registerDevice` drops the reuse/recovery fallback + consumes a fresh code. Locked by tests both sides. **Residual: E2 (Fernet key co-located with ciphertext) — documented threat-model note; real key separation is platform-specific future work (carried forward).**
- **BB-HW-011** (`afda81d`) — AP-mode auto-deactivation no longer hard-disabled (`timeout_minutes` defaults to 15; the enrollment Wi-Fi AP closes after enrollment).

---

## Numbers

**`BB-HW-*` findings (17 total):**
- **Closed (12):** BB-HW-001, -002, -004, -005, -006, -007, -008, -010, -011, -012, -013, -015.
- **Partial / decision (1):** BB-HW-003 (civic-artifact — transcript done via Phase 5; **audio** leg deferred).
- **triaged-deferred (1):** BB-HW-017 (the second heavy Nuxt `@nuxt/ui-pro` app — slim the AP-mode enrollment UI; **not** delete — it's the first-run setup UI).
- **Open / carried-forward (3):** BB-HW-009 (installer), BB-HW-014 (33 docs → a maintainable core set), BB-HW-016 (`agent/manifesto-slim.md` drift).

**HW test suite:** green across the hardening (302–313 passed / 7 skipped at the
W1d/enrollment milestones; see the BB-HW rows). Verified on the dev VM via
`.venv-linux/bin/python -m pytest` (needs ffmpeg).

---

## Carry-forward (deferred / decisions / out of scope)

| Item | Disposition |
|---|---|
| **Clerk-installable path** (BB-HW-009) | NOT done. Decision: ISO appliance vs. a tested autoinstall script + systemd unit (discussed: the lighter "tested install script" bar closes the criterion; a full appliance ISO can be post-refactor). Runbook + capture smoke are the manual precursor. |
| **Audio version** of the civic artifact (BB-HW-003 / bb-002) | DECISION pending (Phase 5 scope vs. backlog). Transcript + capture ship; the audio render does not. |
| **Hardware-repo doc consolidation** (BB-HW-014) | 33 docs → a maintainable core set. Partly addressed (W0 honesty pass); the full consolidation is carried forward. |
| **`agent/manifesto-slim.md` drift** (BB-HW-016) | A slimmed manifesto copy that drifts from canonical; resolve alongside the cross-repo narrative sync (bb-001). |
| **AP-mode enrollment UI slim** (BB-HW-017) | Drop `@nuxt/ui-pro`, reduce to enrollment + network — a focused UI task, deferred (no deletion; it's the first-run setup UI). |
| **E2 enrollment key separation** | The Fernet key is co-located with the ciphertext; real key separation is platform-specific future work (documented threat-model note on `CredentialManager`). |

---

## Sign-off

Phase 4 (BroadcastBox hardware audit + fix) is **complete on its security,
protocol, and structural scope**: licensed, one canonical wire format bound both
sides, one-time revocable enrollment with header-only auth + real credential
encryption, a single reconnection state machine, and honest version/status/docs.

**Closure is conditional** on the carried-forward exit criteria — the
clerk-installable path (BB-HW-009), the audio-version decision (BB-HW-003), and
the doc consolidation (BB-HW-014/016) — and composes with the Phase 5 capture path
for the civic-artifact criterion. Per the origin/main freeze, no remote pushes
until all master-plan phases land + a confirming fresh audit.

**Next master-plan phase:** Phase 5 (reintroduce BroadcastBox to CivicPress) — see
`docs/audits/phase-5-closure-report.md`.
