# Audit Section: civicpress-ingest

**Date:** 2026-05-17
**Auditor:** main agent (two parallel-agent retries failed via watchdog stall)
**Depth:** moderate

## At-a-Glance

| | |
|---|---|
| Path | `/Users/stakabo/Work/repos/civicpress/civicpress-ingest/` (sibling repo) |
| Purpose | Crawl + extract + OCR + clean + format pipeline that turns municipal records (PDFs/HTML/scanned minutes) into CivicPress-shaped Markdown records |
| Claimed status | `pyproject.toml` `version = "0.1.0"`; README describes it as the live "Working Recipe" for Richmond ingestion |
| Last commit | **2025-11-11** ("Ignore backups directory") — ~6 months stale at audit time (2026-05-17), **predates the broadcast-box flagship pivot** |
| Test files | 1 informal helper (`scripts/test_ocr.py`). No real test suite. |
| ~LoC | Python: `src/cp_ingest/cli.py` is **3,927 LoC** in a single file (the entire CLI surface). Plus dashboard (Nuxt 4) |
| Key deps | `requests`, `beautifulsoup4`, `lxml`, `pdfminer.six`, `pdfplumber`, `trafilatura`, `pytesseract` (Tesseract OCR), `Pillow`, `PyMuPDF`, `python-slugify`, `pyyaml`. Dashboard: `nuxt ^4.1.2` + `@nuxt/ui ^4.0.0` (FREE, not Pro) |
| Git remote | **None.** `git remote -v` returns empty. Cross-ref `workspace-cleanup.md` finding workspace-003. |

## Manifesto Fit

