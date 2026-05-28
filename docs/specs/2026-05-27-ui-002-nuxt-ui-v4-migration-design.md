# ui-002 — Nuxt UI Pro v3 → v4 Migration (Design)

**Date:** 2026-05-27
**Owner:** brainstorm session, Phase 2d carry-forward
**Status:** approved design, ready for implementation planning
**Closes:** ui-002 (Critical, originally vendor-lock-in HARD constraint)
**Branch base:** `dev` at `c27baad` (Phase 2d merge)
**Related:** [refactor-2026-05-master-plan](../plans/2026-05-17-base-refactor-master-plan.md), [Phase 2d closure report](../audits/phase-2d-closure-report.md), finding registry entry `ui-002` in [findings doc](../audits/2026-05-16-manifesto-fit-findings.md)

## Background

Audit finding `ui-002` flagged `@nuxt/ui-pro ^3.3.7` as a manifesto-fit failure: it was a paid commercial dep with a runtime license hook (`theme.env: "NUXT_UI_PRO_LICENSE"`), violating the project's "no vendor lock-in" hard constraint. Originally Critical, deferred to Phase 2d, then carried forward when the 2026-05-17 disclosure that Nuxt UI Pro v4 had been re-licensed as free and open source changed the remediation path from "rip out and replace" to "upgrade v3 → v4". Phase 2d W4-T2 already added the free `@nuxt/ui ^3.3.7` as a sibling dependency to set up the migration; this work completes the cutover.

**T0 finding (2026-05-28):** v4 went further than re-licensing — the separate `@nuxt/ui-pro` package was dropped entirely. Pro components (Dashboard*, Auth*, Page*, Pricing*, etc.) are folded into the single MIT-licensed `@nuxt/ui` v4. Both v3 packages (paid `@nuxt/ui-pro` + free `@nuxt/ui`) are replaced by one v4 package. License verified MIT, zero `NUXT_UI_PRO_LICENSE` references in v4 tarball or our repo. See `docs/notes/ui-002-v4-breaking-change-inventory.md` (commit `3ce9962`).

The migration is the *whole* unit of work for this branch. The deferred lint-rule rollout, the test-suite-repair session, and Phase 3 realtime work each get their own session.

## Decisions

Captured during the brainstorming session that produced this spec:

1. **Target package:** `@nuxt/ui` v4 (single MIT package containing former Pro components). Drops BOTH paid `@nuxt/ui-pro` v3 AND free `@nuxt/ui` v3. The separate `@nuxt/ui-pro` v4 package the brainstorm assumed does not exist (T0 finding).
2. **Cadence:** atomic version bump followed by a per-component-family sweep. v3 + v4 cannot coexist (single Nuxt UI module, global CSS import), so a staged migration is structurally impossible.
3. **Commit slicing:** one commit per breaking-change category from the v3→v4 changelog. Reviewable in isolation, trivially bisectable.
4. **Definition of done:** named verification gates only — `pnpm test:ui:run` ≥ 138/138, `pnpm -r build` clean, `pnpm run audit:imports` ✓, `make audit-truth-check` PASS, `pnpm -C modules/storage test:run` 216/216. No manual smoke or screenshot diffs required at closure.

## Current state (verified 2026-05-28, post-T0)

- Branch `dev` head at `7f08521` (Phase 2d W4-T2 follow-up merge, surfaced during T0 baseline). ui-002 branch rebased onto this.
- `modules/ui/package.json` declares both `@nuxt/ui ^3.3.7` (free, added W4-T2 in `881f95d`) and `@nuxt/ui-pro ^3.3.7` (paid v3). T1 drops both, adds `@nuxt/ui ^4.8.0`.
- `modules/ui/nuxt.config.ts:13` registers `'@nuxt/ui-pro'` as a Nuxt module. T1 changes to `'@nuxt/ui'`.
- `modules/ui/app/assets/css/main.css:2` imports `@nuxt/ui-pro`. T1 changes to `@import "@nuxt/ui"`.
- `modules/ui/nuxt.config.ts:15-20` carries a minimal `ui.theme.colors` config flagged as a workaround for `useHead` issues; T8 revisits whether v4 still needs it.
- Tailwind v4 is already installed (`tailwindcss ^4.3.0`) with CSS-first `@import "tailwindcss"` and no `tailwind.config.ts`. Tailwind-v4 jump risk already absorbed.
- Nuxt 4.4.5. v4 of `@nuxt/ui` requires Nuxt 4.x — match confirmed at T0.
- 30 unique Nuxt UI components in use across `modules/ui/app/**/*.vue`. Of those, **only `UNotification` is removed in v4** — replaced by `<UToaster />` + the same `useToast()` composable. Our sole `UNotification` reference is a commented-out element in `app.vue:196`, so call-site impact is minimal.
- Baseline (T0 observed): UI tests **138/138**, storage tests **216/216**, full repo build clean.

