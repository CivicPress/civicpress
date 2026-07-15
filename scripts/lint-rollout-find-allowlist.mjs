#!/usr/bin/env node
// Enumerate production `: any` / `as any` sites for the L4 annotation pass.
// Writes JSON to stdout: [{ file, line, type, snippet }].
// Excludes __tests__/** and *.test.ts (those are handled by L5 warn-tier override).
//
// ⚠️  KNOWN LIMITATIONS — DO NOT REUSE WITHOUT REWORK:
// - Substring grep misses `ref<any>`, `Array<any>`, `Record<X, any>`, `<T = any>`,
//   and similar generic-position patterns. During the 2026-05-28 lint-rule rollout,
//   L5 surfaced 321 additional production cast sites this finder missed (a ~4x
//   undercount vs. the 86-site manifest). For future audits use an AST-based
//   finder (e.g. ts-morph) rather than line-grep.
// - Pattern matches lines that mention `as any` in comments or strings as well as
//   real casts. The companion annotate script must filter comment-only lines.

import { execSync } from 'node:child_process';

const ROOTS = [
  'core/src',
  'modules/api/src',
  'modules/ui/app',
  'modules/storage/src',
];

const out = [];
for (const root of ROOTS) {
  let raw = '';
  try {
    raw = execSync(
      `grep -rnE '(\\bas any\\b|: any\\b)' ${root} --include='*.ts' --include='*.vue' || true`,
      { encoding: 'utf8' }
    );
  } catch {
    /* grep exits 1 when no matches — treat as empty */
  }
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const m = line.match(/^([^:]+):(\d+):(.*)$/);
    if (!m) continue;
    const [, file, ln, snippet] = m;
    if (file.includes('__tests__/') || file.endsWith('.test.ts') || file.endsWith('.spec.ts')) continue;
    const type = /\bas any\b/.test(snippet) ? 'as-any' : 'colon-any';
    out.push({ file, line: Number(ln), type, snippet: snippet.trim() });
  }
}
process.stdout.write(JSON.stringify(out, null, 2));
