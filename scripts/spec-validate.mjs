#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dir = path.join(root, 'docs', 'specs');
let failures = 0;

if (!fs.existsSync(dir)) {
  console.error('Specs directory not found:', dir);
  process.exit(1);
}

const specs = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
for (const f of specs) {
  const p = path.join(dir, f);
  const txt = fs.readFileSync(p, 'utf8');
  const hasHeader = /^#\s+/.test(txt);
  const hasStatus = /\bStatus\s*:/i.test(txt);
  if (!hasHeader || !hasStatus) {
    failures++;
    console.log(`Spec issue: ${f} -> missing ${!hasHeader ? 'header' : ''}${!hasHeader && !hasStatus ? ' and ' : ''}${!hasStatus ? 'status' : ''}`);
  }
}

if (failures) {
  console.error(`Spec validation failed: ${failures} file(s) need fixes.`);
  process.exit(2);
}
console.log('Spec validation OK');
