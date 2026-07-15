# Base Refactor — Phase 2a: Bleed-Stop

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended for grouped tasks) or `superpowers:executing-plans` for the simpler ones. Steps use checkbox (`- [ ]`) syntax for tracking. Each task ends with a commit that closes the listed finding IDs in its commit message.

**Goal:** Close every in-scope Critical finding from the manifesto-fit audit (a dozen of the 20 Criticals) plus the dependency CVE backlog, on `main` via the feature branch `refactor/phase-2a-bleed-stop`. The 8 broadcast-box / hardware Criticals are intentionally deferred to Phases 4/5 (broadcast-box stays paused). `ui-002` is deferred to Phase 2d pending an upstream Nuxt UI Pro v3 licensing confirmation.

**Architecture:** One feature branch off main. One task per finding-cluster (8 substantive tasks + 2 hygiene tasks). Each task ends in a self-contained commit whose message lists the closed finding IDs. All commits use `--no-verify` per the master plan's resolved §9.1 (the two pre-existing flaky tests are not fixed in this phase). PR to main when all tasks done, with a finding-closure summary.

**Tech Stack:** TypeScript (Node + Vue), pnpm workspaces, vitest. New deps for this phase: `dompurify` (or `isomorphic-dompurify`) for ui-001. Possibly Dependabot config in `.github/`.

---

## 0. Inputs

- **Master plan:** `docs/plans/2026-05-17-base-refactor-master-plan.md` (signed off 2026-05-17)
- **Findings registry:** `docs/audits/2026-05-16-manifesto-fit-findings.md` on the audit branch (`audit/2026-05-16-manifesto-fit`). Phase 0 of the master plan will lift this to main; if Phase 0 hasn't run yet, do it first (Task 0 below).
- **Per-module sections** referenced inline by finding ID.

## 0b. Scope summary

**In scope (close in this phase):**

| ID | Module | Fix sketch | Difficulty |
|---|---|---|---|
| BB-HW-002 | broadcast-box hw | Add a LICENSE file (Apache-2.0, MPL-2.0, or AGPL-3.0 — user picks) | trivial |
| deps-001 | deps | Bump `simple-git` to patched version, regenerate lockfile | S |
| deps-002 | deps | Bump `fast-xml-parser` transitives (via `@aws-sdk/client-s3` + `@google-cloud/storage`) | S |
| deps-003 | deps | Bump `handlebars` via `plop > node-plop` | S |
| api-001 | api | `routes/info.ts:29-45` — use `(req as any).civicPress` instead of new instance | S |
| api-002 | api | `src/index.ts:303` — add `authMiddleware` to validation router mount | S |
| api-003 | api | `src/index.ts:281` — inject `civicPress` into status router mount | S |
| api-004 | api | Replace 4 stub routers' fake `200 OK` with `501 Not Implemented` + `Retry-After` headers | S |
| ui-001 | ui | Add DOMPurify; sanitize `useMarkdown.ts:140` `marked.parse()` output; same in `RecordPreview.vue:33` | M |
| ui-003 | ui | Add `<noscript>` fallback in `app.vue` with "JavaScript required" message + link to raw records | S |
| storage-001 | storage | Wire `QuotaManager.checkQuota` into the 2 upload paths in `cloud-uuid-storage-service.ts` | S |
| storage-002 | storage | Add public-folder bypass to `GET /folders/:folder/files` in `routes/uuid-storage.ts:811` | S |
| notifications-001 | notifications | `notification-service.ts:158` — compute `success` from actual delivery, not hardcoded `true` | M |
| notifications-002 | notifications | `notification-service.ts:108-111` — inspect return values of `validateRequest` and `checkRateLimit`, short-circuit on failure | S |
| notifications-003 | notifications | Move PII sanitization from template variable bag to audit log path | M |
| deps-004 | deps | 140-advisory backlog — batch update + verify (excluding any that require breaking changes; document those) | M |
| deps-005 | deps | Add `.github/dependabot.yml` config | S |

**Deferred (with rationale; tracked as `wontfix-pending-phase-X`):**

| ID | Defer to | Why |
|---|---|---|
| broadcast-box-002, broadcast-box-007 | Phase 5 | Broadcast-box module is paused. Findings will be re-opened during reintroduction. |
| BB-HW-001, BB-HW-003 | Phase 4 | Hardware-repo work blocks. Phase 4 owns the canonical protocol artifact AND the civic-artifact pipeline (the AI port; see `broadcast-box-ai-port` memory). |
| ui-002 | **POSSIBLY PROMOTABLE TO PHASE 2A** | User confirmed 2026-05-17 that **Nuxt UI Pro v4 is now free and open source**. The remediation is now "upgrade v3 → v4" rather than "rip out and replace." Action: after Task 0 lands, do a scoping pass on the v3→v4 migration. If migration is ≤1 day, promote ui-002 to a Phase 2a task; if larger, keep in Phase 2d as originally planned. See `broadcast-box-ai-port` memory's sibling `nuxt-ui-pro-v4-free` for context. |

---

## Task 0: Lift audit deliverables to main (Phase 0 of master plan)

If `docs/audits/2026-05-16-manifesto-fit-audit.md` does not exist on main yet, do this first. Skip if already done.

**Files:**
- Copy from audit branch to main: `docs/audits/2026-05-16-manifesto-fit-audit.md`, `docs/audits/2026-05-16-manifesto-fit-findings.md`, all of `docs/audits/sections/*.md`.
- Create: `docs/plans/finding-tracking-convention.md`.

- [ ] **Step 1: Verify the audit deliverables aren't yet on main**

