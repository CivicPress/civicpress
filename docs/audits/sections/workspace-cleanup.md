# Audit Section: workspace-cleanup

**Date:** 2026-05-17
**Auditor:** parallel-agent (workspace hygiene, parent-directory only)
**Depth:** moderate (~30 min)
**Scope:** Parent directory `/Users/stakabo/Work/repos/civicpress/`

This is **not** a manifesto-fit audit of code. It's a workspace-hygiene pass on
the parent of the 5-repo CivicPress ecosystem. Per-module code findings are
covered in the other sections under `sections/`. Out of scope here: deletions,
moves, modifications, commits.

---

## Inventory

Top-level contents of `/Users/stakabo/Work/repos/civicpress/` (sizes
measured on-disk including ignored runtime files / venvs / node_modules):

1. `civicpress/` — main monorepo (`github.com:CivicPress/civicpress.git`). 2.2 GB. Active. Audited in Phase 1.
2. `civicpress-broadcast-box/` — hardware repo (Python + Nuxt frontend, **no git remote configured**). 4.4 GB on-disk; 3.4 GB of that is the gitignored `storage/` runtime folder (recordings, db, watermarks); 542 MB `frontend/node_modules`; 371 MB `.venv`. Last commit Feb 3 2026 ("Add configurable watermark/logo overlay…"). Active. Audited in Phase 1.
3. `civicpress-broadcast-box-backup/` — copy of the hardware repo snapshotted Jan 30 2026 (separate `.git`, **no remote**). 4.3 GB; same internal shape; backup has a Jan 30 SQUASH_MSG suggesting it was the state immediately before a squash. Has a `__main_nuxt/` 192 KB folder (gitignored reference-frontend) and an `enrollment-qr.png` not present in the main repo. Last commit Jan 30.
4. `civicpress-ingest/` — data parser pipeline (**no git remote**, local-only). 1.8 GB. Active. Audited in a parallel session.
5. `site/` — project website (`github.com:CivicPress/site.git`). 351 MB. Active. Audited in a parallel session.
6. `manifesto/` — philosophy/governance/roadmap (`github.com:CivicPress/manifesto.git`). 420 KB. Last commit Dec 19 2025 (contact-info update). Substantively last updated August 2025 (v1.1). Public.
7. `media/` — press kit + logo pack repo (`github.com:CivicPress/media.git`). 1.5 MB. Last touched Dec 1 2025. **Sixth repo in the ecosystem** — not mentioned in the audit prompt's "5-repo ecosystem" line.
8. `_images/` — Illustrator source files (`markers.ai`, `markers [Recovered].ai`) + a `PNG/` export tree containing UUID-suffixed civic icons (`building.4d0fbd13-….png`, `hospital.9e905939-….png`, etc.). 872 KB. The UUID-named files match entries in `civicpress/exports/backups/*/storage-files.json` — i.e., these are the source assets that were uploaded into the running CivicPress instance.
9. `_work_bk/` — "work backup" catch-all. **3.8 GB**. Contents:
   - Five dated snapshot folders (`20251107-001/`, `20251107-002/`, `20251117/`, `20251118/`, `20251119/`) holding old `_input/_output/_work`/`data/`/`storage/` snapshots
   - `1002_cleanup_2024_2025_minutes_date_fix/` — task-named work folder
   - `20260125-civicpress-broadcast-box copy/` — **a third, even older copy of the hardware repo** (1.3 GB, includes its own `.git`, `.venv`, `__main_nuxt`)
   - `__system-data-backup-20250903-160938/` — civic.db + yml configs from Sep 3 2025
   - `_geo_data/` — Quebec municipal GeoJSON / shapefile dataset; large
   - Two top-level `civicpress-backup-20251217-*.tar.gz` files (777 MB and 693 MB) from Dec 17 2025 — full-repo dumps
   - `exports/backups/2025-12-17T14-02-25.706Z/` — another backup directory
   - **Personal billing data**: `civicpress_timesheet_full.csv`, `civicpress_timesheet_daily.csv`, `civicpress_timesheet_partial.csv`, `civicpress_monthly_summary.csv`, plus monthly `timesheet_2025-MM.csv`/`.xlsx` for May 2025–March 2026 (mode 600, owner-only — not currently exposed, but stored adjacent to public repos).
