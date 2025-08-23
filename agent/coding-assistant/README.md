# CivicPress Coding Assistant (Repo-Scoped)

This folder is the **project brain** for our developer-only AI coding assistant.
It defines scope, rules, templates, and registries so outputs are consistent
across sessions and contributors.

## What lives here

- `project.yml` — purpose, non‑negotiables, defaults
- `glossary.yml` — canonical terms, naming, commit conventions
- `conventions.md` — code style, Nuxt layout, testing, a11y/i18n rules
- `prompts/` — system prompts the assistant must follow (focus + codegen
  contract)
- `templates/` — scaffolding blueprints (Nuxt/CLI/tests/docs)
- `registries/` — lists of existing endpoints/CLI/components to prevent
  duplicates
- `decisions/` — ADRs (Architecture Decision Records) for dev choices
- `retrieval.config.json` — which paths the assistant indexes for context

## Important

- No secrets. Treat this directory as versioned, reviewable guidance.
- The assistant must use the templates and consult the registries before
  creating anything new.
- CI and pre-commit hooks enforce these rules (format, lint, tests, registry
  checks).

**Audience** Developers only. The clerk-facing civic assistant will live
separately (e.g., `agents/civic-assistant/`).