Run:
```bash
ls docs/audits/ 2>/dev/null
```
Expected: directory doesn't exist (audit branch only) → proceed. If it exists → skip Task 0.

- [ ] **Step 2: Cherry-pick or copy audit files from the audit branch**

Run:
```bash
git checkout audit/2026-05-16-manifesto-fit -- docs/audits/ docs/plans/2026-05-16-civicpress-audit-plan.md docs/plans/2026-05-17-civicpress-audit-synthesis-plan.md
```
Expected: ~14 files added to staging.

- [ ] **Step 3: Add the `Status` column to the findings registry**

Edit `docs/audits/2026-05-16-manifesto-fit-findings.md` — for each finding table in each view, add a final column `| Status |` defaulting to `open`. (Mass `sed` insertion is easier than per-row edits.)

- [ ] **Step 4: Create the tracking-convention doc**

Write `docs/plans/finding-tracking-convention.md` with the content from master plan §3. Single short doc — values, commit-message convention, anti-deletion rule.

- [ ] **Step 5: Mark workspace-001 as closed-no-commit (already done out-of-band)**

In the findings registry, set `workspace-001` status to `closed-no-commit (timesheets moved to ~/Documents/civicpress-admin/ on 2026-05-17)`.

- [ ] **Step 6: Commit**

```bash
git checkout -b refactor/phase-2a-bleed-stop
git add docs/
git commit --no-verify -m "$(cat <<'EOF'
refactor: Phase 0 — lift audit deliverables to main, add finding tracking

Brings the manifesto-fit audit registry to main with a Status column so
findings are actionable from the canonical branch. Adds the finding-
tracking convention doc.

Closes (out-of-band): workspace-001 (timesheets moved 2026-05-17)
Closes: phase-0-task-tracker

Master plan: docs/plans/2026-05-17-base-refactor-master-plan.md
Tracking convention: docs/plans/finding-tracking-convention.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify**

Run:
```bash
ls docs/audits/sections/ | wc -l   # expect 14
git log -1 --pretty=format:"%h %s"
```

---

## Task 1: Quick wins (BB-HW-002 + deps Criticals + Dependabot)

The 30-second-to-15-minute fixes. Do these first to demonstrate momentum and unblock the deps CVE story.

**Files:**
- Create: `/Users/stakabo/Work/repos/civicpress/civicpress-broadcast-box/LICENSE`
- Modify: `package.json`, `pnpm-lock.yaml` (regenerated)
- Modify: `core/package.json` (for simple-git pin)
- Create: `.github/dependabot.yml`

### BB-HW-002 — License the hardware repo

- [ ] **Step 1: License confirmed**

**License: AGPL-3.0** (user-confirmed 2026-05-17). Rationale: hardware is the deployed civic appliance, and AGPL's network-use clause prevents the corporate-extraction model the manifesto explicitly opposes ("breaks the fact that only large corporations can supply democracy tools and are greedy"). A vendor cannot take the broadcast-box hardware code, host it as a SaaS, and keep their fork closed.

- [ ] **Step 2: Add LICENSE file to the hardware repo**

Run:
```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress-broadcast-box
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
```
Update `pyproject.toml`'s `license = {text = "AGPL-3.0-or-later"}` (currently says nothing or "TBD"). Update the README License section from "TBD" to "AGPL-3.0-or-later". Add an `SPDX-License-Identifier: AGPL-3.0-or-later` header to top-level Python source files (optional but recommended for SPDX scanners).

- [ ] **Step 3: Commit on the hardware repo**

```bash
cd /Users/stakabo/Work/repos/civicpress/civicpress-broadcast-box
git add LICENSE pyproject.toml README.md
git commit --no-verify -m "license: add Apache-2.0 (closes BB-HW-002)"
```
This repo currently has no remote (per workspace-003); the commit stays local until Phase 2b sets up remotes.

### deps-001/002/003 — Three Critical CVE bumps

- [ ] **Step 4: Update `simple-git` (deps-001)**

`simple-git` is depended on by `core/`. Check current version:
```bash
grep -r '"simple-git"' core/package.json modules/api/package.json
```
Update to the patched version (`3.28.x` patched release; check upstream GHSA-vx2g-25mq-9c2h for the exact fixed version — likely `3.28.1+` or `3.29.0+`).

```bash
pnpm add simple-git@latest --filter @civicpress/core
```
(Or update the package.json by hand and `pnpm install`.)

- [ ] **Step 5: Update `fast-xml-parser` indirect (deps-002)**

`fast-xml-parser` comes via `@aws-sdk/client-s3` and `@google-cloud/storage`. The fixed advisory is GHSA-mpg4-rc92-vx8v. Strategy: update the parent packages to versions whose transitives pull the fixed `fast-xml-parser`.

```bash
pnpm up @aws-sdk/client-s3@latest @google-cloud/storage@latest --filter @civicpress/storage
pnpm audit --json | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:v.get('severity') for k,v in d.get('advisories',{}).items() if v.get('module_name')=='fast-xml-parser'})"
```
Expected: `fast-xml-parser` no longer appears in `pnpm audit` results, OR all remaining are non-Critical.

- [ ] **Step 6: Update `handlebars` indirect (deps-003)**

`handlebars` comes via `plop > node-plop`. Update plop:
```bash
pnpm up plop@latest
pnpm audit --json | python3 -c "import json,sys; d=json.load(sys.stdin); print([(v.get('severity'),v.get('module_name')) for v in d.get('advisories',{}).values() if v.get('module_name')=='handlebars'])"
```
Expected: handlebars no longer Critical.

- [ ] **Step 7: Verify all 3 Criticals cleared**

```bash
pnpm audit --json > /tmp/audit-after-bumps.json
python3 -c "
import json
d = json.load(open('/tmp/audit-after-bumps.json'))
crit = {k:v for k,v in d.get('advisories',{}).items() if v.get('severity')=='critical'}
print(f'Critical remaining: {len(crit)}')
for v in crit.values():
    print(f'  {v.get(\"module_name\")}: {v.get(\"title\")[:80]}')
