# ui-002 — Nuxt UI Pro v3 → v4 Migration (Design)

**Date:** 2026-05-27
**Owner:** brainstorm session, Phase 2d carry-forward
**Status:** approved design, ready for implementation planning
**Closes:** ui-002 (Critical, originally vendor-lock-in HARD constraint)
**Branch base:** `dev` at `c27baad` (Phase 2d merge)
**Related:** [refactor-2026-05-master-plan](../plans/2026-05-17-base-refactor-master-plan.md), [Phase 2d closure report](../audits/phase-2d-closure-report.md), finding registry entry `ui-002` in [findings doc](../audits/2026-05-16-manifesto-fit-findings.md)

## Background

Audit finding `ui-002` flagged `@nuxt/ui-pro ^3.3.7` as a manifesto-fit failure: it was a paid commercial dep with a runtime license hook (`theme.env: "NUXT_UI_PRO_LICENSE"`), violating the project's "no vendor lock-in" hard constraint. Originally Critical, deferred to Phase 2d, then carried forward when the 2026-05-17 disclosure that Nuxt UI Pro v4 had been re-licensed as free and open source changed the remediation path from "rip out and replace" to "upgrade v3 → v4". Phase 2d W4-T2 already added the free `@nuxt/ui ^3.3.7` as a sibling dependency to set up the migration; this work completes the cutover.

The migration is the *whole* unit of work for this branch. The deferred lint-rule rollout, the test-suite-repair session, and Phase 3 realtime work each get their own session.

## Decisions

Captured during the brainstorming session that produced this spec:

1. **Target package:** `@nuxt/ui-pro` v4 (free). Keeps the Pro shell components (`UDashboard*`, `UNavigationMenu` Pro variant) that the app shell depends on. Drops the paid v3 dep.
2. **Cadence:** atomic version bump followed by a per-component-family sweep. v3 + v4 cannot coexist (single Nuxt UI module, global CSS import), so a staged migration is structurally impossible.
3. **Commit slicing:** one commit per breaking-change category from the v3→v4 changelog. Reviewable in isolation, trivially bisectable.
4. **Definition of done:** named verification gates only — `pnpm test:ui:run` ≥ 138/138, `pnpm -r build` clean, `pnpm run audit:imports` ✓, `make audit-truth-check` PASS, `pnpm -C modules/storage test:run` 216/216. No manual smoke or screenshot diffs required at closure.

## Current state (verified 2026-05-27)

- Branch `dev` is clean at `c27baad`.
- `modules/ui/package.json` declares both `@nuxt/ui ^3.3.7` (free, added W4-T2 in `881f95d`) and `@nuxt/ui-pro ^3.3.7` (paid v3 — to drop).
- `modules/ui/nuxt.config.ts:13` registers `'@nuxt/ui-pro'` as a Nuxt module.
- `modules/ui/app/assets/css/main.css:2` imports `@nuxt/ui-pro` for theme styles.
- `modules/ui/nuxt.config.ts:15-20` carries a minimal `ui.theme.colors` config flagged as a workaround for `useHead` issues; revisit after the bump.
- Tailwind v4 is already installed (`tailwindcss ^4.3.0`) with CSS-first `@import "tailwindcss"` and no `tailwind.config.ts`. The "Tailwind v4 jump" risk flagged at kickoff is already absorbed.
- Nuxt 4.4.5.
- 30 unique Nuxt UI components in use across `modules/ui/app/**/*.vue`. Pro-only surface: `UDashboardGroup`, `UDashboardNavbar`, `UDashboardPanel`, `UDashboardSidebar`, `UDashboardSidebarCollapse`, `UNavigationMenu`.

## Architecture / shape

- **Branch:** `refactor/ui-002-nuxt-ui-v4-migration`, cut from `dev` at `c27baad`.
- **Scope ceiling:** v3→v4 migration only. Opportunistic cleanup is allowed only when a v4 change makes a current workaround obsolete (notably the `useHead` workaround above).
- **Push policy:** local-only, per `refactor-push-policy`. Closure commit lands on the branch; user decides at closure whether to merge to `dev`.
- **Commit policy:** every commit uses `--no-verify` per `refactor-no-verify-policy` (master plan §9.1).
- **Truth meter impact:** 64 → 65 of 205 (31% → 32%); closure counter 45 → 46.

