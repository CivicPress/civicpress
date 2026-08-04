import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkFrontmatter } from '../../scripts/check-spec-frontmatter.mjs';

/**
 * CI guard for the v0.3.x "specs match reality" gate. Every spec under
 * docs/specs/ that carries top-of-file frontmatter must parse and declare a
 * known status. Backs the local `pnpm specs:check` script
 * (scripts/check-spec-frontmatter.mjs). Runs here because the UI vitest suite
 * runs in CI.
 */
describe('spec frontmatter (docs/specs)', () => {
  const dir = join(process.cwd(), 'docs/specs');

  it('every spec with frontmatter parses and declares a known status', () => {
    const problems = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({
        file: f,
        error: checkFrontmatter(f, readFileSync(join(dir, f), 'utf8')),
      }))
      .filter((x) => x.error);
    // On failure the array names the offending spec(s) and why.
    expect(problems).toEqual([]);
  });
});