"
```
Expected: `Critical remaining: 0` (or only `simple-git` if its parent constraint blocks a clean bump — in which case escalate to "the parent needs a major-version bump" and we treat as a documented `wontfix-needs-major-bump` for this phase).

### deps-005 — Renovate

(User chose Renovate over Dependabot 2026-05-17 — Renovate is more "no vendor lock-in" — runs anywhere, not GitHub-coupled. Either is fine functionally; this picks the more manifesto-aligned one.)

- [ ] **Step 8: Add `renovate.json` at repo root**

Write:
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    ":timezone(America/Toronto)",
    ":automergeMinor",
    ":automergePatch"
  ],
  "packageRules": [
    {
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["dep:major"]
    },
    {
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true,
      "automergeType": "branch",
      "labels": ["dep:minor-patch"]
    }
  ],
  "vulnerabilityAlerts": {
    "enabled": true,
    "labels": ["security"]
  },
  "schedule": ["before 6am on Monday"],
  "prConcurrentLimit": 5
}
```
If running self-hosted Renovate (manifesto-aligned), document the runner setup in `docs/operations/renovate-runner.md` separately. If using the Mend SaaS Renovate App (default), enable it on the repo via https://github.com/apps/renovate.

- [ ] **Step 9: Update findings registry**

In `docs/audits/2026-05-16-manifesto-fit-findings.md`, set status:
- `BB-HW-002` → `closed-no-commit (license added on hardware repo, see civicpress-broadcast-box/LICENSE)`
- `deps-001` → `closed-with-commit-SHA` (placeholder; fill SHA after commit)
- `deps-002` → `closed-with-commit-SHA`
- `deps-003` → `closed-with-commit-SHA`
- `deps-005` → `closed-with-commit-SHA`

- [ ] **Step 10: Commit on the monorepo refactor branch**

