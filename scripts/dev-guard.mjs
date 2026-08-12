// Preflight for `pnpm dev`: make sure there's something to run against.
// Gated via `&&` in the dev script (pnpm pre/post scripts aren't enabled here),
// so a missing instance fails fast with a clear next step instead of a cryptic
// crash from the API or a blank UI.
import { existsSync } from 'node:fs';

const missing = [];
if (!existsSync('.civicrc') && !existsSync('data/.civic/config.yml')) {
  missing.push('a dev instance');
}
if (!existsSync('core/dist/index.js')) {
  missing.push('a core build');
}

if (missing.length > 0) {
  console.error(`\n  ⚠  CivicPress dev needs ${missing.join(' and ')}.`);
  console.error(
    '     Run  pnpm dev:setup  once to create it, then  pnpm dev.\n'
  );
  process.exit(1);
}
