#!/usr/bin/env node
// Insert `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
// above each REAL cast site in the manifest.
// Skips: (a) comment-only lines (no actual cast),
//        (b) lines already covered by an existing disable comment,
//        (c) hot-spot files marked for file-level disable.
// Defaults to dry-run; pass --apply to write changes.
//
// ⚠️  KNOWN LIMITATIONS — DO NOT REUSE WITHOUT REWORK:
// - Emits `//`-form disable comments unconditionally. Inside Vue `<template>`
//   blocks this is INVALID (Vue parses `//` as part of the tag, producing
//   vue/no-parsing-error). The L4-T2 followup script
//   `lint-rollout-fix-vue-disable-comments.mjs` cleans up the breakage —
//   future re-use should emit `<!-- ... -->` HTML form for .vue template sites.
// - Depends on the L4-T1 manifest, which under-counted cast sites by ~4x
//   (see lint-rollout-find-allowlist.mjs header). For full coverage the
//   manifest must be regenerated with an AST-based finder.
// - The `FILE_LEVEL_DISABLE` set is intentionally empty in the committed
//   version (no hot-spot files met the >20-site threshold in 2026-05-28).

import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const MANIFEST = 'docs/audits/lint-allowlist-2026-05-28.json';
const DISABLE = '// eslint-disable-next-line @typescript-eslint/no-explicit-any';

// Files to skip per-line because they get a file-level disable instead.
// Populate this list AFTER the hot-spot decision in Step 3 below.
const FILE_LEVEL_DISABLE = new Set([
  // e.g. 'modules/ui/app/components/DetailsPanel.vue'
]);

const sites = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// Heuristic: is this line a comment-only line (no real cast)?
// Strip leading whitespace, then check if it starts with comment markers.
// Conservative: only skip if the *content* outside any string literal lacks `as any` / `: any`.
function isCommentOnly(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('/*') || trimmed.startsWith('*/') || trimmed.startsWith('*')) return true;
  // Heuristic for inline comment after //: if `as any` appears only after //, it's comment-mention.
  const commentStart = line.indexOf('//');
  if (commentStart >= 0) {
    const beforeComment = line.slice(0, commentStart);
    const hasCastOutsideComment = /\bas any\b/.test(beforeComment) || /: any\b/.test(beforeComment);
    if (!hasCastOutsideComment) return true;
  }
  return false;
}

// Group by file, sort by line descending so insertions don't shift later line numbers.
const byFile = new Map();
for (const s of sites) {
  if (!byFile.has(s.file)) byFile.set(s.file, []);
  byFile.get(s.file).push(s);
}
for (const arr of byFile.values()) arr.sort((a, b) => b.line - a.line);

let inserted = 0;
let skippedComment = 0;
let skippedAlreadyDisabled = 0;
let skippedFileLevel = 0;
const changedFiles = [];

for (const [file, arr] of byFile) {
  if (FILE_LEVEL_DISABLE.has(file)) {
    skippedFileLevel += arr.length;
    continue;
  }
  const lines = readFileSync(file, 'utf8').split('\n');
  let touched = false;
  for (const site of arr) {
    const targetIdx = site.line - 1;
    const target = lines[targetIdx] || '';
    if (isCommentOnly(target)) {
      skippedComment++;
      continue;
    }
    const prev = (lines[targetIdx - 1] || '').trim();
    if (prev.includes('eslint-disable-next-line') && prev.includes('no-explicit-any')) {
      skippedAlreadyDisabled++;
      continue;
    }
    // Preserve indentation of the target line for the inserted comment.
    const indent = target.match(/^\s*/)[0];
    lines.splice(targetIdx, 0, `${indent}${DISABLE}`);
    inserted++;
    touched = true;
  }
  if (touched) {
    if (APPLY) writeFileSync(file, lines.join('\n'));
    changedFiles.push(file);
  }
}

console.error(`Files touched: ${changedFiles.length}`);
console.error(`Comments inserted: ${inserted}`);
console.error(`Skipped (comment-only line): ${skippedComment}`);
console.error(`Skipped (already disabled): ${skippedAlreadyDisabled}`);
console.error(`Skipped (file-level disable): ${skippedFileLevel}`);
console.error(APPLY ? 'WRITTEN.' : 'DRY-RUN (pass --apply to write).');
if (!APPLY) for (const f of changedFiles) console.log(f);