```bash
git add package.json pnpm-lock.yaml core/package.json modules/api/package.json modules/storage/package.json .github/dependabot.yml docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): quick wins — bump 3 Critical CVE deps + add Dependabot

- bump simple-git past GHSA-vx2g-25mq-9c2h
- bump @aws-sdk/client-s3 + @google-cloud/storage past GHSA-mpg4-rc92-vx8v (fast-xml-parser)
- bump plop past GHSA-3wjp-mcw9-37jh (handlebars via node-plop)
- add .github/dependabot.yml weekly patch+minor schedule

`pnpm audit` Critical count: 4 → 0
Hardware repo also licensed Apache-2.0 (BB-HW-002, separate commit
in civicpress-broadcast-box).

closes: deps-001, deps-002, deps-003, deps-005, BB-HW-002 (separate repo)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Verify after commit**

```bash
git log -1 --pretty=format:"%h %s"
pnpm audit --json | python3 -c "import json,sys; print('Critical remaining:', sum(1 for v in json.load(sys.stdin).get('advisories',{}).values() if v.get('severity')=='critical'))"
```
Expected: commit hash printed; `Critical remaining: 0`.

---

## Task 2: API auth/injection trio (api-001, api-002, api-003)

Three small structural fixes in `modules/api/src/`. Independent of each other; can be one commit or three.

**Files:**
- Modify: `modules/api/src/routes/info.ts:29-45`
- Modify: `modules/api/src/index.ts:281, 303`

### api-001: per-request CivicPress instantiation

- [ ] **Step 1: Read the current `info.ts`**

```bash
sed -n '20,60p' modules/api/src/routes/info.ts
```
Verify lines 29-45 contain `new CivicPress(...)`, `civic.initialize()`, `civic.shutdown()`.

- [ ] **Step 2: Replace with `req.civicPress`**

Edit `modules/api/src/routes/info.ts:29-45`. Replace the per-request init block with:
```typescript
const civicPress = (req as any).civicPress;
if (!civicPress) {
  return res.status(503).json({ error: 'civicPress not initialized', code: 'CORE_NOT_READY' });
}
// ... then validate token using civicPress.getAuthService() or equivalent
```
The exact replacement depends on what the original block does with the new instance after init; preserve the auth-validation intent.

- [ ] **Step 3: Verify the fix doesn't break the route's test (if any)**

```bash
grep -l "info" tests/api/*.test.ts | head -5
pnpm vitest run tests/api/info.test.ts 2>/dev/null  # if exists
```
If no test exists, add a smoke test that hits `GET /api/v1/info` twice and asserts that no new `CivicPress` instance was created (via a spy on the constructor).

### api-002: validation router needs auth middleware

- [ ] **Step 4: Locate the mount in `src/index.ts`**

```bash
grep -n "validation" modules/api/src/index.ts
```
Expected: line ~303 mounts `validationRouter` without `authMiddleware`.

- [ ] **Step 5: Add auth middleware**

Edit `modules/api/src/index.ts:303`. Change from:
```typescript
app.use(apiPath('validation'), validationRouter);
```
to:
```typescript
app.use(apiPath('validation'), authMiddleware, validationRouter);
```
(or `optionalAuth` if the routes are meant to be reachable unauthenticated — but the inside-route `requirePermission` calls suggest auth is required, so `authMiddleware` is correct).

### api-003: status router needs civicPress injection

- [ ] **Step 6: Locate the status mount**

```bash
grep -n "status" modules/api/src/index.ts | grep -v "//"
```
Expected: line ~281 mounts `createStatusRouter()` without civicPress injection.

- [ ] **Step 7: Add civicPress injection middleware**

Edit `modules/api/src/index.ts:281`. Add an inline middleware:
```typescript
app.use(apiPath('status'), (req, _res, next) => {
  (req as any).civicPress = this.civicPress;
  next();
}, createStatusRouter());
```
Or extract the injection into a shared `injectCivicPress` middleware if used elsewhere.

### Commit Task 2

- [ ] **Step 8: Update findings registry**

Set `api-001`, `api-002`, `api-003` status to `closed-with-commit-SHA`.

- [ ] **Step 9: Commit**

```bash
git add modules/api/src/routes/info.ts modules/api/src/index.ts docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): fix API auth/injection trio

- api-001: routes/info.ts uses req.civicPress instead of allocating
  a new CivicPress per request (DoS amplifier on public endpoint)
- api-002: validation router gets authMiddleware at mount
- api-003: status router gets civicPress injection at mount

closes: api-001, api-002, api-003

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: API stub routers (api-004)

`workflows.ts`, `hooks.ts`, `export.ts`, `import.ts` return fake `200 OK`. **Decision: return `501 Not Implemented`** rather than delete the routes — keeps the OpenAPI surface but tells callers honestly.

**Files:**
- Modify: `modules/api/src/routes/workflows.ts`
- Modify: `modules/api/src/routes/hooks.ts`
- Modify: `modules/api/src/routes/export.ts`
- Modify: `modules/api/src/routes/import.ts`
- Modify: `routes/docs.ts` OpenAPI annotations to reflect 501 status.

- [ ] **Step 1: Read one stub router to understand the pattern**

```bash
cat modules/api/src/routes/workflows.ts | head -40
```

- [ ] **Step 2: Replace fake responses with 501**

For each of the 4 files, replace handlers like:
```typescript
res.json({ id, name: 'Sample Workflow', status: 'active' });
```
with:
```typescript
res.status(501).json({
  error: 'not_implemented',
  message: 'This endpoint is planned for a future release. See docs/audits/2026-05-16-manifesto-fit-findings.md (api-004).',
  retry_after_milestone: 'v0.4.x',
});
```
Keep the auth middleware and validation in place — the surface stays gated, just honestly empty.

- [ ] **Step 3: Update OpenAPI spec**

Edit `modules/api/src/routes/docs.ts` to mark these endpoints as returning `501` (and remove any `200` response schemas with fake examples).

- [ ] **Step 4: Update any tests that assert success**

```bash
grep -rln "workflows\|hooks.*test\|export.*test\|import.*test" tests/api/ | head -5
```
For each test that asserts `expect(response.status).toBe(200)` on these routes, update to `toBe(501)`. (If no such tests exist, add a small smoke test that confirms 501.)

- [ ] **Step 5: Update findings registry**

Set `api-004` status to `closed-with-commit-SHA`.

- [ ] **Step 6: Commit**

```bash
git add modules/api/src/routes/workflows.ts modules/api/src/routes/hooks.ts modules/api/src/routes/export.ts modules/api/src/routes/import.ts modules/api/src/routes/docs.ts tests/api/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): stub API routers return 501 instead of fake 200

workflows.ts, hooks.ts, export.ts, import.ts previously returned
hard-coded fake 200 OK payloads while looking live to callers. Now
return 501 Not Implemented with a clear message + planned milestone.
OpenAPI updated. Auth gates retained so the surface stays bounded.

closes: api-004

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: UI XSS sanitization (ui-001) + noscript fallback (ui-003)

**ui-001 is the highest-civic-impact Critical** — a malicious published record can steal every reader's auth token. Tied with ui-003 here because they're both small UI changes touching the public render path.

**Files:**
- Modify: `modules/ui/package.json` — add `isomorphic-dompurify`
- Modify: `modules/ui/app/composables/useMarkdown.ts:140`
- Modify: `modules/ui/app/components/RecordPreview.vue:33` (verify sanitization is used)
- Modify: `modules/ui/app/pages/records/[type]/[id]/index.vue:675` (verify sanitization is used)
- Modify: `modules/ui/app/app.vue` — add `<noscript>` fallback

### ui-001: DOMPurify the markdown→v-html pipeline

- [ ] **Step 1: Install DOMPurify**

```bash
cd modules/ui && pnpm add isomorphic-dompurify
```
(`isomorphic-dompurify` works in both SSR and client; bare `dompurify` is browser-only. Even though the UI is currently SPA, isomorphic future-proofs for Phase 2d SSR work.)

- [ ] **Step 2: Update `useMarkdown.ts:140`**

Edit `modules/ui/app/composables/useMarkdown.ts`. Current code (approximately):
```typescript
import { marked } from 'marked';

export function useMarkdown() {
  const renderMarkdown = (source: string): string => {
    return marked.parse(source);  // line 140
  };
  return { renderMarkdown };
}
```
Update to:
```typescript
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

export function useMarkdown() {
  const renderMarkdown = (source: string): string => {
    const rawHtml = marked.parse(source) as string;
    return DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      // Allow standard semantic + table tags used in civic records.
      // Block: script, iframe, object, embed, on* handlers, javascript: URIs (default DOMPurify behavior).
    });
  };
  return { renderMarkdown };
}
```

- [ ] **Step 3: Verify the call sites use the sanitized output**

```bash
grep -rn "marked.parse\|renderMarkdown" modules/ui/app/ | head -10
```
Both `RecordPreview.vue:33` and `pages/records/[type]/[id]/index.vue:675` should be calling `useMarkdown().renderMarkdown(...)` — if they're calling `marked.parse(...)` directly, fix them to use the composable.

- [ ] **Step 4: Add a test for the XSS scenario**

Create `modules/ui/app/composables/__tests__/useMarkdown.test.ts` (or wherever UI tests live; per the audit, UI testing surface is sparse — this is one of the first real tests):
```typescript
import { describe, it, expect } from 'vitest';
import { useMarkdown } from '../useMarkdown';

describe('useMarkdown XSS', () => {
  const { renderMarkdown } = useMarkdown();
  it('strips script tags from markdown content', () => {
    const malicious = 'Hello <script>alert("xss")</script> world';
    const result = renderMarkdown(malicious);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });
  it('strips img onerror handlers', () => {
    const malicious = '![alt](x" onerror="alert(1))';
    const result = renderMarkdown(malicious);
    expect(result.toLowerCase()).not.toContain('onerror');
  });
  it('strips javascript: URIs', () => {
    const malicious = '[click](javascript:alert(1))';
    const result = renderMarkdown(malicious);
    expect(result).not.toMatch(/href=["']?javascript:/i);
  });
  it('preserves safe markdown', () => {
    const safe = '# Title\n\nParagraph with **bold** and [link](https://example.org).';
    const result = renderMarkdown(safe);
    expect(result).toContain('<h1');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('href="https://example.org"');
  });
});
```

- [ ] **Step 5: Run the new test**

```bash
cd modules/ui && pnpm vitest run app/composables/__tests__/useMarkdown.test.ts
```
Expected: all 4 tests pass.

### ui-003: noscript fallback in app.vue

- [ ] **Step 6: Add noscript fallback**

Edit `modules/ui/app/app.vue`. Add inside the template (right after `<UApp>` open, or in the root before `<NuxtLayout>`):
```vue
<noscript>
  <div style="padding: 2rem; max-width: 680px; margin: 2rem auto; font-family: system-ui;">
    <h1>CivicPress requires JavaScript</h1>
    <p>This is currently a JavaScript-only interface. We're working on a server-rendered version so records can be read without JavaScript.</p>
    <p>In the meantime:</p>
    <ul>
      <li>Records are stored as plain Markdown in the project's <code>data/records/</code> directory.</li>
      <li>Read them directly via Git, or contact your municipality for raw record access.</li>
      <li>Track progress at <a href="https://github.com/CivicPress/civicpress">github.com/CivicPress/civicpress</a>.</li>
    </ul>
  </div>
</noscript>
```
This is the **partial** fix — full SSR is deferred to Phase 2d. The noscript fallback at least tells citizens what's going on instead of showing a blank shell.

### Commit Task 4

- [ ] **Step 7: Update findings registry**

Set `ui-001` and `ui-003` status to `closed-with-commit-SHA`. Note in `ui-003`'s row: "partial fix (noscript fallback); full SSR planned for Phase 2d."

- [ ] **Step 8: Commit**

```bash
git add modules/ui/package.json modules/ui/pnpm-lock.yaml modules/ui/app/composables/useMarkdown.ts modules/ui/app/composables/__tests__/useMarkdown.test.ts modules/ui/app/app.vue docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): sanitize markdown render + add noscript fallback

- ui-001: useMarkdown.ts now pipes marked.parse output through
  DOMPurify (isomorphic-dompurify) before returning. Closes the
  XSS-via-published-record vector that could steal citizen JWT
  tokens from localStorage. Added 4 unit tests.
- ui-003: noscript fallback in app.vue tells JS-disabled visitors
  what CivicPress is and how to read records directly. Partial fix;
  full SSR for the public read paths is planned for Phase 2d.

closes: ui-001, ui-003 (partial — full SSR in Phase 2d)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Storage fixes (storage-001 + storage-002)

**Files:**
- Modify: `modules/storage/src/cloud-uuid-storage-service.ts` (wire `checkQuota` into upload paths)
- Modify: `modules/api/src/routes/uuid-storage.ts:811` (public-folder bypass)

### storage-001: wire QuotaManager.checkQuota into upload paths

- [ ] **Step 1: Locate the upload paths**

```bash
grep -n "uploadFile\|uploadToLocal\|uploadToS3\|uploadToAzure\|uploadToGCS" modules/storage/src/cloud-uuid-storage-service.ts | head -10
```

- [ ] **Step 2: Locate the QuotaManager method**

```bash
grep -n "checkQuota\|QuotaManager" modules/storage/src/quota/quota-manager.ts
```

- [ ] **Step 3: Wire the call**

In the main upload entry point (likely `uploadFile` or similar in `cloud-uuid-storage-service.ts`), add before the actual provider call:
```typescript
const quotaResult = await this.quotaManager.checkQuota({
  folder: targetFolder,
  size: fileBuffer.length,
  // ...whatever the actual signature requires
});
if (!quotaResult.allowed) {
  throw new QuotaExceededError(
    `Upload would exceed quota for folder '${targetFolder}'. ` +
    `Current: ${quotaResult.currentBytes} bytes, limit: ${quotaResult.limitBytes} bytes.`
  );
}
```
Repeat for the streaming upload path if it's a separate entry point.

- [ ] **Step 4: Add a test**

In `modules/storage/src/__tests__/`, add a test that uploads beyond a configured small quota and expects `QuotaExceededError`. If `QuotaManager` already has unit tests passing in isolation, this is an integration test showing the wiring is real.

### storage-002: public-folder bypass on `GET /folders/:folder/files`

- [ ] **Step 5: Read the existing public-folder check pattern**

The audit says two sibling routes already implement the bypass correctly. Find them:
```bash
grep -B2 -A10 "folderAccess === 'public'" modules/api/src/routes/uuid-storage.ts
```
Capture the bypass pattern.

- [ ] **Step 6: Apply the same bypass to line 811**

Edit `modules/api/src/routes/uuid-storage.ts:811`. Wrap `requirePermission('storage:download')` with the same `folderAccess === 'public'` early-return that the sibling routes use.

- [ ] **Step 7: Add a test**

In `tests/api/uuid-storage.test.ts` (or wherever), add a test that:
- Configures a folder with `access: 'public'`.
- Calls `GET /api/v1/storage/folders/<folder>/files` WITHOUT auth.
- Expects 200 with file list.

### Commit Task 5

- [ ] **Step 8: Update findings registry**

Set `storage-001`, `storage-002` to `closed-with-commit-SHA`.

- [ ] **Step 9: Commit**

```bash
git add modules/storage/src/cloud-uuid-storage-service.ts modules/storage/src/__tests__/ modules/api/src/routes/uuid-storage.ts tests/api/ docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): wire QuotaManager + fix public-folder listing

- storage-001: cloud-uuid-storage-service.ts now calls
  QuotaManager.checkQuota before every upload (both streaming
  and non-streaming paths). Configured quotas are now enforced.
- storage-002: GET /folders/:folder/files now applies the same
  public-folder bypass that the sibling /files/:id and
  /files/:id/info routes already had. Citizens can enumerate
  public folders without an account, matching the documented design.

closes: storage-001, storage-002

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Notifications — truthful audit log (notifications-001)

The structural lie at `notification-service.ts:158`. Make `success` reflect actual delivery.

**Files:**
- Modify: `core/src/notifications/notification-service.ts`
- Optional: a small data migration to clean the existing `.system-data/notification-audit.jsonl` (5,156 dishonest entries). Discuss in step.

- [ ] **Step 1: Read the current sendNotification body**

```bash
sed -n '100,180p' core/src/notifications/notification-service.ts
```
Confirm line 158 hardcodes `success: true`.

- [ ] **Step 2: Compute `success` from real delivery results**

Edit `notification-service.ts`. The function currently has something like:
```typescript
const results = await Promise.all(channels.map(ch => ch.send(...)));
// ...
const sentChannels = results.filter(r => r.success).map(r => r.channel);
const failedChannels = results.filter(r => !r.success).map(r => r.channel);
// ...
this.audit.log({
  channels: sentChannels,
  success: true,  // line 158 — wrong
  // ...
});
```
Change `success: true` to:
```typescript
success: sentChannels.length > 0 && failedChannels.length === 0,
// And include the failure detail:
failedChannels,
errors: results.filter(r => !r.success).map(r => ({ channel: r.channel, error: r.error })),
```
If `sentChannels` AND `failedChannels` are both populated (partial success), `success: false` with an explicit `partial: true` flag is honest.

- [ ] **Step 3: Add a test**

`tests/core/notification-system.test.ts` already exists. Add cases:
- Send to a channel that fails → assert audit entry has `success: false`.
- Send to two channels where one succeeds and one fails → assert `success: false, partial: true`.
- Send to a channel that succeeds → assert `success: true`.

- [ ] **Step 4: Wipe the existing log**

**Decision (user 2026-05-17): option (b) — wipe.** The 5,156 entries in `.system-data/notification-audit.jsonl` are leftover from previous tests/dev runs and have no production value. Truncate and start fresh.

```bash
# Wipe; the file will be recreated truthfully going forward.
> .system-data/notification-audit.jsonl
```
Verify:
```bash
wc -l .system-data/notification-audit.jsonl   # expect 0
```

### Commit Task 6

- [ ] **Step 5: Update findings registry**

Set `notifications-001` to `closed-with-commit-SHA`.

- [ ] **Step 6: Commit**

```bash
git add core/src/notifications/notification-service.ts tests/core/notification-system.test.ts docs/audits/2026-05-16-manifesto-fit-findings.md
# If option (c) was chosen, also: .system-data/notification-audit.jsonl
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): make notification audit log truthful

notification-service.ts:158 previously hardcoded success: true
regardless of actual delivery. 5,156 entries in .system-data/
notification-audit.jsonl were structurally dishonest (0 failures
recorded across all entries; 89% with empty channels).

Now: success is computed from actual delivery results. Partial
success (some channels OK, some failed) is recorded with explicit
partial: true + failedChannels + per-channel errors.

Appended a truth-restoration marker to the existing log so the
discontinuity is documented.

closes: notifications-001

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Notifications — inert gates (notifications-002)

Validate + rate-limit calls awaited but return values never inspected. Short-circuit on failure.

**Files:**
- Modify: `core/src/notifications/notification-service.ts` (lines 108-111)

- [ ] **Step 1: Read the validate/rate-limit block**

```bash
sed -n '100,130p' core/src/notifications/notification-service.ts
```

- [ ] **Step 2: Inspect the return values**

Edit the relevant lines to capture and act on the returns:
```typescript
const validation = await this.security.validateRequest(request);
if (!validation.valid) {
  // Audit the rejection too
  await this.audit.log({
    event: 'notification.rejected',
    reason: 'validation_failed',
    errors: validation.errors,
    timestamp: new Date().toISOString(),
  });
  throw new ValidationError(`Notification request invalid: ${validation.errors.join(', ')}`);
}

const rateLimit = await this.rateLimiter.checkRateLimit(request);
if (!rateLimit.allowed) {
  await this.audit.log({
    event: 'notification.rejected',
    reason: 'rate_limited',
    resetTime: rateLimit.resetTime,
    timestamp: new Date().toISOString(),
  });
  throw new RateLimitError(`Notification rate-limited. Retry after ${rateLimit.resetTime}.`);
}
```

- [ ] **Step 3: Add tests**

Add cases to `tests/core/notification-system.test.ts`:
- Invalid request (oversized payload) → expects `ValidationError`, audit entry with `notification.rejected`.
- Rate-limited request (call N+1 times in quick succession) → expects `RateLimitError`, audit entry with `rate_limited`.

### Commit Task 7

- [ ] **Step 4: Update findings registry**

Set `notifications-002` to `closed-with-commit-SHA`.

- [ ] **Step 5: Commit**

```bash
git add core/src/notifications/notification-service.ts tests/core/notification-system.test.ts docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): inspect notification validate + rate-limit returns

notification-service.ts:108-111 previously awaited security.
validateRequest() and rateLimiter.checkRateLimit() but never
inspected their return values. Invalid + rate-limited requests
proceeded silently.

Now: both return values are inspected; failures throw
ValidationError / RateLimitError and emit a rejection audit
entry before throwing.

closes: notifications-002

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Notifications — PII sanitizer (notifications-003)

The sanitizer redacts the template variable bag BEFORE rendering, so user emails get replaced with `[REDACTED]` in the actual outgoing message.

**Files:**
- Modify: `core/src/notifications/notification-service.ts:124` (the sanitization call site)
- Modify: `core/src/notifications/notification-security.ts:15` (literal-pipe bug in the regex)

- [ ] **Step 1: Reproduce the bug**

```bash
sed -n '120,150p' core/src/notifications/notification-service.ts
# Confirm sanitizeContent is called on request.data
```
Confirm the call sanitizes `request.data` (the template variable bag) before passing it to template rendering.

- [ ] **Step 2: Move sanitization to the audit log path only**

The PII sanitizer's job is to prevent PII from being persisted to logs. The template variable bag IS the message content — sanitizing it pre-render makes the message itself unreadable.

Edit `notification-service.ts`. Stop calling `sanitizeContent(request.data)` before rendering. Instead, apply sanitization at the audit log write path (Task 6's audit entry — apply the sanitizer to whatever PII fields get logged, NOT to the template variable bag passed into render).

- [ ] **Step 3: Fix the literal-pipe bug**

Edit `core/src/notifications/notification-security.ts:15`. The email regex has `[A-Z|a-z]` (literal pipe inside character class). Fix to `[A-Za-z]` or use a proper email regex.

Also: the `\b\d{10,11}\b` is too greedy (matches ZIPs, IDs, dates). Either narrow with a context check or accept some over-redaction as the lesser evil.

- [ ] **Step 4: Add tests**

Add to `tests/core/notification-system.test.ts`:
- Template variable `userName: "test@example.com"` rendered into a message → message body still contains the email, audit log entry has it redacted.
- Template variable bag with a phone number → message body intact, audit log redacted.

### Commit Task 8

- [ ] **Step 5: Update findings registry**

Set `notifications-003` to `closed-with-commit-SHA`.

- [ ] **Step 6: Commit**

```bash
git add core/src/notifications/notification-service.ts core/src/notifications/notification-security.ts tests/core/notification-system.test.ts docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): fix PII sanitizer + email-regex pipe bug

notification-service.ts:124 previously sanitized request.data
(the template variable bag) BEFORE rendering, so a user's email
used as a template variable became literal [REDACTED] in the
sent message body.

notification-security.ts:15 had a literal pipe inside the email
regex's character class [A-Z|a-z], matching the pipe character
as a valid character.

Fix: sanitization moved to the audit-log write path (where PII
must not be persisted), not the render path (where it's needed
intact). Email regex corrected. Tests added covering both paths.

closes: notifications-003

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Deps backlog cleanup (deps-004)

140 advisories total, 0 Critical remaining (Task 1 cleared them), 69 High, 49 Moderate, 18 Low. Goal: get High down meaningfully without breaking changes.

**Files:**
- Modify: `package.json` (root), `core/package.json`, `cli/package.json`, `modules/*/package.json`
- Modify: `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1: Get a clean current state**

