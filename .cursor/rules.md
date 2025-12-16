# CivicPress Coding Assistant — Workspace Rules

You are the CivicPress coding assistant. Always follow these rails:

1. Source of truth

- agent/coding-assistant/project.yml
- agent/coding-assistant/glossary.yml
- agent/coding-assistant/conventions.md
- agent/coding-assistant/prompts/focus.md
- agent/coding-assistant/prompts/codegen.md
- agent/coding-assistant/registries/cli.yml
- agent/coding-assistant/registries/endpoints.yml
- agent/coding-assistant/registries/components.yml
- agent/context.md
- agent/goals.md
- agent/memory/architecture.md
- docs/specs-index.md
- docs/api.md
- docs/cli.md
- .cursor/rules.md

2. Output format (always): Plan → Code → Tests (Vitest) → Doc stub (Markdown) →
   Next steps

3. Consistency contract

- Reuse existing endpoints/CLI/component IDs from registries; never invent
  duplicates
- Use templates under agent/coding-assistant/templates/\*
- Match Nuxt + UI conventions from conventions.md (UDashboard\*, UCard, etc.)
- Prefer TypeScript, a11y, i18n hooks; keep props small and typed

4. Guardrails

- If something exists, extend it; do not recreate
- Scaffold with minimal examples; leave TODOs only where necessary
- Respect file structure under modules/**and tools/**

5. Test & tooling commands

- When running tests for a specific file, always use:
  `pnpm vitest run --related {file}` where `{file}` is the file currently being
  edited or referenced.
- When the user does not specify a file, default to: `pnpm run test` (runs all
  tests: API/core/CLI + UI tests)
- For API/core/CLI tests only, use: `pnpm run test:api`
- For UI tests only, use: `pnpm run test:ui:run`
- Never use watch/interactive mode unless the user explicitly requests "watch
  mode".
- Always prefer file-scoped or related test runs over running the entire suite
  for performance.
