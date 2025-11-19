# 📦 Backup & Demo Data System – Implementation Plan

## 🎯 Goal

Deliver a unified backup/restore capability that captures CivicPress `data/`
history and storage assets, then reuse those artefacts to distribute optional
demo bundles (e.g., Richmond minutes) during `civic init`.

## 🧭 Guiding Principles

- **Single Source**: Backup format powers both disaster recovery and demo
  sharing.
- **Provenance**: Preserve git history for `data/` and include integrity
  metadata.
- **Modular**: Leave a lightweight offline sample in core; host richer bundles
  externally.
- **Automation Ready**: CLI-first workflow so bundles can be built in CI.

## 🚀 Phases

### Phase 1 – Core Backup CLI (MVP)

- Implement `civic backup create` and `civic backup restore` commands.
- Export `data/` (with git bundle option) + storage assets + manifest/metadata.
- Support archive (`.tar.gz`) and raw directory outputs.
- Add integrity checks (hashes, CivicPress version, timestamp).
- Document manual workflow in `docs/backup-strategy.md`.

### Phase 2 – Demo Bundle Support

- Define bundle registry (YAML/JSON) listing available datasets.
- After the backup pipeline is stable, extend `civic init` to enumerate bundles,
  download/apply backups, or fall back to the baked-in minimal sample set when
  offline.
- Provide `civic backup create --demo` helper to capture metadata (title,
  provenance, licence).
- Publish first official bundle (Richmond) in a dedicated repo with full git
  history.

### Phase 3 – Automation & Governance

- Optional CI script to build bundles on demand (replay import steps, run
  validations, generate archive).
- Support signing/encryption (GPG) for bundles earmarked for production backup.
- Add audit logging to backup/restore commands.
- Expand documentation for municipalities on how to create/share their own
  bundles.

## 📋 Open Questions / Follow-ups

- Do we expose git bundle vs git clone options in the CLI, or just document
  both?
- How do we surface large asset handling guidance (git-lfs vs raw storage
  export)?
- Should we version bundles separately from CivicPress releases?
- Define retention strategy for published bundles (mirrors, CDN, etc.).

## ✅ Immediate Next Steps

1. Finalize backup archive manifest schema.
2. Decide on default storage export format (flat files vs packaged tar with
   metadata JSON).
3. Draft CLI UX (`civic backup create`, `civic init --demo richmond`).
4. Add timestamped subdirectory structure for backups and ensure
   `exports/backups/` is ignored by git.
5. Align with docs/specs updates (already reflected in `specs/backup.md` and
   `backup-strategy.md`).

---

Status: Draft (2025-11-07)
