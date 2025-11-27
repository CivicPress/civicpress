# ️ CivicPress Spec: `editor-layer.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive editor layer documentation
- editing patterns
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
 'null' dependencies:
 - 'ui.md: >=1.0.0'
 - 'frontend.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`editor-layer` — CivicPress Editor Layer (Visual & Built-in Editors)

## Purpose

Define how CivicPress enables user-friendly editing of civic Markdown records —
starting with a built-in editor and optionally expanding to support visual
Git-based editors like TinaCMS or Decap.

## Scope & Responsibilities

Responsibilities:

- Provide a simple, always-available built-in editor (e.g., TinyMCE or
 SimpleMDE)
- Load and edit `.md` records with frontmatter
- Respect roles and branch policies (enforced by core)
- Allow advanced editors (Tina, Decap, Astro) to be plugged in later

Out of scope:

- Committing directly to `main` (must go through CivicPress Git logic)
- Editors that modify non-civic files (e.g. runtime code)

## Built-in Editor

CivicPress ships with a minimal, open-source Markdown editor (e.g., TinyMCE,
SimpleMDE, or Vue-based component). This allows towns to edit civic records
with:

- Live preview
- YAML frontmatter editing
- Git commit integration

## Pluggable Editor Providers

Optional visual editors like TinaCMS or Decap can be registered via
`editor.config.ts`:

- These tools must respect Git policies (no bypassing core)
- Can be loaded only in dev/staging environments
- Will eventually support role-based UIs and visual builders

## Inputs & Outputs

Input: `.md` files in `/records/`, with optional YAML frontmatter 
Output: Git commits (via CivicPress Core), previews, editor state

## File/Folder Location

```
records/**/*.md
components/MarkdownEditor.vue
editor.config.ts
core/editor-layer.ts
```

## Security & Trust Considerations

- All edits go through Git commit workflow
- PRs must follow CivicPress policy (role-aware, signed if required)
- Editors must not write to disallowed paths

## Testing & Validation

- Use built-in editor to create + commit a bylaw draft
- Confirm commit appears in Git log with correct author and diff
- Ensure visual editor cannot bypass commit rules

## ️ Future Enhancements

- Multiple editor modes (raw, split view, visual only)
- Editor plugin registry
- Structured civic form editing

## History

- Drafted: 2025-07-03
- Last updated: 2025-07-03
