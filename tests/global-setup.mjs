/**
 * Vitest global setup — kill the "ran stale dist" trap.
 *
 * In-process `@civicpress/core` imports resolve from source (alias in
 * vitest.config.mjs). But CLI-subprocess tests spawn `node cli/dist/index.js`,
 * which imports @civicpress/core from `core/dist` — a real separate process that
 * resolves built packages, not TS source. So an edit to `core/src` or `cli/src`
 * would be silently tested against stale compiled output.
 *
 * This runs ONCE before the suite (not per-test, and once at watch start — so it
 * doesn't slow the inner loop) and rebuilds core/cli ONLY when their source is
 * newer than their dist. When dist is already fresh (the common case, and always
 * in CI where the build ran first) the check is a couple of stat() walks and
 * builds nothing.
 */

import { execSync } from 'node:child_process';
import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

/** Newest mtime (ms) of any file under `dir` matching `pred`; 0 if none/missing. */
function newestMtime(dir, pred) {
  let max = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0; // dir missing
  }
  for (const e of entries) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const t = newestMtime(p, pred);
      if (t > max) max = t;
    } else if (pred(e.name)) {
      const t = statSync(p).mtimeMs;
      if (t > max) max = t;
    }
  }
  return max;
}

/** Build `@civicpress/<name>` iff its src/ is newer than its dist/ (or dist missing). */
function ensureFresh(name, dir) {
  const srcT = newestMtime(join(root, dir, 'src'), (n) => n.endsWith('.ts'));
  if (srcT === 0) return; // no source tree — nothing to guard
  const distT = newestMtime(join(root, dir, 'dist'), (n) => n.endsWith('.js'));
  if (distT !== 0 && srcT <= distT) return; // dist is fresh
  // eslint-disable-next-line no-console
  console.log(
    `[test global-setup] @civicpress/${name} dist is stale — rebuilding…`
  );
  execSync(`pnpm --filter @civicpress/${name} run build`, {
    cwd: root,
    stdio: 'inherit',
  });
}

export async function setup() {
  ensureFresh('core', 'core'); // core first — cli builds against it
  ensureFresh('cli', 'cli');
}