10. `media/` — see #7.
11. `demo-update-commands.md` — loose 961-byte cheat-sheet of `pnpm generate / rsync / systemctl / nginx` commands for the `demo-en.civicpress.io` / `demo-fr.civicpress.io` deploy. Last touched Dec 16 2025. Includes a literal `git pull origin main` — an operational runbook fragment, not a repo doc.
12. `.DS_Store` — macOS finder metadata at the parent root. Also present inside several of the subdirs.

No top-level `README.md` exists explaining the ecosystem.

---

## Per-item Assessment

### 1. `civicpress/` (main monorepo) — **KEEP**

Active, public, the audited platform. Nothing to clean up at the parent level.

### 2. `civicpress-broadcast-box/` (hardware repo) — **KEEP** + investigate remote

Active, but **has no git remote configured**, which means the only copy lives
on this disk. The Phase 1 audit (BB-HW-002) flagged the missing LICENSE; this
audit flags the missing remote as the same class of issue (a municipality
cannot get the source from anywhere but Mathieu's laptop). 3.4 GB of recorded
media in `storage/` is gitignored — correct — but the on-disk footprint is
non-trivial; consider a separate disk/volume for `storage/` if the workspace
gets cloned.

### 3. `civicpress-broadcast-box-backup/` — **ARCHIVE or DELETE**

A point-in-time snapshot from Jan 30 2026. The main repo has 10+ days of newer
commits (Feb 3). The backup contains a `__main_nuxt/` reference folder and an
`enrollment-qr.png` not present in the main repo, but `__main_nuxt/` is
explicitly gitignored in the main `.gitignore` and `enrollment-qr.png` is also
gitignored — so those are local-only files that wouldn't have been recovered
from the main repo's git in any case. The backup's own `.git` shows a recent
`SQUASH_MSG` — it was likely retained as "the state before I squashed a long
branch". Once the main repo gains a real remote (recommended above), this
backup is redundant. **Net:** the 4.3 GB backup is mostly duplicate runtime
recordings; once the small set of non-gitignored differentiators (if any) are
salvaged into the main repo, the backup can be deleted. Decision should be
deliberate, not implicit.

### 4. `civicpress-ingest/` — **KEEP** + investigate remote

Active. No remote configured (same risk class as the hardware repo).
Per-module audit covers code; at the workspace level, the only flag is that
this is **the second local-only repo in the ecosystem**.

### 5. `site/` — **KEEP**

Public, has remote. Note: contains a `dist` symlink pointing at the absolute
host path `/Users/stakabo/Work/repos/civicpress/site/.output/public` — a
machine-specific path that breaks if the workspace is moved or cloned by
another contributor. Worth normalising to a relative symlink in a separate
fix, out of scope here.

### 6. `manifesto/` — **KEEP** + refresh

Public repo. Substantive content last revised August 2025 for v1.1 (per the
file). The latest two commits (Dec 19, July 2 prior to that) are
contact-information + appendix-link updates. The main audit's
*Recommended Next Sessions §4* already flags that §3.5 still names "Ledger"
as the civic-accountability flagship rather than broadcast-box, and the
roadmap.md inside this repo is just a pointer back to the main
`civicpress/docs/roadmap.md`. No workspace-level cleanup here — flagged
because the **manifesto staleness directly contradicts the manifesto's own
Transparency principle**, but the fix lives in the manifesto-refresh session,
not this one.

### 7. `media/` — **KEEP, document**

Legitimate public press-kit repo. Issue: **the audit prompt itself listed
"5 named repos + 1 backup" and didn't mention `media/`** — i.e., it's
discoverable on disk but absent from the ecosystem documentation. A top-level
parent-dir README listing all six repos and their purposes would close this
gap.

### 8. `_images/` — **RELOCATE**

The Illustrator source files (`markers.ai`, plus a `[Recovered]` autosave
sibling) and PNG exports are the source assets behind icons that are
**already uploaded to the running CivicPress storage system** (referenced by
UUID-suffixed filename in `civicpress/exports/backups/*/storage-files.json`).
The `[Recovered]` filename strongly suggests this was Mathieu's working dir
during the original asset creation. Sensible home: either inside the
`media/` repo (since it's where civic brand/icon source belongs) under
`logos/SVG-source/` or `icons/source/`, or a new `media/source/` subfolder.
At the parent root with an underscore prefix it reads as "ignore me" —
which is the opposite of how a public icon set should be treated for an
open-source civic platform.

### 9. `_work_bk/` — **ARCHIVE off-disk + DELETE from workspace** (multiple sub-actions)

The 3.8 GB grab-bag is the single largest cleanup signal in the workspace.
Per sub-item:

- **Five dated work snapshots** (`20251107-001/` through `20251119/`,
  plus `1002_cleanup_2024_2025_minutes_date_fix/`): manual point-in-time
  copies of `_input/_output/_work` and `data/storage` from Nov 2025. If the
  underlying work is now in git, these are redundant; if it's not, the
  data should be in `civicpress-ingest/` proper. Either way, not the parent
  dir.
- **`20260125-civicpress-broadcast-box copy/`** (1.3 GB): a **third**
  copy of the hardware repo. With the active repo (#2) and the backup
  repo (#3) already present, this third copy is duplicative. Same archive
  /delete decision as #3.
- **`__system-data-backup-20250903-160938/`**: Sep 3 2025 snapshot of
  `civic.db`, `notifications.yml`, `notification-audit.jsonl`, etc. — this
  is **operational state, not source**. If still relevant: belongs inside
  `civicpress/.system-data/backups/` or off-site. If not: delete.
- **`_geo_data/`** (Quebec municipal SHP/GDB/GeoJSON, including a
  98 MB `munic_s.shp` and `.gdb` tables): a real dataset used to seed the
  Richmond demo town. Belongs in `civicpress-ingest/` (data-pipeline repo)
  or a dedicated `civicpress-data/` repo, **not** in a folder called
  `_work_bk`.
- **`civicpress-backup-20251217-*.tar.gz`** (777 MB + 693 MB): full-repo
  tarballs from Dec 17 2025. With git active and the `civicpress` repo
  pushed to GitHub, git provides equivalent (and better) protection.
  **1.4 GB recoverable.**
- **`exports/backups/2025-12-17T14-02-25.706Z/`**: yet another backup
  layer; likely an old export from CivicPress's own backup feature.
- **`timesheet_*.csv` / `timesheet_*.xlsx`** (Apr 2025 – Mar 2026): personal
  billing data. **PII / financial.** Mode 600 today — fine in isolation,
  but living next to public repos invites accidental `git add` or accidental
  workspace-sharing. Should be **out of the workspace entirely** — separate
  folder (e.g., `~/Documents/civicpress-admin/`) or a private encrypted
  vault. Flagged High.

**Recommended action for `_work_bk/`:** triage each subitem to its rightful
home (or off-site archive), then delete the directory. This alone reclaims
3.8 GB and removes the single biggest "ambiguous stuff" concentration in the
workspace.

### 10. `media/` — see #7.

### 11. `demo-update-commands.md` — **RELOCATE**

A `bash` runbook fragment for deploying to `demo-en.civicpress.io` /
`demo-fr.civicpress.io`. Useful, but a loose file at the parent root is the
wrong shape — anyone cloning the parent would not see it; anyone working
inside `civicpress/` would not see it either. Belongs inside
`civicpress/docs/operations/demo-deploy.md` (or `scripts/deploy-demo.sh`
if it can be scripted). The literal `git pull origin main` step is
already in the file, confirming this is meant to be inside the main repo.

### 12. `.DS_Store` files — **DELETE**

macOS Finder metadata. At parent root and inside `_images/`, `_work_bk/`,
`media/`, `manifesto/`, `civicpress-broadcast-box*/`. Inert. The main
`civicpress/` repo already gitignores `.DS_Store`. A workspace-level
`.gitignore_global` in the user's home or a top-level
`/etc/launchd/com.apple.desktopservices.DSDontWriteNetworkStores` plist
would prevent recurrence. Out of audit scope; trivial.

---

## Cross-cutting observations

### Sensitive content

- **Personal billing data in plain text:** `_work_bk/civicpress_timesheet_*.csv`
  + `timesheet_2025-*.{csv,xlsx}` + `timesheet_2026-*.{csv,xlsx}`. Mode 600
  protects from other-user reads on this machine; does **not** protect from
  accidental `git add`, `tar`-and-share, or workspace-cloning. **Action:** move
  out of the repos workspace.
- **System-data backup containing `civic.db` + `notification-audit.jsonl`:**
  `_work_bk/__system-data-backup-20250903-160938/`. The audit log file in
  particular may contain user emails / civic data. Not currently exposed (no
  remote sync); flagged because the location is wrong.
- **No `.env` / `.pem` / `id_rsa*` / `*credentials*` secret-files found** at
  the parent level (good). The four matches found —
  `civicpress/docs/notifications-credentials.example`,
  `civicpress/docs/storage-credentials.example`,
  `civicpress-broadcast-box*/htmlcov/z_*_credentials_py.html` (test coverage
  HTML), `_work_bk/20260125-civicpress-broadcast-box copy/htmlcov/…` — are
  templates and coverage reports, not actual secrets.
- **Two `.tar.gz` repo backups** in `_work_bk/` (1.4 GB combined) — if these
  were uploaded to GitHub releases or anywhere networked, they'd be a leak
  surface; locally they're inert.

### Large binaries

- **`_work_bk/civicpress-backup-20251217-085845.tar.gz`** (777 MB) and
  **`-090029.tar.gz`** (693 MB) — full-repo dumps. **Git already provides
  this**; redundant. Not in any repo's history; just sitting on disk. Should
  be deleted once verified equivalent to git HEAD at that date.
- **`_work_bk/_geo_data/` shapefiles** (98 MB `munic_s.shp` + `.gdb` tables)
  — large but legitimate Quebec municipal dataset. If retained, belongs in
  `civicpress-ingest/` with Git LFS, **not** alongside the repos.
- **`civicpress/.system-data/civic.db`** (>10 MB at the time of scan) — this
  is operational state, expected to be in the main repo's runtime data
  area; flagged here only for visibility.
- **`civicpress-ingest/_input/richmond_001/raw/*.pdf`** (3 PDFs > 10 MB) —
  legitimate ingest source PDFs. Module-internal, not a workspace issue.

### Naming inconsistency

- Five named repos use varying conventions:
  - `civicpress/` (no prefix — the main one)
  - `civicpress-broadcast-box/`, `civicpress-ingest/` (prefixed)
  - `site/`, `manifesto/`, `media/` (no prefix, no clear pattern)
- A consistent pattern would be `civicpress-{name}` for all (the main repo
  could remain `civicpress/`), or all unprefixed with the parent dir name
  carrying the namespace. Today's mix means a `cd ~/Work/repos/civicpress/`
  + `ls` doesn't immediately read as "six repos under one project."
- `civicpress-broadcast-box-backup` includes the word "backup" in the
  directory name — good in that it's self-documenting, but it's the only
  repo that telegraphs "I'm provisional."
- `_work_bk/20260125-civicpress-broadcast-box copy` includes a literal
  ` copy` suffix from macOS Finder duplication — a near-certain sign that
  it was duplicated manually, not exported deliberately.

### Missing top-level documentation

**There is no `README.md` at the parent directory level.** A contributor
checking out the workspace cannot tell from a `ls` what the relationships
are between the six repos, which are public, which are local-only, or where
to start. For a manifesto-driven project that says "transparency, inspect-
ability, ease of contribution," the **first file a new contributor sees**
should explain the layout. Recommendation: a small top-level
`/Users/stakabo/Work/repos/civicpress/README.md` (or a `workspace.md`)
listing the six repos, their git remotes, and which are public/private —
ideally checked into a meta-repo or simply maintained by hand.

### Common configs duplicated across repos

Each repo carries its own `.cursor/`, `.claude/`, `.vscode/`, `.gitignore`,
editor configs. Not strictly a problem, but a top-level workspace config
(e.g., a `.editorconfig` and a shared agent-rules file) would reduce drift.
This is a "would-be-nicer" rather than a finding.

### No git remote on three repos

`civicpress-broadcast-box`, `civicpress-broadcast-box-backup`,
`civicpress-ingest` have no `[remote "origin"]` configured. Combined with
the fact that the broadcast-box repo has no LICENSE (BB-HW-002 in the
hardware section), **the flagship hardware module exists only on Mathieu's
laptop**. This is more than a workspace-hygiene point — it's a
manifesto-Resilience and -Trust gap — but it's also a hygiene flag because
the simplest mitigation (push to a GitHub repo) is purely a workspace
action, not a code change.

---

## Findings

| ID | Severity | Description | Lens | Recommended action | Effort (S/M/L) |
|---|---|---|---|---|---|
| workspace-001 | **High** | Personal billing CSV/XLSX (timesheet_2025-*, timesheet_2026-*, civicpress_timesheet_full.csv, civicpress_monthly_summary.csv) stored inside `_work_bk/` adjacent to public repos. Mode 600 protects current state, but a stray `git add` or workspace tarball would leak PII + financial detail. | sensitive content | **RELOCATE** out of repos workspace (e.g., `~/Documents/civicpress-admin/` or encrypted vault). | S |
| workspace-002 | **High** | `_work_bk/__system-data-backup-20250903-160938/` contains `civic.db`, `notification-audit.jsonl`, `org-config.yml`, `roles.yml` — operational state with potential user/email data. Wrong location. | sensitive content | **INVESTIGATE** then delete or move into `civicpress/.system-data/backups/`. | S |
| workspace-003 | High | Three local-only repos with no git remote (`civicpress-broadcast-box`, `civicpress-broadcast-box-backup`, `civicpress-ingest`). Hardware repo + ingest pipeline exist solely on the developer's laptop. Counterproductive to the manifesto's Resilience and Open-source principles. | naming/distribution | **INVESTIGATE** — pick public/private GitHub homes and push. Aligns with `BB-HW-002` LICENSE fix. | M |
| workspace-004 | High | `civicpress-broadcast-box-backup/` (4.3 GB) is a Jan-30 snapshot of an active repo whose latest commit is Feb 3. Its non-gitignored differentiators are likely empty; the gitignored ones (`__main_nuxt/`, `enrollment-qr.png`) are by-design not tracked. Blocks the parent dir from feeling clean. | duplication | **INVESTIGATE** (verify nothing salvageable not in main repo), then **DELETE**. Same review for `_work_bk/20260125-civicpress-broadcast-box copy/` (1.3 GB, even older). | S |
| workspace-005 | High | `_work_bk/` (3.8 GB) is an undifferentiated grab-bag mixing dated work snapshots, a third hardware-repo copy, a system-data backup, a large GeoJSON dataset, two full-repo tarballs, and personal billing data. Single biggest "ambiguous stuff" concentration in the workspace; obscures real cleanup signal. | duplication / waste | **ARCHIVE off-disk + DELETE**: triage each subitem to its rightful home, then remove the folder. ~3.8 GB reclaimed. | M |
| workspace-006 | Medium | `_work_bk/civicpress-backup-20251217-*.tar.gz` (777 MB + 693 MB = 1.4 GB) full-repo tarballs of `civicpress/`. Git already provides this — the main repo is public on GitHub. Redundant. | waste | **DELETE** after verifying git HEAD at that date covers the content. | S |
| workspace-007 | Medium | `_work_bk/_geo_data/` (Quebec municipal SHP/GDB/GeoJSON, ~250 MB) is a real dataset used to seed the Richmond demo town. Living in a folder named "work backup" is the wrong place; loses discoverability for future demo-town setups. | relocate | **RELOCATE** into `civicpress-ingest/data-sources/` (or a new `civicpress-data/` repo) with Git LFS if retained in git. | M |
| workspace-008 | Medium | `_images/` contains `.ai` Illustrator sources for civic icons whose UUID-suffixed PNG exports are already in the running CivicPress storage. The asset sources currently live nowhere documented. | relocate | **RELOCATE** into `media/logos/source/` (or `media/icons/source/`). The `[Recovered]` autosave file can be deleted. | S |
| workspace-009 | Medium | `demo-update-commands.md` is a loose ops runbook (rsync/systemctl/nginx commands for `demo-en/fr.civicpress.io`) at the parent root. Not discoverable from inside any repo. Includes `git pull origin main`, confirming it's meant to live inside the main repo. | relocate | **RELOCATE** into `civicpress/docs/operations/demo-deploy.md` or convert to `civicpress/scripts/deploy-demo.sh`. | S |
| workspace-010 | Medium | No `README.md` at the parent directory level. New contributors cannot tell from `ls` what the six repos are, which are public, or where to start. Manifesto-Transparency / Ease-of-Use gap. | missing docs | **CREATE** top-level `README.md` listing all six repos with one-line purpose + GitHub URL (or "local-only") per repo. | S |
| workspace-011 | Medium | Audit prompt (and likely other places in project docs) describes the workspace as "5 named repos + 1 backup." The on-disk reality is **six repos** — `media/` is the unmentioned sixth. Stale mental model risks drift. | docs accuracy | **DOCUMENT** the six-repo ecosystem in the parent README (workspace-010) and audit prompts. | S |
| workspace-012 | Low | Repo naming is inconsistent: `civicpress`, `civicpress-broadcast-box`, `civicpress-ingest`, `site`, `manifesto`, `media`. Three prefixed, three unprefixed. | naming | **DECIDE** a convention (`civicpress-{name}` for all except the main monorepo, or stay-as-is and document the rationale). Mostly cosmetic. | S |
| workspace-013 | Low | `_work_bk/20260125-civicpress-broadcast-box copy/` directory name contains the literal macOS Finder " copy" suffix — sign of manual Finder-duplication rather than deliberate export. | naming / hygiene | Subsumed by workspace-005 (delete during `_work_bk/` triage). | S |
| workspace-014 | Low | Multiple `.DS_Store` files at parent root and inside `_images/`, `_work_bk/`, `media/`, `manifesto/`, `civicpress-broadcast-box*/`. Inert. | hygiene | **DELETE** + add a user-level macOS plist (`DSDontWriteNetworkStores`) or a workspace-level `.gitignore`. Trivial. | S |
| workspace-015 | Low | `site/dist -> /Users/stakabo/Work/repos/civicpress/site/.output/public` symlink encodes the host's absolute path — breaks under workspace move/clone. | portability | **RELINK** to relative target (`.output/public`). Out of audit scope; one-line `ln` change. | S |

---

## Notes / Open questions

- The audit prompt named "5 named + 1 backup"; this audit finds **6 named + 1 backup + 1 backup-of-backup** (`_work_bk/20260125-civicpress-broadcast-box copy/`). If the user wasn't aware of the third hardware copy, that itself is a finding (workspace-005).
- The "is the backup useful" question for `civicpress-broadcast-box-backup/` depends on whether **the gitignored `__main_nuxt/` reference frontend** in the backup contains anything still in active reference use. It's only 192 KB and the main `.gitignore` line `# Reference/example folders\n__main_nuxt/` suggests it's intentional. A 60-second look at its contents before deletion is warranted; otherwise the backup is purely redundant.
- The `_work_bk/_geo_data/` folder is the most substantive **civic dataset** in the entire workspace — Quebec municipal boundaries, schools, health establishments, postal offices, road network. The manifesto's commitment to civic infrastructure makes this kind of dataset important. It should not be hiding in a folder called "work backup." Whether it ends up in `civicpress-ingest/` or a new `civicpress-data/` repo is a small design call but it should be visible and licensed.
- No actual secrets (`.env`, keys, `id_rsa*`, real `credentials.json`) were found at the parent level. Good.
- The manifesto-staleness pattern (manifesto v1.1 still names Ledger; project roadmap incomplete on broadcast-box) is already covered by *Recommended Next Sessions §4* in the main audit; this section flags only the workspace-level evidence (manifesto repo last substantively touched August 2025).
- Three repos lack a git remote. The manifesto's Trust + Open-source + Resilience principles all point at "must be inspectable from outside this laptop." Worth a deliberate decision: public, private-but-mirrored, or accept the risk.
- One small future-proofing observation, not a finding: a top-level workspace `.editorconfig`, a shared `.cursor/rules` symlink, and a `pre-commit` covering `.DS_Store` would reduce per-repo drift. Out of scope for this audit but easy.
