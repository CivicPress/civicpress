// Locale key-parity check for the web UI.
//
// The EN and FR message catalogs (modules/ui/i18n/locales/{en,fr}.json) must
// expose the SAME set of leaf keys — a key present in one but not the other is
// an untranslated (or orphaned) string that ships a raw key or an English
// fallback to French users. A past refactor left `records.sort.*` (EN) and
// `records.sortBy.*` (FR) keyed differently, silently breaking sort labels in
// one locale; this guard makes that class of drift a hard failure.
//
// Exports `flattenKeys` + `computeParity` for the vitest gate
// (tests/ui/i18n-parity.test.ts); run directly for a local/CI report:
//   node scripts/i18n-parity.mjs
import { readFileSync } from 'node:fs';

/** Flatten a nested message object to the set of dot-joined leaf keys. */
export function flattenKeys(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenKeys(value, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

/** Keys present in EN but missing from FR, and vice-versa (both sorted). */
export function computeParity(enObj, frObj) {
  const en = flattenKeys(enObj);
  const fr = flattenKeys(frObj);
  const missingInFr = [...en].filter((k) => !fr.has(k)).sort();
  const missingInEn = [...fr].filter((k) => !en.has(k)).sort();
  return { missingInFr, missingInEn };
}

const localeUrl = (locale) =>
  new URL(`../modules/ui/i18n/locales/${locale}.json`, import.meta.url);

/** Load and parse a locale catalog by code (`en` / `fr`). */
export function loadLocale(locale) {
  return JSON.parse(readFileSync(localeUrl(locale), 'utf8'));
}

// CLI: report the diff and exit non-zero on any mismatch.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { missingInFr, missingInEn } = computeParity(
    loadLocale('en'),
    loadLocale('fr')
  );
  if (missingInFr.length === 0 && missingInEn.length === 0) {
    console.log('i18n parity OK — en.json and fr.json expose the same keys.');
    process.exit(0);
  }
  if (missingInFr.length > 0) {
    console.error(
      `\nKeys in en.json missing from fr.json (${missingInFr.length}):`
    );
    for (const k of missingInFr) console.error(`  - ${k}`);
  }
  if (missingInEn.length > 0) {
    console.error(
      `\nKeys in fr.json missing from en.json (${missingInEn.length}):`
    );
    for (const k of missingInEn) console.error(`  - ${k}`);
  }
  console.error('\ni18n parity FAILED.');
  process.exit(1);
}
