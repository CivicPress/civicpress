# Lint-rollout followup #4 — `STYLE_RULES_DEFERRED` triage

**Date:** 2026-06-03
**Status:** Approved (brainstorming gate)
**Predecessor:** `docs/specs/2026-05-28-lint-rule-rollout-design.md`
**Sibling followups (closed):**

- `#1` unused-vars umbrella (459 sites, 5 workspaces) — fully closed at merge `82e3c1b`
- `#2` Vue-template `no-explicit-any` blind spot (`d7447b4`)
- `#3` modules/ui cruft deps (`3103a74`)
- 2-file useTypedI18n mini-migration (`7d81b51`)

This is the **last** lint-rollout followup. After this lands, the [[lint-followups-before-phase-3]] policy is satisfied and Phase 3 (realtime reintroduction, Yjs-only) is unblocked per the master plan.

---

## 1. Goal

Triage the 27 rules currently silenced in `modules/ui/eslint.config.mjs` `STYLE_RULES_DEFERRED`. Each rule gets a documented disposition (`error`, `warn`-with-fixes, `warn`-signal-only, or `off`-with-reason). Fix 31 violations in this session (18 safety + 13 cheap code-quality); flip 89 violations to live warnings (signal-only, deferred); keep 11 Prettier-overlap formatting rules off; remove 1 dead-config entry.

End state:
- 2 rules enforced as `error` (safety) — 18 sites fixed
- 9 rules enabled as `warn` with fixes applied (13 sites total, 4 of those rules have 0 sites today and enable purely for future regression detection)
- 4 rules enabled as `warn` with fixes deferred (89 live warnings)
- 4 zero-violation rules enabled as `warn` for future regression detection
- 11 rules kept `off` with explicit policy comment naming why (Prettier owns / outdated / low value)
- 1 dead-config line removed

## 2. Scope

**In scope:**
- `modules/ui/eslint.config.mjs` — restructure `STYLE_RULES_DEFERRED` map
- Violation sites in `modules/ui/app/**` for Tier A and Tier B-cheap (31 fixes total)

**Out of scope:**
- Deferred-tier fixes (`nuxt/prefer-import-meta` 33, `vue/multi-word-component-names` 35, `vue/prop-name-casing` 4, `vue/require-default-prop` 17 — sum 89). These accumulate as `warn`-only signal for a future dedicated session.
- Other workspaces — `STYLE_RULES_DEFERRED` lives only in `modules/ui/eslint.config.mjs`.
- Prettier rule re-evaluation (the 11 Tier D rules stay `off` with explicit reason; not re-litigated here).
- Push to origin (refactor push policy unchanged).

## 3. Per-rule disposition matrix

### Tier A — enable `error`, fix all violations this session (18 sites)

| Rule | Sites | Why |
|---|---|---|
| `vue/no-v-html` | 2 | XSS safety — each site must use sanitization (e.g. `isomorphic-dompurify` is already a dep) or carry a justified `eslint-disable-next-line` with explicit XSS-safety rationale. |
| `vue/no-mutating-props` | 16 | Vue data-flow contract — child components must not assign to `props.x`. Each site needs to be rewritten to `emit('update:x', value)` (parent owns the state) or hoisted to a local `ref` that the child manages. Likely surfaces some architectural concerns. |

### Tier B-cheap — enable `warn`, fix all violations this session (13 sites)

| Rule | Sites | Fix shape |
|---|---|---|
| `vue/require-explicit-emits` | 0 | (no violations; rule enabled for future detection) |
| `vue/no-template-shadow` | 0 | (no violations; rule enabled for future detection) |
| `vue/v-on-event-hyphenation` | 2 | Rename `@updateModelValue` → `@update:model-value` (or similar kebab-cased event name). |
| `vue/no-deprecated-filter` | 2 | Vue 2 `\|` filter syntax → method call; should be near-trivial since project is Vue 3 throughout. |
| `@typescript-eslint/no-dynamic-delete` | 1 | Replace `delete obj[key]` (dynamic key) with `{ [key]: _, ...rest } = obj` destructure or explicit Map/Record reconstruction. |
| `@typescript-eslint/unified-signatures` | 3 | Merge overloaded function signatures where the bodies share type structure. |
| `import/first` | 5 | Move imports to the top of the file (mechanical reorder). |

### Tier B/C-deferred — enable `warn`, DO NOT fix this session (89 sites surface as live warnings)

