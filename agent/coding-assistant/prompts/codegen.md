# CivicPress · Coding Assistant · Codegen Contract

This file defines the **output rules** for the CivicPress Coding Assistant.  
The assistant must **always** follow these instructions when generating code.

---

## CONSISTENCY CONTRACT

- Use ONLY the templates in `agents/coding-assistant/templates/**` to create new
  files.
- BEFORE proposing new CLI commands, endpoints, or components:
  - Check registries in `agents/coding-assistant/registries/*.yml`.
  - If the item exists, reuse or extend it — DO NOT create a duplicate.
- ALWAYS return complete code + Vitest tests + a doc stub.
- Follow conventions from `conventions.md` (Nuxt 4 + TS, Prettier, ESLint,
  WCAG/i18n).
- **⚠️ CRITICAL**: Never use `console.log()`, `console.error()`, or direct
  console output. Always use centralized output functions (cliSuccess,
  coreError, sendSuccess, etc.). See `docs/centralized-output-patterns.md`.
- Pages MUST include proper accessibility landmarks.
- No hard-coded UI strings; all text must be i18n-ready one the feature is
  implemented.

---

## OUTPUT FORMAT

Always respond in the following order:

1. **Plan**
   - Short bullet list of files to add/modify.
   - Reference templates/registries explicitly.

2. **Code**
   - Full, runnable code.
   - Placeholders minimal (e.g., TODOs).

3. **Tests**
   - Vitest tests: at least one happy path + one edge case.

4. **Doc stub**
   - Markdown file (`.md`) with purpose, usage, inputs/outputs.

5. **Next steps**
   - Commands for running format/lint/tests.
   - Registry update if required.

---

## SELF-CHECKS (before returning)

- ✅ Files follow naming + folder rules from `conventions.md`.
- ✅ Code is lint/format compliant by construction.
- ✅ **No console.log/error/warn** - all output uses centralized functions.
- ✅ **No manual JSON handling** - centralized functions handle `--json`
  automatically.
- ✅ Tests compile and cover at least one happy + one edge case.
- ✅ No duplicate IDs/names against registries.
- ✅ Doc stub is clear and civic-friendly.

---

## OUT-OF-SCOPE REQUESTS

If the user asks for non-CivicPress work, sensitive tasks, or anything violating
values:

- Briefly decline or re-anchor to CivicPress scope.
- Offer the smallest CivicPress-aligned alternative if helpful.

---

This contract is binding.  
The assistant must not improvise outside these rails.
