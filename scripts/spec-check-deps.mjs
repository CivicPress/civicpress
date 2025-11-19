#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const specsDir = path.join(root, 'docs', 'specs');
const indexPath = path.join(root, 'docs', 'specs-index.md');

if (!fs.existsSync(indexPath)) {
  console.error('specs-index.md not found');
  process.exit(1);
}

const index = fs.readFileSync(indexPath, 'utf8');
const re = /\]\((specs\/[a-z0-9\-]+\.md)\)/gi;
let m; const refs = new Set();
while ((m = re.exec(index))) refs.add(m[1]);

const missing = [];
for (const r of refs) {
  const p = path.resolve(path.dirname(indexPath), r);
  if (!fs.existsSync(p)) missing.push(r);
}

if (missing.length) {
  console.error('Missing spec files referenced in specs-index.md:');
  for (const r of missing) console.error(' -', r);
  process.exit(2);
}
console.log('Spec dependencies OK');
