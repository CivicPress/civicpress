// Validate docs/specs/*.md frontmatter.
//
// A spec need not have frontmatter (README and historical dated design docs use
// other conventions), but any top-of-file frontmatter present MUST parse as YAML
// and — if it declares `status` — declare a KNOWN status. This is the machine
// side of the v0.3.x "specs match reality" gate: it keeps the status tags honest
// and prevents a relapse into the jammed single-line metadata that used to sit
// after the title.
//
// Exports `checkFrontmatter` (pure) for the vitest gate
// (tests/ui/spec-frontmatter.test.ts); run directly for a local report:
//   node scripts/check-spec-frontmatter.mjs   (or: pnpm specs:check)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export const VALID_STATUS = new Set([
  'stable',
  'partial',
  'planned',
  'draft',
  'design',
  'implemented',
  'as-shipped',
  'pending',
]);

/**
 * Returns null if OK, else an error string. No frontmatter → OK. Frontmatter
 * present → it must parse, and a declared `status`'s first token (so
 * `design (draft)` is fine) must be a known value.
 */
export function checkFrontmatter(name, content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  let data;
  try {
    data = yaml.load(m[1]);
  } catch (e) {
    return `frontmatter does not parse: ${String(e.message).split('\n')[0]}`;
  }
  if (data && data.status !== undefined) {
    const token = String(data.status).trim().split(/[\s(]/)[0];
    if (!VALID_STATUS.has(token)) {
      return `unknown status '${data.status}' (token '${token}')`;
    }
  }
  return null;
}

/** Check every `*.md` under `dir`; returns an array of {file, error}. */
export function checkSpecsDir(dir) {
  const problems = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const err = checkFrontmatter(f, readFileSync(join(dir, f), 'utf8'));
    if (err) problems.push({ file: f, error: err });
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkSpecsDir('docs/specs');
  if (problems.length === 0) {
    console.log('spec-frontmatter OK — all frontmatter parses with a known status.');
    process.exit(0);
  }
  for (const p of problems) console.error(`  ${p.file}: ${p.error}`);
  console.error(`\nspec-frontmatter check FAILED (${problems.length}).`);
  process.exit(1);
}