## Sequenced commits

### T0 — Pre-flight (no commit)

- Verify `@nuxt/ui-pro` v4 is published on npm, OSI-licensed, and has no runtime license hook (no `NUXT_UI_PRO_LICENSE` env requirement, no telemetry phone-home at boot).
- Read the official v3→v4 migration guide. Produce a breaking-change inventory keyed to the 30 components actually used in `modules/ui`. Capture component renames, prop renames, slot renames, event renames, removed components, and any new required peers.
- Baseline: `pnpm test:ui:run` → confirm 138/138 on `dev` head; `pnpm -r build` clean.

### T1 — Atomic bump (1 commit, expected RED)

- `modules/ui/package.json`: drop `@nuxt/ui-pro ^3.3.7` (paid v3), add `@nuxt/ui-pro ^4.x` (free v4), align `@nuxt/ui` to whatever peer v4 expects.
- `modules/ui/nuxt.config.ts`: keep `'@nuxt/ui-pro'` module registration. The `ui.theme.colors` workaround stays for now — T8 revisits.
- `modules/ui/app/assets/css/main.css`: keep `@import "@nuxt/ui-pro"` (still the v4 entry point per Pro v4 docs as of T0 verification).
- `pnpm install`, then commit. `pnpm test:ui:run` and `pnpm -r build` are expected to break. Commit message documents the expected red state and points at the sweep plan.

### T2..Tn — Sweep commits (one per breaking-change category)

Provisional list, refined after T0 inventory. Order is by blast radius — biggest first so the app-shell stabilizes early and subsequent commits don't accidentally render against a broken shell.

- **T2 — Dashboard shell:** `UDashboardSidebar`, `UDashboardNavbar`, `UDashboardPanel`, `UDashboardGroup`, `UDashboardSidebarCollapse` API migration.
- **T3 — Navigation:** `UNavigationMenu` prop/slot changes.
- **T4 — Overlays:** `UModal`, `UPopover`, `UDropdownMenu` (v4 unified Reka UI overlays).
- **T5 — Forms:** `UForm`, `UFormField`, `UInput`, `USelect`, `USelectMenu`, `UInputTags`, `UCheckbox`, `UTextarea`.
- **T6 — Display components:** `UCard`, `UButton`, `UBadge`, `UAlert`, `UIcon`, `UAvatar`, `UAccordion`, `UTabs`, `UTimeline`, `UPagination`, `UBreadcrumb`.
- **T7 — Toasts/notifications:** `UNotification` + `useToast` API.
- **T8 — Root wiring:** `useHead` / `UApp`. Remove the `ui.theme.colors` workaround if v4 fixes the underlying useHead bug.
- **T9 — i18n compat:** verify `@nuxtjs/i18n 10.2.1` against v4's locale-aware components (calendar, formatters).
- **T10 — Leaflet wrappers:** verify nothing in our Leaflet code consumes Nuxt UI type exports that moved.

Each sweep commit ends green for its slice but the suite as a whole may still be red until Tn. Acceptance for the sweep is the suite turning green again across all gates — not each commit individually. Commit messages track the passing trend (e.g. `tests: 47/138 → 89/138`) so progress is grep-able.

Cap: if the sweep balloons past 20 commits, pause and re-scope with the user.

### T-close — Closure commit

Single commit, contents:

