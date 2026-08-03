import { describe, it, expect } from 'vitest';
import { computeParity } from '../../scripts/i18n-parity.mjs';
import en from '../../modules/ui/i18n/locales/en.json';
import fr from '../../modules/ui/i18n/locales/fr.json';

/**
 * CI guard for EN/FR message-catalog parity. A key present in one locale but
 * not the other ships a raw key (or an English fallback) to the other locale's
 * users. This is the regression gate for the `records.sort.*` vs
 * `records.sortBy.*` class of drift; the same `computeParity` backs the local
 * `pnpm i18n:check` script (scripts/i18n-parity.mjs).
 */
describe('i18n locale parity (en/fr)', () => {
  it('exposes exactly the same leaf keys in both catalogs', () => {
    const { missingInFr, missingInEn } = computeParity(en, fr);
    // Empty arrays = full parity. On failure the arrays name the offending keys.
    expect({ missingInFr, missingInEn }).toEqual({
      missingInFr: [],
      missingInEn: [],
    });
  });
});
