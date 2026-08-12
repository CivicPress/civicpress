// One-time bootstrap for a local dev environment. Idempotent: re-running it
// leaves an existing instance untouched. After this, use `pnpm dev`.
//
//   pnpm dev:setup   # build core+cli, create a dev instance, seed demo records
//   pnpm dev         # run the full stack (core watch + api + ui) with hot reload
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

// Local-only throwaway credential — never used off localhost. Documented in
// CONTRIBUTING.md so newcomers know how to log in.
const DEV_ADMIN_PW = 'Dev-Admin-123!';

console.log('› Building core + cli (needed to initialize an instance)…');
run('pnpm --filter @civicpress/core --filter @civicpress/cli run build');

if (existsSync('.civicrc') || existsSync('data/.civic/config.yml')) {
  console.log('✓ A dev instance already exists — leaving it as-is.');
} else {
  console.log('› Creating a dev instance (civic init)…');
  run(
    `node cli/dist/index.js init --yes --admin-user admin --admin-password ${JSON.stringify(
      DEV_ADMIN_PW
    )}`
  );
  console.log('› Seeding curated demo records…');
  run('bash deploy/seed-demo.sh .');
}

console.log('\n✓ Ready.  Run  pnpm dev');
console.log('    API   http://localhost:3000');
console.log('    UI    http://localhost:3030');
console.log(`    Login  admin / ${DEV_ADMIN_PW}\n`);