- `docs/audits/2026-05-16-manifesto-fit-findings.md`: flip `ui-002` from `wontfix-pending-phase-2d-followup` to `closed-with-commit-SHA: <Tn-last SHA>` — the SHA of the last sweep commit (the one that turned the suite green), which is the actual migration-completion anchor. Avoids the self-reference problem of citing T-close's own SHA. Bump closed-with-commit-SHA counter 45 → 46. Bump truth-meter line 64 → 65 of 205.
- `docs/licenses.md`: regenerated via `pnpm run licenses:gen`. Paid `@nuxt/ui-pro` v3 row should be gone.
- `docs/project-status.md` + `docs/roadmap.md`: short status update — Phase 2d carry-forward `ui-002` closed; one less Critical from the original 20.
- Commit message: `refactor(ui-002): migrate @nuxt/ui-pro v3 paid → v4 free + drop vendor lock-in` with `Closes: ui-002` footer.

## Verification gates

### Per-commit (lightweight)

- After T1: `pnpm install` resolves cleanly; `pnpm -C modules/ui dev` boots without a runtime crash (compile errors expected; runtime crash on boot is NOT acceptable — abort/re-scope if it happens).
- After each Tn: `pnpm test:ui:run` — track passing count trend in commit messages.
- After T-last (last sweep): `pnpm -r build` clean across all 6 workspaces under strict-hoist (`.npmrc` has `shamefully-hoist=false`).

### Pre-closure (all must pass before T-close)

- `pnpm test:ui:run` → 138/138.
- `pnpm -r build` clean.
- `pnpm run audit:imports` ✓ (all imports declared per workspace).
- `make audit-truth-check` PASS.
- `pnpm -C modules/storage test:run` → 216/216 (sanity that UI changes didn't break shared workspace deps).

## Risk register

| Risk | Mitigation | When surfaced |
|---|---|---|
| v4 isn't actually free / has a runtime license hook | Abort at T0. Add a deferral note to `ui-002`. Branch is closed without commits. | T0 |
| `@nuxtjs/i18n 10.2.1` incompat with v4 locale-aware components | T9; locale-aware components are calendar + formatters (low-blast in this codebase) | T9 |
| Leaflet wrappers consume Nuxt UI type exports that moved | T10; type-only rename, isolated to a few files | T10 |
| `theme.colors` useHead workaround still needed in v4 | Leave the workaround; surface as carry-forward to the test-suite-repair session | T8 |
| Sweep balloons past ~14 commits | Cap at 20; if breaking surface is wider, pause and re-scope with user | mid-sweep |
| Pro v4 removed a Pro component we depend on without migration path | Document rename map in T0 inventory; if no path exists, abort with deferral note | T0 |
| Pro v4 requires a Nuxt version we don't have | We're on Nuxt 4.4.5; v4 expected to support it. Verify at T0. | T0 |

## Abort conditions

If any of the following at T0, branch is closed without commits and `ui-002` stays `wontfix-pending-phase-2d-followup` with an added deferral note explaining the new blocker:

- v4 has a runtime license hook (not actually free for production use).
- v4 has removed a Pro component we depend on without a migration path.
- v4 requires a Nuxt version we don't have (unlikely — we're on 4.4.5).

## Out of scope

Explicit, will not be touched on this branch:

- `@typescript-eslint/no-explicit-any` lint rule rollout (Phase 2d carry-forward, separate session).
- Test-suite repair (date-bomb at `2025-12-31` in session-mgmt, `lock-endpoints` flake — separate session per master plan §9.1).
- Phase 3 realtime work (Yjs-only reintroduction).
- UI cast-allowlist cleanup (68 documented `eslint-disable` lines stay as-is; not v4-related).
- Visual/UX regression testing — DoD is tests + builds only.

## Branch disposition (decided at closure)

When the migration lands, two paths — user calls it then:

- **Merge to `dev`** via `--no-ff` (matches Phase 2d pattern in `c27baad`). Branch deleted post-merge.
- **Hold** if user wants to land it alongside another Phase 2d carry-forward.

Either way: per `refactor-push-policy`, no push to any origin.

## Memory updates (post-closure)

- Update `refactor-2026-05-master-plan` memory: carry-forward list shrinks (ui-002 closed), truth meter bumps to 65/205.
- Update `nuxt-ui-pro-v4-free` memory: outcome recorded (actual migration size: small/medium/large), v4-free claim confirmed (or refuted with the specific blocker).
