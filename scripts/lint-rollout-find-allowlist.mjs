#!/usr/bin/env node
// Enumerate production `: any` / `as any` sites for the L4 annotation pass.
// Writes JSON to stdout: [{ file, line, type, snippet }].
// Excludes __tests__/** and *.test.ts (those are handled by L5 warn-tier override).

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
