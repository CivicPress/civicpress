# Dependencies — Known Open Advisories

Last updated: 2026-05-17 (Phase 2a Task 9 closure)
Owner: refactor team
Sibling docs: `docs/audits/sections/dependencies-licenses.md`, `renovate.json`

## Snapshot

| Severity | Count | Notes |
|---|---|---|
| Critical | **0** | All 4 Criticals from the audit closed in Phase 2a Task 1 (`simple-git`, `fast-xml-parser` x2, `handlebars`). |
| High | 10 | All transitive; all in dev-tooling or test-only paths. Listed below. |
| Moderate | 7 | Same shape — transitive dev/test deps. |
| Low | 4 | Cosmetic / edge-case issues. |
| **TOTAL** | **21** | down from 143 advisories on 2026-05-17 morning (the audit's Phase 3 finding deps-004). |

Goal of Phase 2a Task 9 was to reduce the High count meaningfully without introducing breaking changes. `pnpm update --recursive` (semver-respecting, no `--latest`) achieved a 143 → 21 reduction without any test or build failures. The remaining 21 advisories all sit behind transitive paths whose direct-dep owners haven't released compatible bumps yet — they'll close naturally as those direct deps publish patches, which Renovate (added in Task 1) will surface via weekly PRs.

## Remaining High advisories (10)

All are transitive. None are in the API request hot path or the UI render path.

| Package | Issue | Direct parent | Why we can't bump further today | Action |
|---|---|---|---|---|
| `glob` | CLI command injection via `-c/--cmd` | dev tooling | Affects the `glob` CLI binary, not library usage. CivicPress source never invokes `glob` from a shell context. | Watch Renovate for upstream bump. |
| `node-tar` (5 advisories) | Various path-traversal + hardlink escapes via malicious tarball extraction | `sqlite3 > prebuild-install`, `cli > tar`, `cli > inquirer > external-editor > tmp`, build tooling | Transitive via build/install chains. Exposure surface is "extracting an attacker-controlled tarball during install/build," not runtime. | Watch Renovate; upstream bumps blocked by parent constraints. |
| `tar` (1 advisory) | Hardlink path traversal via drive-relative paths | `cli > tar` | Same risk profile as node-tar. | Watch Renovate. |
| `nodemailer` | `addressparser` DoS via malformed address | `core > nodemailer` | Triggered only on parsing untrusted email addresses. The notifications module is structurally being rebuilt; this dep is on the chopping block (see notifications-005). | Will close naturally during notifications consolidation (Phase 2b/2c). |
| `happy-dom` (2 advisories) | fetch credentials cross-origin + ECMAScriptModuleCompiler sanitization | `vitest.config.ui.mjs > happy-dom` | Test-only environment. Never runs in production. | Watch Renovate; happy-dom releases frequently. |

## Renovate config (`renovate.json`)

Added in Phase 2a Task 1. Weekly Monday schedule, auto-merge minor + patch via branch, major requires manual review, security advisories labelled `security`. Will surface upstream patches as they release.

## Re-audit cadence

- **Per Renovate PR:** the bot opens a PR per dep update; CI runs audit on the PR. Renovate maintainer reviews + merges.
- **Per refactor phase exit:** at the end of each Phase 2x/3/4/5 sub-phase, re-run `pnpm audit` and update this doc.
- **Per release:** before any v0.3+ tag, re-run audit + update this doc + commit the SHA into release notes.

## Anti-deletion rule

When advisories close, MOVE the rows to a `## Closed advisories` section below (with closure date + SHA) rather than deleting them. Audit-trail of "we knew about this and addressed it" is the manifesto Trust + Transparency posture.

## Closed advisories

(None yet — the 122 closed during Task 9 closed via bulk update without per-row recording. Going forward, Renovate's PRs will be the per-advisory closure trail; this section grows as security-specifically-labelled Renovate PRs land.)