## Architecture / shape

- **Branch:** `refactor/ui-002-nuxt-ui-v4-migration`, cut from `dev` at `c27baad`, rebased onto `7f08521` (W4-T2 follow-up merge) on 2026-05-28.
- **Scope ceiling:** v3→v4 migration only. Opportunistic cleanup is allowed only when a v4 change makes a current workaround obsolete (notably the `useHead` workaround above).
- **Push policy:** local-only, per `refactor-push-policy`. Closure commit lands on the branch; user decides at closure whether to merge to `dev`.
- **Commit policy:** every commit uses `--no-verify` per `refactor-no-verify-policy` (master plan §9.1).
- **Truth meter impact:** 64 → 65 of 205 (31% → 32%); closure counter 45 → 46.

## Sequenced commits

### T0 — Pre-flight (1 commit, docs only) ✅ DONE 2026-05-28

- Verified `@nuxt/ui` v4.8.0 is MIT-licensed, no runtime license hook, peers align with our Nuxt 4.4.5 / Vue 3.5 / Tailwind 4 / TS 5.9 stack.
- Produced `docs/notes/ui-002-v4-breaking-change-inventory.md` covering all 30 used components and v4 changelog entries.
- Baseline: UI 138/138, storage 216/216, full repo build clean.
- Surfaced + closed a pre-existing W4-T2 audit-coverage gap (root workspace not scanned) before baselines could be captured — fix landed on `dev` at `7f08521`.
- T0 commit: `3ce9962`.

### T1 — Atomic bump (1 commit, expected RED)

- `modules/ui/package.json`: drop `@nuxt/ui-pro ^3.3.7` (paid v3) AND `@nuxt/ui ^3.3.7` (free v3). Add `@nuxt/ui ^4.8.0` (single MIT package containing former Pro components).
- `modules/ui/nuxt.config.ts:13`: change module registration `'@nuxt/ui-pro'` → `'@nuxt/ui'`. Keep the `ui.theme.colors` workaround at lines 15-20 — T8 revisits.
- `modules/ui/app/assets/css/main.css:2`: change `@import "@nuxt/ui-pro"` → `@import "@nuxt/ui"`.
- `pnpm install`, then commit. `pnpm test:ui:run` and `pnpm -r build` are expected to break. Commit message documents the expected red state and the starting test pass count.

### T2..Tn — Sweep commits (one per breaking-change category)

Provisional list, refined after T0 inventory. Order is by blast radius — biggest first so the app-shell stabilizes early and subsequent commits don't accidentally render against a broken shell.

