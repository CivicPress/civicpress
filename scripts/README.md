# CivicPress Helper Scripts

This directory contains standalone maintenance scripts that support common
operational tasks. None of these are wired into the CLI; run them manually from
the project root (the CivicPress repository) with Node.

## Available Scripts

- `backfill-session-attachments.mjs`  
  Scan session markdown records for embedded storage file URLs, look up the
  referenced files, and populate each record’s `attached_files` frontmatter
  array. Inline markdown links are left intact.

- `normalize-notifications.mjs`  
  Merge `.system-data/notifications.yml` with the default schema so every entry
  has the expected metadata, backing up the current file before rewriting it.

- `registry-check.mjs`  
  Ensure there are no duplicate IDs across the coding-assistant registries
  (`agent/coding-assistant/registries/*.yml`). Fails if duplicates are found.

- `spec-check-deps.mjs`  
  Verify that every spec linked from `docs/specs-index.md` exists on disk.

- `spec-list.mjs`  
  List all specs under `docs/specs/` along with the status line extracted from
  each file.

- `spec-validate.mjs`  
  Basic lint for spec files—checks that each markdown document has a top-level
  heading and a `Status:` field.

## Usage

```bash
# Run a helper script
node scripts/backfill-session-attachments.mjs
```

When a script reads or writes `.system-data/` make sure the API and other
processes are stopped to avoid conflicting access.
