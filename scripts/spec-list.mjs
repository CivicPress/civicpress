#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'docs', 'specs');
if (!fs.existsSync(dir)) {
  console.error('Specs directory not found:', dir);
  process.exit(1);
}
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.md')).sort();
for (const f of files) {
  const p = path.join(dir,f);
  const txt = fs.readFileSync(p,'utf8');
  const status = (txt.match(/Status\s*:\s*(.*)/i)||[])[1]||'Unknown';
  console.log(`${f} - Status: ${status}`);
}
