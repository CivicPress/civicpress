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
  // Specs now carry their metadata as standard top-of-file YAML frontmatter, so
  // strip a leading `---...---` block before checking for the H1 title. (The
  // status also lives in that frontmatter as `status:`.)
  const afterFrontmatter = txt.replace(/^---\n[\s\S]*?\n---\n/, '');
  const hasHeader = /^\s*#\s+/.test(afterFrontmatter);
  // Accept the status in frontmatter (`status:`) or as a bold-prose header
  // (`**Status**:`) — both conventions are in use across the specs.
  const hasStatus = /\bStatus[\s*]*:/i.test(txt);
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
