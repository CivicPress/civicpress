#!/usr/bin/env node
// Convert `//` disable comments inside .vue <template> blocks to HTML-comment form.
// Idempotent: skips lines that don't match the //-form.
//
// ⚠️  KNOWN LIMITATIONS — DO NOT REUSE WITHOUT REWORK:
// - Only converts comments on their own line at the template root. During the
//   2026-05-28 rollout, 9 sites needed MANUAL fixes because the //-comment sat
//   INSIDE an element opening tag (between attributes) or inside `{{ }}`
//   interpolations — neither position accepts `<!-- ... -->` either; the comment
//   must be relocated to the line before the element, or to the script section.
// - eslint-plugin-vue + @nuxt/eslint as configured in this repo does NOT
//   actually fire @typescript-eslint/no-explicit-any on `as any` inside Vue
//   template attribute values or `{{ }}` interpolations — many of the
//   <!-- ... --> disable comments inserted by this script are inert (they
//   document intent but suppress nothing). A future session could close that
//   blind spot.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const PATTERN_JS = '// eslint-disable-next-line @typescript-eslint/no-explicit-any';
const PATTERN_HTML = '<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->';

// Find all .vue files with the JS pattern (candidates).
const out = execSync(
  `git grep -ln "${PATTERN_JS}" -- '*.vue' || true`,
  { encoding: 'utf8' }
).trim();
const files = out ? out.split('\n') : [];

let converted = 0;
let untouched = 0;
const changed = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  let inTemplate = false;
  let templateDepth = 0;
  let changedHere = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Track template block. Vue allows nested <template> tags but top-level
    // is the SFC template. We only care about being "inside the SFC template".
    if (/^<template(\s|>)/.test(line.trim())) {
      inTemplate = true;
      templateDepth++;
      continue;
    }
    if (/^<\/template>/.test(line.trim())) {
      templateDepth--;
      if (templateDepth <= 0) inTemplate = false;
      continue;
    }
    // Reset if we hit <script>
    if (/^<script(\s|>)/.test(line.trim())) {
      inTemplate = false;
      continue;
    }
    if (!inTemplate) {
      if (line.includes(PATTERN_JS)) untouched++;
      continue;
    }
    if (line.includes(PATTERN_JS)) {
      lines[i] = line.replace(PATTERN_JS, PATTERN_HTML);
      converted++;
      changedHere = true;
    }
  }

  if (changedHere) {
    if (APPLY) writeFileSync(file, lines.join('\n'));
    changed.push(file);
  }
}

console.error(`Files touched: ${changed.length}`);
console.error(`Comments converted: ${converted}`);
console.error(`Comments left as // (script context): ${untouched}`);
console.error(APPLY ? 'WRITTEN.' : 'DRY-RUN (pass --apply).');
if (!APPLY) for (const f of changed) console.log(f);