| Principle / Constraint | Verdict | Evidence |
|---|---|---|
| Transparency | PASS | Pipeline output includes `source` frontmatter block (`cli.py:3482-3488`) with `imported_at`, presumably URL + parser version. Records carry provenance. |
| Trust | CONCERN | No real test coverage (1 informal OCR helper); OCR + heuristic cleanup is the kind of correctness-critical work that needs a regression suite. Last commit ~6 months ago and predates the broadcast-box flagship pivot; pipeline may have drifted from current `record-format-standard.md`. |
| Open-source | PASS | MIT license (`LICENSE`). All Python deps are OSS. Free `@nuxt/ui` v4 for the dashboard (not the paid Pro variant the main UI module uses). |
| Public Good | PASS | The stated mission is civic-aligned: import municipal records (bylaws, minutes) into a public, inspectable platform. Configs exist for Richmond, QC — matching the monorepo's demo town. |
| Ease of Use | CONCERN | README points to a "Working Recipe" doc but doesn't quote it; setup says "Install dependencies (virtualenv or Poetry) and run `pip install -e .`" — three install paths in one sentence. Adding a new municipality means hand-writing `configs/cleanup.<town>.NNN.yml` + `configs/municipality.<town>.NNN.yml` (only Richmond exists today; no template config). |
| Equity | PASS | OCR pipeline + heuristic cleanup is exactly what gives small towns without digital records a path in. Tesseract OCR is free and offline-capable. |
| **HARD: No vendor lock-in** | PASS | All deps OSS; no paid OCR (no Google Vision / Azure Read), no proprietary PDF lib; Tesseract is offline. Dashboard on free `@nuxt/ui` (contrast monorepo's UI module). |
| **HARD: Markdown as civic format** | **PASS** | The pipeline output is **Markdown + YAML frontmatter** (`cli.py:3314`: `md = f"---\n{front}\n---\n\n# {fm['title']}\n\n{body}\n"`), built to `record-format-standard.md v1.2.0` (`cli.py:3422`). This is the cleanest manifesto fit in the entire ecosystem — the pipeline whose job it is to *make* Markdown civic records actually makes them. |
| **HARD: Resilient archival** | PASS | Pipeline is offline-capable once dependencies are installed. Outputs live in `_output/` (git-ignored at runtime). No cloud roundtrip required. |

## Technical Quality

The repo is a serious Python project with a clear pipeline shape: `cp-crawl` → `cp-categorize` → `cp-extract` → `cp-cleanup` → `cp-format` → `cp-finalize` → `cp-report`. Each command is a thin entry-point in `__init__.py` that delegates to a `_crawl`/`_categorize`/etc. function defined in `cli.py`. The output flows through `_input/` → `_work/` → `_output/` directories (all git-ignored except `.gitkeep`). The README references a `docs/working-recipe.md` as the canonical workflow and a `docs/record-format-standard.md` as the output spec — both are documented in-repo.

The **biggest technical issue** is that `src/cp_ingest/cli.py` is **3,927 lines in a single file**. It carries the implementation of all 7 subcommands plus their helpers (extraction, OCR, page-number cleanup, frontmatter building, multi-frontmatter rendering, finalization). The function-density grep shows ~20+ public functions in this one file with no clear module boundaries. The "Working Recipe" doc supposedly explains the end-to-end flow, but anyone modifying the cleanup rules for a new municipality has to read 4,000 lines to find the right place. This is the classic AI-coded single-file pattern — accreted by repeated "add a cleanup rule for X" prompts without a refactor pass.

The **lack of a real test suite** is the second-biggest concern. The only Python "test" is `scripts/test_ocr.py` — a manual helper script, not a Pytest suite. Pipeline correctness for OCR + heuristic cleanup is precisely the kind of code that ages badly without regression tests: every new municipality's edge cases (capital-letter title rules, ordinals, page-numbering quirks) could silently break Richmond's existing rules. No CI is wired (`workspace-cleanup.md` finding noted no `.github/workflows/`). 

Configs structure: `configs/cleanup.richmond.003.yml`, `configs/cleanup.richmond.bylaw.001.yml`, `configs/cleanup.richmond.zonage.001.yml`, `configs/municipality.richmond.010.yml`. Versioning convention is `<scope>.<municipality>.<NNN>.yml` where the README says `.010` / `.003` are "production-ready". A `_archive/` exists inside `configs/`. The pattern is reasonable; only Richmond is exercised so far. There is **no template config** for a contributor wanting to add a new municipality.

## Security (LIGHT)

The ingest pipeline is read-mostly: it crawls public municipal websites, downloads PDFs, runs OCR, and writes Markdown locally. Attack surfaces:

- **Untrusted PDF input.** `pdfminer.six`, `pdfplumber`, `PyMuPDF`, `lxml`, `beautifulsoup4` all parse adversarial input from municipal websites (some of which are years-old PHP). Known historical CVEs in these libraries (especially `lxml`, `Pillow`) — should be tracked. The dep versions are reasonably current (`lxml>=5.2`, `Pillow>=10.0.0`) but pinning is permissive (`>=`); a `pip-audit` or `pip install --upgrade --dry-run` pass would surface specific advisories.
- **OCR side-channel.** `pytesseract` shells out to the system `tesseract` binary; if the system Tesseract is patched-old, OCR-targeted exploits against the binary apply. Out of scope for this audit, but worth flagging for any deployment.
- **No HTTPS/cert pinning.** `requests` defaults are used. For crawling government websites that may run on old TLS, defensible; for the manifesto's resilience claim, fine.
- **Local-only file I/O.** No outbound POST to cloud services. Everything stays in `_input/_work/_output/`. Manifesto-aligned.
- **Dashboard auth.** The Nuxt 4 dashboard is for "manual review and corrections" — needs a quick auth check (this audit didn't run it). If it writes back to the source records, it's a privileged surface.

No `.env` / credential files were found in this repo by the workspace-cleanup audit. Confirmed clean.

## AI-Generation Smells

- **Single 3,927-line `cli.py`** — the strongest AI signature. New rules / new commands get appended rather than refactored. Looking at line numbers: categorizer helpers ~191, formatter helpers ~489, cleanup helpers ~657, fix-numbering ~781, separator-line logic ~1964 *and* ~2026 (looks like two near-identical helpers), `build_final_frontmatter` defined inside `_finalize` at line 3421 (nested function in a god-file).
- **`temp_*.txt` files at repo root** — `temp_TOC.txt`, `temp_TOC.txt.bak`, `temp_degree_diff.txt`, `temp_multiline_titles_caps.txt`, `temp_multiline_titles_report.txt`, `temp_ordinals_before.txt`. Leftover scratch from interactive debugging sessions; should be `.gitignore`d or moved to `_work/`. Indicates iterative-with-AI shape rather than principled refactor.
- **Two `_archive` directories** — `configs/_archive` plus the `_archive` referenced in cleanup-rule paths. Suggests rules were written, replaced, but originals were preserved "just in case." Healthy if intentional; smells if accreted.
- **`build_frontmatter` (line 497) AND `build_final_frontmatter` (nested, line 3421)** with similar shapes — likely a parallel codepath that should be unified.
- **README install instructions** — "Install dependencies (virtualenv or Poetry) and run `pip install -e .`" — three competing install paths in one sentence. A real README would pick one.

## Architecture

The pipeline architecture is **correct in shape** — a sequence of pure-ish CLI commands with file-based handoff (`_input` → `_work` → `_output`). This is the right design for an OCR + cleanup pipeline: each step is independently re-runnable, the intermediates are inspectable, and the final output is a Markdown record that the monorepo can consume directly. The relationship to the monorepo is **batch-import via Markdown** — the right boundary.

Integration with the monorepo is **implicit, not explicit**: there is no `civicpress-ingest` mention in `civicpress/docs/architecture.md` and no documented hand-off contract beyond "we produce Markdown to `record-format-standard.md v1.2.0`." The monorepo's `RecordParser` (per the main audit's core section) is the consumer. If the format standard drifts, the pipeline silently produces records the monorepo rejects on import — and there is no schema-validation test in either direction. The `docs/record-format-standard.md` files in both repos should be checked for divergence.

The dashboard (Nuxt 4 + `@nuxt/ui` v4 free) is a small companion app for "manual review and corrections" — appropriate scope. Its tech stack is **distinct from the monorepo's UI** (which uses paid `@nuxt/ui-pro ^3.3.7`), so it's manifesto-cleaner. There is no shared component layer between the two Nuxt apps; not a problem for a small dashboard but a near-duplication if it grows.

The repository **does not have a git remote** (`git remote -v` returns empty) — cross-reference `workspace-cleanup.md` finding workspace-003. The flagship's adjacent data pipeline exists **only on the user's laptop**.

## Roadmap Alignment

This repository is **not mentioned** in `docs/roadmap.md` or `docs/project-status.md`. The monorepo audit found the same pattern for broadcast-box and broadcast-box-hardware (they don't appear in the roadmap either). civicpress-ingest is one of the **3 of 5 ecosystem repos invisible to the project's public roadmap** — a Transparency-principle gap.

The roadmap §6 "v0.5–0.8 — Municipal Pilot Readiness" lists "Build a migration/import tool for bylaws and minutes" as a deliverable. **That tool is `civicpress-ingest`** — it already exists, has been used on Richmond, and is the working migration/import path. Either the roadmap is unaware of it, or this is a third repo whose work has been done outside the roadmap's accounting.

The 6-month staleness (last commit 2025-11-11) is notable in context: between that commit and now (2026-05-17), the broadcast-box flagship pivot happened, the monorepo shipped realtime + broadcast-box, the `record-format-standard` evolved to v1.2.0 in the monorepo (`cli.py:3422` references it). It is plausible the ingest pipeline has drifted from the current standard and no one has noticed.

## Findings

| ID | Severity | Description | Lens | Manifesto principle | Roadmap impact | Effort (S/M/L) |
|---|---|---|---|---|---|---|
| ingest-001 | **High** | Repo has **no git remote** — only exists on this laptop. Cross-ref `workspace-003`. The project's working migration/import pipeline for civic records is unbackedup beyond local git. | architecture, security | Trust, Resilient archival | Blocks v0.5–0.8 pilot (no way to share the pipeline). | S |
| ingest-002 | **High** | Repo is **invisible in `docs/roadmap.md`** and `docs/project-status.md`. v0.5–0.8 roadmap names "migration/import tool for bylaws and minutes" — but this *is* the tool and the roadmap doesn't know. Same Transparency pattern as broadcast-box. | roadmap, manifesto | Transparency | Roadmap clarity | S |
| ingest-003 | **High** | Last commit `834b151` is **2025-11-11**, ~6 months stale at audit date. Predates the broadcast-box flagship pivot, the realtime module, several rounds of `record-format-standard.md` changes in the monorepo. The pipeline may be silently producing records that the current monorepo rejects on import. | tech, manifesto | Trust | Threatens v0.5–0.8 pilot (silent-format-drift risk) | M (manual cross-repo schema diff + small fixes) |
| ingest-004 | High | **No real test suite.** Only `scripts/test_ocr.py` (1 informal helper). For an OCR + heuristic-cleanup pipeline with municipality-specific cleanup rules, the absence of regression tests means each new municipality's rules can silently break Richmond's. No CI. | tech | Trust | Threatens v0.5–0.8 multi-municipality scaling | M (initial test harness + Richmond regression cases) |
| ingest-005 | Medium | `src/cp_ingest/cli.py` is **3,927 lines in a single file**, holding all 7 commands plus extraction/OCR/cleanup/format/finalize helpers plus nested helper functions (`build_final_frontmatter` is nested inside `_finalize` at line 3421). Will fragment unmaintainably as municipalities add. | ai-smell, tech | Ease of Use (contributors) | Cleanup; will compound during v0.5–0.8 | M (split into modules) |
| ingest-006 | Medium | **No template config for adding a new municipality.** Only Richmond configs exist (`configs/cleanup.richmond.*.yml`, `configs/municipality.richmond.010.yml`). A contributor wanting to add another town has no template to start from. | tech, manifesto | Ease of Use (contributors), Public Good | Blocks v0.5–0.8 pilot expansion | S (add `configs/template.<town>.yml`) |
| ingest-007 | Medium | `build_frontmatter` (line 497) and the nested `build_final_frontmatter` (line 3421 inside `_finalize`) coexist with similar shapes. Likely a parallel codepath that should be unified to one frontmatter builder. | ai-smell, tech | Trust | Pre-pilot cleanup | S |
| ingest-008 | Low | **README mixes three install paths** ("virtualenv or Poetry" plus `pip install -e .`) in one sentence. A real README would pick one and document a single happy path. | tech, manifesto | Ease of Use | Onboarding friction | S |
| ingest-009 | Low | Several `temp_*.txt` files committed at repo root (`temp_TOC.txt`, `temp_TOC.txt.bak`, `temp_degree_diff.txt`, `temp_multiline_titles_caps.txt`, `temp_multiline_titles_report.txt`, `temp_ordinals_before.txt`). Leftover debugging scratch; should be `.gitignore`d or moved to `_work/`. | ai-smell, tech | (cleanup) | None | S |
| ingest-010 | Low | Dashboard is a second Nuxt 4 app distinct from the monorepo's UI module — different (better) UI dep stack (`@nuxt/ui` v4 free vs paid Pro v3 in the monorepo). Not a problem at this scale, but a near-duplication if either grows. | architecture | (no manifesto principle) | Consolidation candidate later | M (later) |

## Notes / Open questions

- The civic-purpose alignment of this repo is the **highest of any repo audited so far** — its job is to take messy real-world municipal records and emit clean, Markdown-frontmatter-formatted civic records that the monorepo can consume. That is exactly the manifesto's "Markdown as civic format" hard constraint in action. The pipeline architecture (CLI sequence + file-based handoff + per-municipality configs) is the right shape.
- The 6-month staleness is more about visibility than abandonment: the pipeline likely still works for Richmond, but no one is checking it against the monorepo's evolving record format. A **single cross-repo schema-diff pass** (compare `civicpress-ingest/docs/record-format-standard.md` against `civicpress/docs/specs/...` or wherever the canonical format lives now) would close ingest-003.
- The "Working Recipe" doc (`docs/working-recipe.md`) is referenced but not inspected here — it likely contains the operational knowledge that should be the contributor onboarding entry-point.
- Recommended for the Phase-3 next-session list: a small **"ingest pipeline contract test"** — given a known PDF input, the pipeline must produce a Markdown record that the monorepo's `RecordValidator` accepts. Tied to ingest-003 + ingest-004. ~1 day of work.
- This pipeline is also the **best place** in the ecosystem to attack the broadcast-box civic-artifact gap (main audit broadcast-box-002): a Python tool that already knows how to produce Markdown civic records is well-positioned to also produce civic-record scaffolds from broadcast-box recording metadata. Worth flagging for the broadcast-box deep-refactor session.
- One audit-process note: this section was written by the main agent after **two parallel-agent dispatches stalled at the "now write the section" stage**. The retries failed via watchdog kill (600s no-progress). Workaround used: main agent did the recon + writing directly. Recommend re-evaluating the parallel-agent dispatch pattern for repos with very large single files (the 3,927-line `cli.py` may have been what tipped the agent over). Future ingest-style targets: instruct the agent to read the README + entry point only, not the full CLI file.
