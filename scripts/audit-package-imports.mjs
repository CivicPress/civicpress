#!/usr/bin/env node
/**
 * Audit per-workspace import declarations.
 *
 * Phase 2d W4-T2 — for every workspace (cli, core, modules/api, modules/ui,
 * modules/schema-extensions/legal, modules/storage), grep all source files
 * for `import ... from '<pkg>'` and `import('<pkg>')` and check that every
 * bare-spec'd package is declared in that workspace's `package.json`
 * (dependencies / devDependencies / peerDependencies / optionalDependencies).
 *
 * Why: the repo currently sets `shamefully-hoist=true` in .npmrc, so undeclared
 * imports resolve via the hoisted node_modules. That hides which workspace
 * actually depends on what. This script makes the gaps explicit.
 *
 * Usage:
 *   node scripts/audit-package-imports.mjs
 *
 * Exit code 0 if all imports are declared; 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const WORKSPACES = [
  { name: 'cli', root: 'cli', src: ['src'] },
  { name: 'core', root: 'core', src: ['src'] },
  { name: 'modules/api', root: 'modules/api', src: ['src'] },
  { name: 'modules/ui', root: 'modules/ui', src: ['app'] },
  { name: 'modules/storage', root: 'modules/storage', src: ['src'] },
  {
    name: 'modules/schema-extensions/legal',
    root: 'modules/schema-extensions/legal',
    src: ['src'],
  },
];

const SOURCE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.vue',
]);

// Node built-ins (extended) — never need to be declared in package.json
const BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module',
  'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls',
  'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads',
  'zlib',
]);

function isBuiltin(spec) {
  if (spec.startsWith('node:')) return true;
  return BUILTINS.has(spec.split('/')[0]);
}

function isRelative(spec) {
  return spec.startsWith('.') || spec.startsWith('/');
}

function isAlias(spec) {
  // Nuxt + TS path aliases — not npm packages
  return spec.startsWith('~') || spec.startsWith('@/') || spec.startsWith('#');
}

function getBaseSpec(spec) {
  if (spec.startsWith('@')) {
    // scoped: @scope/pkg or @scope/pkg/subpath
    const parts = spec.split('/');
    return parts.slice(0, 2).join('/');
  }
  return spec.split('/')[0];
}

function collectSourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.nuxt' || entry.name === '.output') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const IMPORT_RE = /(?:^|[^.\w])(?:import\s+(?:[\s\S]+?)\s+from\s+|import\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/gm;

function stripComments(content) {
  // Strip /* ... */ blocks and // line comments. Approximate but good enough
  // to skip JSDoc examples that quote package names.
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

function extractSpecs(content) {
  const specs = new Set();
  const cleaned = stripComments(content);
  let m;
  while ((m = IMPORT_RE.exec(cleaned)) !== null) {
    specs.add(m[1]);
  }
  return specs;
}

function loadPkg(wsRoot) {
  const pkgPath = path.join(repoRoot, wsRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ]);
  return { pkg, declared, pkgPath };
}

let allClean = true;
const summary = [];

for (const ws of WORKSPACES) {
  const { declared, pkgPath } = loadPkg(ws.root);
  const seen = new Set();
  for (const srcDir of ws.src) {
    const files = collectSourceFiles(path.join(repoRoot, ws.root, srcDir));
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const spec of extractSpecs(content)) {
        if (isBuiltin(spec) || isRelative(spec) || isAlias(spec)) continue;
        const base = getBaseSpec(spec);
        seen.add(base);
      }
    }
  }
  const missing = [...seen].filter((s) => !declared.has(s)).sort();
  const unused = [...declared].filter((s) => !seen.has(s)).sort();
  summary.push({ ws: ws.name, missing, unused, pkgPath });
  if (missing.length > 0) allClean = false;
}

console.log('# Per-workspace import-declaration audit\n');
for (const s of summary) {
  console.log(`## ${s.ws}`);
  if (s.missing.length === 0) {
    console.log('  ✓ All imports declared.');
  } else {
    console.log(`  ✗ Missing declarations (${s.missing.length}):`);
    for (const m of s.missing) console.log(`    - ${m}`);
  }
  if (s.unused.length > 0) {
    console.log(`  ⚠ Declared but unimported (${s.unused.length}):`);
    for (const u of s.unused) console.log(`    - ${u}`);
  }
  console.log('');
}

process.exit(allClean ? 0 : 1);