| Rule | Sites | Why deferred |
|---|---|---|
| `nuxt/prefer-import-meta` | 33 | Bulk modernization (`process.env` → `import.meta.env` etc). Mechanical but pervasive; deserves a dedicated session to be sure no `process` usages depend on Node-specific behavior. |
| `vue/multi-word-component-names` | 35 | Likely an `@nuxt/eslint`-config issue with Nuxt UI's `<UButton>`/`<UFormField>`-style auto-imports rather than real violations. Needs investigation: are these actually our components or auto-imported library ones? If library, plugin config should exempt the prefix. |
| `vue/prop-name-casing` | 4 | Cascading prop-name changes touch parent + child + any sibling that destructures the prop. Per-component judgment; better as a focused session. |
| `vue/require-default-prop` | 17 | Opinionated — requires per-prop judgment about whether the lack of a default is an oversight or intentional. |

### Zero-violation rules — enable `warn` for future regression detection (4 rules)

| Rule | Why now |
|---|---|
| `vue/require-explicit-emits` | 0 sites today; if a future component adds an event without `defineEmits`, the warning fires. |
| `vue/no-template-shadow` | Same — future-protective. |
| `vue/component-definition-name-casing` | Same — future-protective. |
| `vue/component-name-in-template-casing` | Same — future-protective. |

### Tier D — keep `off`, documented policy (11 rules)

| Rule | Why off |
|---|---|
| `vue/html-indent` | Prettier owns formatting |
| `vue/html-closing-bracket-newline` | Prettier owns |
| `vue/max-attributes-per-line` | Prettier owns |
| `vue/singleline-html-element-content-newline` | Prettier owns |
| `vue/multiline-html-element-content-newline` | Prettier owns |
| `vue/first-attribute-linebreak` | Prettier owns |
| `vue/html-quotes` | Prettier owns |
| `vue/html-self-closing` | Prettier-adjacent; low value |
| `vue/attributes-order` | Pure style; Prettier-adjacent |
| `vue/no-multiple-template-root` | Outdated for Vue 3 (multi-root templates are valid in `<script setup>`) |
| `nuxt/nuxt-config-keys-order` | Low value |

### Dead config — remove

`'@typescript-eslint/no-explicit-any': 'off'` currently in `STYLE_RULES_DEFERRED`. After the spread on lines 49 and 59 of `eslint.config.mjs`, lines 50 and 60 explicitly set this rule to `'error'`/`'warn'` respectively — so the spread's `off` is silently overridden and has no effect. Removing it makes the config honest.

## 4. New config structure

Replace the flat `STYLE_RULES_DEFERRED = { ... }` object with three named maps, each documenting its tier's policy in a comment block. The spread order in the rules array stays the same:

```js
// Tier A: safety / correctness — `error`-enforced, all sites cleaned in followup #4
const STYLE_RULES_TIER_A = {
  'vue/no-v-html': 'error',
  'vue/no-mutating-props': 'error',
};

// Tier B: code quality — `warn`, all sites cleaned (or zero sites) in followup #4
const STYLE_RULES_TIER_B = {
  'vue/require-explicit-emits': 'warn',
  'vue/no-template-shadow': 'warn',
  'vue/v-on-event-hyphenation': 'warn',
  'vue/no-deprecated-filter': 'warn',
  '@typescript-eslint/no-dynamic-delete': 'warn',
  '@typescript-eslint/unified-signatures': 'warn',
  'import/first': 'warn',
  'vue/component-definition-name-casing': 'warn',
  'vue/component-name-in-template-casing': 'warn',
};

// Tier C: deferred — `warn`-signal, sites accumulate for a future focused session.
// 89 live warnings expected after the flip; numbers documented at the followup
// closure in lint-rollout-2026-06-02-followups memory.
const STYLE_RULES_TIER_C_DEFERRED = {
  'nuxt/prefer-import-meta': 'warn',
  'vue/multi-word-component-names': 'warn',
  'vue/prop-name-casing': 'warn',
  'vue/require-default-prop': 'warn',
};

// Tier D: kept off — Prettier owns formatting; outdated for Vue 3; low value.
const STYLE_RULES_TIER_D_OFF = {
  'vue/html-indent': 'off',
  'vue/html-closing-bracket-newline': 'off',
  'vue/max-attributes-per-line': 'off',
  'vue/singleline-html-element-content-newline': 'off',
  'vue/multiline-html-element-content-newline': 'off',
  'vue/first-attribute-linebreak': 'off',
  'vue/html-quotes': 'off',
  'vue/html-self-closing': 'off',
  'vue/attributes-order': 'off',
  'vue/no-multiple-template-root': 'off',
  'nuxt/nuxt-config-keys-order': 'off',
};
```

Spread all four in the rules object:

```js
rules: {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': unusedVarsRule,
  ...STYLE_RULES_TIER_A,
  ...STYLE_RULES_TIER_B,
  ...STYLE_RULES_TIER_C_DEFERRED,
  ...STYLE_RULES_TIER_D_OFF,
  '@typescript-eslint/no-explicit-any': 'error', // (test block: 'warn')
}
```