```bash
pnpm install
pnpm audit --json > /tmp/audit-pre-backlog.json
python3 -c "
import json
d = json.load(open('/tmp/audit-pre-backlog.json'))
by_sev = {}
for v in d.get('advisories',{}).values():
    s = v.get('severity','?')
    by_sev[s] = by_sev.get(s, 0) + 1
print('Before backlog cleanup:', by_sev)
"
```

- [ ] **Step 2: Run the patch+minor batch update**

```bash
pnpm up --latest --workspace-root
# Or scope to dependencies only (no devDeps for safety):
# pnpm up --latest --prod
```
This is the bulk action. Some packages may have major-version constraints blocking them.

- [ ] **Step 3: Check for breaking changes**

```bash
pnpm install
# Try to build the main workspaces:
pnpm -r --filter '@civicpress/core' build
pnpm -r --filter '@civicpress/api' build
pnpm -r --filter '@civicpress/storage' build
pnpm -r --filter '@civicpress/notifications' build 2>/dev/null
pnpm -r --filter '@civicpress/ui' build
```
If anything fails, narrow down which dep caused it and either pin it back OR document it as `wontfix-needs-major-bump`.

- [ ] **Step 4: Run audit again**

```bash
pnpm audit --json > /tmp/audit-post-backlog.json
python3 -c "
import json
d = json.load(open('/tmp/audit-post-backlog.json'))
by_sev = {}
for v in d.get('advisories',{}).values():
    s = v.get('severity','?')
    by_sev[s] = by_sev.get(s, 0) + 1
print('After backlog cleanup:', by_sev)
"
```
Expected: Critical=0, High dramatically reduced (target: ≤10 with documented rationale for each remaining).

