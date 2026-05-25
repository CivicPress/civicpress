#!/usr/bin/env node
/**
 * Generate docs/licenses.md from `pnpm licenses ls --json`.
 *
 * Phase 2d W4-T3 (deps-011). Run via `pnpm run licenses:gen`.
 *
 * Output structure:
 *   - Generated timestamp + reproduction command
 *   - License summary (count per SPDX id)
 *   - Per-license sorted table of packages (name, version, homepage)
 *
 * If the json is empty or licenses array is the wrong shape, exits non-zero.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.join(repoRoot, 'docs', 'licenses.md');

const raw = execSync('pnpm licenses ls --json', {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});

const data = JSON.parse(raw);
const licenseIds = Object.keys(data).sort((a, b) => a.localeCompare(b));

if (licenseIds.length === 0) {
  console.error('No licenses returned by pnpm licenses ls.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

const lines = [];
lines.push('# Third-Party Dependency Licenses');
lines.push('');
lines.push(`**Generated:** ${today}`);
lines.push('');
lines.push(
  '**Source:** `pnpm licenses ls --json` (regenerate via `pnpm run licenses:gen`).'
);
lines.push('');
lines.push(
  'Covers every npm package resolved into the workspace `node_modules` tree, including transitive dependencies. Dev-only packages are included.'
);
lines.push('');

// Summary
lines.push('## License summary');
lines.push('');
lines.push('| License | Package count |');
lines.push('|---|---|');
for (const lic of licenseIds) {
  // Deduplicate by package name (pnpm reports per-version entries)
  const names = new Set((data[lic] || []).map((p) => p.name));
  lines.push(`| ${lic} | ${names.size} |`);
}
const totalNames = new Set();
for (const lic of licenseIds) {
  for (const p of data[lic] || []) totalNames.add(p.name);
}
lines.push(`| **Total (unique)** | **${totalNames.size}** |`);
lines.push('');

// Per-license tables
lines.push('## Packages by license');
lines.push('');

for (const lic of licenseIds) {
  const entries = data[lic] || [];
  // Group by name → versions
  const byName = new Map();
  for (const p of entries) {
    if (!byName.has(p.name)) byName.set(p.name, { versions: new Set(), homepage: p.homepage });
    byName.get(p.name).versions.add(p.version);
    if (!byName.get(p.name).homepage && p.homepage) {
      byName.get(p.name).homepage = p.homepage;
    }
  }
  const names = [...byName.keys()].sort((a, b) => a.localeCompare(b));
  lines.push(`### ${lic} (${names.length})`);
  lines.push('');
  lines.push('| Package | Version(s) | Homepage |');
  lines.push('|---|---|---|');
  for (const name of names) {
    const info = byName.get(name);
    const versions = [...info.versions].sort().join(', ');
    const home = info.homepage ? `[link](${info.homepage})` : '—';
    lines.push(`| \`${name}\` | ${versions} | ${home} |`);
  }
  lines.push('');
}

fs.writeFileSync(outPath, lines.join('\n'));
console.log(
  `Wrote ${outPath} — ${totalNames.size} unique packages across ${licenseIds.length} license ids.`
);
