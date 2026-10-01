import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '../query-parser.js';

/** The three expressions as they were, kept as the specification. */
function oldOperators(cleanedQuery: string) {
  return {
    hasExplicitOR: /\s+(OR|or)\s+/.test(cleanedQuery),
    hasExplicitAND: /\s+(AND|and)\s+/.test(cleanedQuery),
    operatorFreeQuery: cleanedQuery
      .replace(/\s+(OR|or|AND|and)\s+/gi, ' ')
      .trim(),
  };
}

function newOperators(cleanedQuery: string) {
  return {
    hasExplicitOR: /\s(?:OR|or)\s/.test(cleanedQuery),
    hasExplicitAND: /\s(?:AND|and)\s/.test(cleanedQuery),
    operatorFreeQuery: cleanedQuery
      .replace(/(?<!\s)\s+(?:OR|or|AND|and)\s+/gi, ' ')
      .trim(),
  };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('parseSearchQuery', () => {
  it.each([
    ['noise bylaw', ['noise', 'bylaw'], 'AND', false],
    ['noise OR bylaw', ['noise', 'bylaw'], 'OR', true],
    ['noise or bylaw', ['noise', 'bylaw'], 'OR', true],
    ['noise AND bylaw', ['noise', 'bylaw'], 'AND', true],
    ['noise   OR   bylaw', ['noise', 'bylaw'], 'OR', true],
    ['noise\tOR\nbylaw', ['noise', 'bylaw'], 'OR', true],
    // An operator needs whitespace on BOTH sides.
    ['OR noise', ['OR', 'noise'], 'AND', false],
    ['noise OR', ['noise', 'OR'], 'AND', false],
    ['ORchard ANDroid', ['ORchard', 'ANDroid'], 'AND', false],
    // Only the first of two adjacent operators is one: the second has lost
    // the whitespace before it to the first.
    ['a OR OR b', ['a', 'OR', 'b'], 'OR', true],
  ])('%j', (query, words, operator, explicit) => {
    const parsed = parseSearchQuery(query);

    expect(parsed.words).toEqual(words);
    expect(parsed.operator).toBe(operator);
    expect(parsed.hasExplicitOperator).toBe(explicit);
  });

  it('agrees with the patterns it replaced, on 100,000 generated queries', () => {
    const tokens = [
      ' ',
      '  ',
      '\t',
      '\n',
      'OR',
      'or',
      'Or',
      'AND',
      'and',
      'aNd',
      'a',
      'b',
      'ORchard',
      'band',
      '"',
      'x y',
      ' ',
      '   ',
    ];
    const random = mulberry32(7);

    for (let i = 0; i < 100_000; i++) {
      const length = 1 + Math.floor(random() * 10);
      let query = '';
      for (let j = 0; j < length; j++) {
        query += tokens[Math.floor(random() * tokens.length)];
      }
      expect(newOperators(query)).toEqual(oldOperators(query));
    }
  });

  it('is linear in a run of whitespace', () => {
    // 5 s for 100 KB, before. The route allows 512 characters; the function
    // is exported and allows anything.
    const query = 'a' + ' '.repeat(300_000) + 'b';
    const started = Date.now();

    const parsed = parseSearchQuery(query);

    expect(parsed.words).toEqual(['a', 'b']);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