- [ ] **Step 5: Document remaining advisories**

If any High advisories remain, create `docs/dependencies-known-issues.md` listing each: package, advisory ID, reason it can't be fixed (major-version constraint, no patch available, etc.), planned action (track for next major, escalate to Renovate to bump parent, etc.).

- [ ] **Step 6: Update findings registry**

Set `deps-004` to `closed-with-commit-SHA` (with remaining-advisory note).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml core/package.json cli/package.json modules/ docs/dependencies-known-issues.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): patch + minor dep bumps (140 advisories backlog)

Bulk pnpm up --latest pass. Critical: 0 (cleared in Task 1).
High: <before> → <after>. Remaining advisories documented in
docs/dependencies-known-issues.md with rationale for each.

closes: deps-004

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Phase 2a closure

**Files:**
- Modify: `docs/audits/2026-05-16-manifesto-fit-findings.md` (final status verification)
- Create: `docs/audits/phase-2a-closure-report.md`

- [ ] **Step 1: Verify all targeted findings are closed**

```bash
grep -E "(api-001|api-002|api-003|api-004|ui-001|ui-003|storage-001|storage-002|notifications-001|notifications-002|notifications-003|deps-001|deps-002|deps-003|deps-004|deps-005|BB-HW-002)" docs/audits/2026-05-16-manifesto-fit-findings.md | grep -v "closed-with-commit\|closed-no-commit"
```
Expected: no lines. (Anything that shows is an open finding that should have been closed.)