- **T2 — Dashboard shell:** `UDashboardSidebar`, `UDashboardNavbar`, `UDashboardPanel`, `UDashboardGroup`, `UDashboardSidebarCollapse` API migration.
- **T3 — Navigation:** `UNavigationMenu` prop/slot changes.
- **T4 — Overlays:** `UModal`, `UPopover`, `UDropdownMenu` (v4 unified Reka UI overlays).
- **T5 — Forms:** `UForm`, `UFormField`, `UInput`, `USelect`, `USelectMenu`, `UInputTags`, `UCheckbox`, `UTextarea`.
- **T6 — Display components:** `UCard`, `UButton`, `UBadge`, `UAlert`, `UIcon`, `UAvatar`, `UAccordion`, `UTabs`, `UTimeline`, `UPagination`, `UBreadcrumb`.
- **T7 — Toasts/notifications:** uncomment `app.vue:196` and replace `<!-- <UNotification /> -->` with `<UToaster />`. `useToast()` composable + all 30+ call sites stay unchanged.
- **T8 — Root wiring:** `useHead` / `UApp`. Remove the `ui.theme.colors` workaround at `nuxt.config.ts:15-20` if v4 fixes the underlying useHead bug.
- **T9 — i18n compat (verification-only):** smoke-verify `@nuxtjs/i18n 10.2.1` locale switch in dev mode. T0 found zero documented v4 breaks affecting our usage (we don't pass `:locale` props directly to U* components). Commit notes the verification result even if no code change is needed.
- **T10 — Leaflet wrappers:** verify nothing in our Leaflet code consumes Nuxt UI type exports that moved (v4.2.0 standardized type interface naming).

Each sweep commit ends green for its slice but the suite as a whole may still be red until Tn. Acceptance for the sweep is the suite turning green again across all gates — not each commit individually. Commit messages track the passing trend (e.g. `tests: 47/138 → 89/138`) so progress is grep-able.

Cap: if the sweep balloons past 20 commits, pause and re-scope with the user.

### T-close — Closure commit

Single commit, contents:

- `docs/audits/2026-05-16-manifesto-fit-findings.md`: flip `ui-002` from `wontfix-pending-phase-2d-followup` to `closed-with-commit-SHA: <Tn-last SHA>` — the SHA of the last sweep commit (the one that turned the suite green), which is the actual migration-completion anchor. Avoids the self-reference problem of citing T-close's own SHA. Bump closed-with-commit-SHA counter 45 → 46. Bump truth-meter line 64 → 65 of 205.
- `docs/licenses.md`: regenerated via `pnpm run licenses:gen`. Paid `@nuxt/ui-pro` v3 row should be gone.
- `docs/project-status.md` + `docs/roadmap.md`: short status update — Phase 2d carry-forward `ui-002` closed; one less Critical from the original 20.
- Commit message: `refactor(ui-002): migrate @nuxt/ui-pro v3 paid → @nuxt/ui v4 free + drop vendor lock-in` with `Closes: ui-002` footer.

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

T0 (2026-05-28) resolved the three T0-gated rows: v4 is MIT, peers align with Nuxt 4.4.5, and only `UNotification` is removed (with a trivial single-file fix in T7). The remaining open risks are T4-T10 surfaces.

| Risk | Mitigation | When surfaced | Status |
|---|---|---|---|
| v4 isn't actually free / has a runtime license hook | Abort at T0. Add a deferral note to `ui-002`. Branch is closed without commits. | T0 | RESOLVED — MIT, zero license-hook refs |
| `@nuxtjs/i18n 10.2.1` incompat with v4 locale-aware components | T9; locale-aware components are calendar + formatters (low-blast in this codebase) | T9 | OPEN — verification-only, expected no-op |
| Leaflet wrappers consume Nuxt UI type exports that moved | T10; type-only rename, isolated to a few files | T10 | OPEN |
| `theme.colors` useHead workaround still needed in v4 | T8: try removing it; if regression returns, leave it + carry-forward to test-suite-repair session | T8 | OPEN |
| Sweep balloons past ~14 commits | Cap at 20; if breaking surface is wider, pause and re-scope with user | mid-sweep | LOW — T0 estimates 8-9 sweeps |
| v4 removed a Pro component we depend on without migration path | T0 inventory documents rename map | T0 | RESOLVED — only UNotification removed; trivial single-site fix in T7 |
| v4 requires a Nuxt version we don't have | We're on Nuxt 4.4.5; v4 supports it | T0 | RESOLVED — peers align |
| Form-stack silent-behavior breaks (Form transformations, `v-model.nullify`, nested forms) | T5; pre-step greps for `v-model.nullify`, nested `<UForm>`, Form `transform` props before applying changes | T5 | OPEN — largest open risk per T0 inventory |

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