`@typescript-eslint/no-explicit-any` retains its explicit-set behavior (after the spreads); the dead `'off'` entry in the prior STYLE_RULES_DEFERRED is gone.

## 5. Approach

Single feature branch off `dev`: `refactor/lint-followup-4-style-rules`. Task breakdown:

| Task | Scope |
|---|---|
| Pre-flight | Capture baseline (lint, vue-tsc, ui tests), create branch |
| Task 1 | Restructure `STYLE_RULES_DEFERRED` into the 4 tiered maps; remove dead config; verify lint exits 0 errors AND the expected number of new warnings shows up (89 from Tier C + per-fix counts to be cleared in Tasks 2-3) |
| Task 2 | Fix 18 Tier A sites (Vue safety): 2× `vue/no-v-html` + 16× `vue/no-mutating-props`. Surface anything that looks architectural rather than mis-use. |
| Task 3 | Fix 13 Tier B-cheap sites (Vue + TS + import code-quality). Mostly mechanical. |
| Task 4 | Final verification + merge `--no-ff` to `dev` + memory update (closes the lint backlog) |

Task 1 can run before or after Tasks 2–3 — running it FIRST means subsequent tasks see Tier A as `error` lint output (clearer error messages for the fixer). Running it AFTER means each task can use a localized `--rule '{...}': 'error'` override during work. Recommended: Task 1 first, restructured config + Tier A enabled at `error` level produces 18 lint errors that Task 2 then drives to 0.

## 6. Risks

### 6.1 `vue/no-mutating-props` may surface architectural issues
Some of the 16 sites may be doing `props.x = newValue` because the parent doesn't expose a `update:x` event. Refactoring to the correct pattern (`emit('update:x', newValue)`) requires the parent to listen for it AND maintain the state. Mitigation: per-site triage; if a fix requires touching > 2 files / surfaces a real design issue, flag as DONE_WITH_CONCERNS rather than auto-fix.

### 6.2 `vue/no-v-html` legitimate uses
Some sites may legitimately need `v-html` for markdown rendering (with `isomorphic-dompurify`-sanitized content). Those should get an `eslint-disable-next-line vue/no-v-html` with a comment naming the sanitization step. Don't auto-rewrite to `{{ }}` if it would lose the HTML.

### 6.3 Tier B-cheap `import/first` violations
Moving imports to the top might break code that relies on specific ordering (e.g., side-effect imports that polyfill something used by a top-level expression). Mitigation: verify vue-tsc + tests after the reorder; revert any reorder that breaks something.

### 6.4 Net warning count goes UP, not down
Currently 13 lint warnings on `modules/ui` (post-#1.3 baseline). After this followup: ~89 warnings (Tier C deferred sites) + 0 new errors. This is **intentional** — Tier C deferral means visibility, not zero. Future sessions can drive these to zero.

### 6.5 Phase 3 unblocking
After this followup lands, the [[lint-followups-before-phase-3]] policy is satisfied. Phase 3 (realtime reintroduction, Yjs-only) is the natural next master-plan phase per `refactor-2026-05-master-plan` memory.

## 7. Non-goals (restated)

- No CI gate (`no-cicd-policy`)
- No PR / no push (`refactor-push-policy`)
- No work on the 89 deferred-tier violations (separate future session)
- No Prettier rule changes
- No fix for still-open surfaced findings from prior followups (separate triage)

## 8. Memory updates after merge

In `lint-rollout-2026-06-02-followups.md`:
- Mark #4 closed with merge SHA; record the per-tier outcome (18 + 13 fixed, 89 deferred).
- **Mark the entire lint-rollout backlog COMPLETE.** All four numbered followups + the 2-file mini-migration are now done.

In `MEMORY.md` index: update the followup hook line — lint backlog done.

In `refactor-2026-05-master-plan.md` description: append #4 closure; note Phase 3 is now unblocked per the [[lint-followups-before-phase-3]] policy.

Optional new memory file: `lint-style-rules-deferred-tier-c.md` capturing the 89 deferred violations + the rationale, so a future session has a single inventory to pick up.

## 9. Execution shape

Estimated ~2–3 hours, split into:

- Pre-flight: ~10 min
- Task 1 (config restructure + dead-config drop): ~20 min
- Task 2 (Tier A — 18 fixes, includes `no-mutating-props` per-site judgment): ~60–90 min
- Task 3 (Tier B-cheap — 13 fixes, mostly mechanical): ~30 min
- Task 4 (verification + merge + memory): ~15 min

Tasks 2 and 3 dispatchable as subagent implementers with spec/code-quality review between. Task 1 and Task 4 are coordinator-driven (config + merge).

After this lands, the lint-rollout backlog is empty. Phase 3 unblocks per the master plan.