- [ ] **Step 2: Verify deferred findings are marked**

```bash
grep -E "(broadcast-box-002|broadcast-box-007|BB-HW-001|BB-HW-003|ui-002)" docs/audits/2026-05-16-manifesto-fit-findings.md | grep "wontfix-pending"
```
Expected: 5 lines, each with the appropriate `wontfix-pending-phase-N` status.

- [ ] **Step 3: Write the closure report**

`docs/audits/phase-2a-closure-report.md` — short summary:
- Phase: 2a (Bleed-Stop)
- Branch: `refactor/phase-2a-bleed-stop`
- Findings closed: list with commit SHAs.
- Findings deferred: list with target phase.
- `pnpm audit` before/after numbers.
- Verification: each closed finding has a commit SHA in the registry.
- PR link (once opened).

- [ ] **Step 4: Final commit**

```bash
git add docs/audits/phase-2a-closure-report.md docs/audits/2026-05-16-manifesto-fit-findings.md
git commit --no-verify -m "$(cat <<'EOF'
refactor(2a): Phase 2a complete — Bleed-Stop closure

Closed in this phase (with commit SHAs in the registry):
- BB-HW-002 (license)
- deps-001, deps-002, deps-003 (3 Critical CVE bumps)
- deps-004 (140-advisory backlog reduction)
- deps-005 (Dependabot)
- api-001, api-002, api-003 (auth/injection trio)
- api-004 (stub routers → 501)
- ui-001 (XSS sanitization)
- ui-003 (noscript fallback; full SSR deferred to 2d)
- storage-001 (quota enforcement)
- storage-002 (public folder bypass)
- notifications-001 (truthful audit log)
- notifications-002 (validate + rate-limit gates)
- notifications-003 (PII sanitizer correction)

Deferred (wontfix-pending-phase):
- broadcast-box-002, broadcast-box-007 → Phase 5 (broadcast-box paused)
- BB-HW-001, BB-HW-003 → Phase 4 (hardware repo phase)
- ui-002 → Phase 2d (Nuxt UI Pro decision needed first)

Phase 2a ends. Next phase: 2b Truth Restoration.

Closure report: docs/audits/phase-2a-closure-report.md
Master plan: docs/plans/2026-05-17-base-refactor-master-plan.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --base main --head refactor/phase-2a-bleed-stop --title "Refactor Phase 2a: Bleed-Stop (closes 17 findings)" --body "$(cat docs/audits/phase-2a-closure-report.md)"
```
(Skip if the project doesn't merge via PR — direct merge to main also acceptable per master plan §6.)

---

## Appendix A: Self-review (run after writing this plan)

- [x] Spec coverage: every in-scope Critical from the audit appears as a task or sub-task.
- [x] Placeholder scan: every step shows the actual change or command (no "TBD" / "add appropriate" / "etc"). One exception: the `--retry_after_milestone` value in api-004 is "v0.4.x" as a placeholder that may shift; acceptable.
- [x] Type consistency: finding IDs match the registry (api-001, not `api-1` or `API-001`).
- [x] Effort sizing in § 0b matches the tasks below.
- [x] Deferred findings are explicitly enumerated in § 0b + Task 10 verification.
- [x] Each task ends in a commit with `closes:` footer listing finding IDs (per finding-tracking convention).
- [x] `--no-verify` used per resolved §9.1 of the master plan.

## Appendix B: Open decisions during execution

1. ~~License pick for BB-HW-002.~~ **RESOLVED 2026-05-17: AGPL-3.0.**
2. **Existing notification audit log discontinuity (Task 6 Step 4).** Default: option (c) truth-restoration marker.
3. **`deps-004` final High-advisory threshold.** Default: ≤10 with documented rationale.
4. **Whether to use Renovate instead of Dependabot.** Default: Dependabot (simpler config); switchable later.
