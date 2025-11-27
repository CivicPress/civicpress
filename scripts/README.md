# CivicPress Helper Scripts

This directory contains standalone maintenance scripts that support common
operational tasks. None of these are wired into the CLI; run them manually from
the project root (the CivicPress repository) with Node.

## Available Scripts

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

- `migrate-geography-to-markdown.mjs`  
  **One-time migration script** - Converts existing geography files (.geojson,
  .kml, .gpx) to the new markdown format with YAML frontmatter. This script was
  used during the geography system migration and is kept for reference. Run with
  `--dry-run` to preview changes.

- `update-geography-colors.mjs`  
  Utility script to add color mapping configuration to geography files. Extracts
  unique property values from GeoJSON features and assigns default colors.
  Usage: `node scripts/update-geography-colors.mjs <path-to-geography-file.md>`

## Usage

```bash
# Run a helper script
node scripts/normalize-notifications.mjs
```

When a script reads or writes `.system-data/` make sure the API and other
processes are stopped to avoid conflicting access.
