import { describe, it, expect } from 'vitest';
import { GeographyParser } from '../geography-parser.js';

/** extractRawContent as it was, kept as the specification. */
function oldExtract(markdownContent: string): string | null {
  if (!markdownContent) return null;
  const match = markdownContent.match(
    /```(?:json|geojson|kml|gpx|xml)?\s*\n([\s\S]*?)```/
  );
  if (match && match[1]) return match[1].trim();
  const trimmed = markdownContent.trim();
  return trimmed || null;
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

const GEOJSON = '{"type":"FeatureCollection","features":[]}';

describe('GeographyParser.extractRawContent', () => {
  it.each([
    ['a json block', '```json\n' + GEOJSON + '\n```', GEOJSON],
    ['a geojson block', '```geojson\n' + GEOJSON + '\n```', GEOJSON],
    ['a block with no language', '```\n' + GEOJSON + '\n```', GEOJSON],
    [
      'text before the block',
      'Intro.\n\n```json\n' + GEOJSON + '\n```\n',
      GEOJSON,
    ],
    ['spaces after the fence', '```json   \n' + GEOJSON + '\n```', GEOJSON],
    [
      'blank lines after the fence',
      '```json\n\n\n' + GEOJSON + '\n```',
      GEOJSON,
    ],
    ['no block at all', '  ' + GEOJSON + '  ', GEOJSON],
    ['an empty block', '```json\n```', '```json\n```'],
    [
      'a block that is only blank lines',
      '```json\n\n   \n```',
      '```json\n\n   \n```',
    ],
    ['an unclosed block', '```json\n' + GEOJSON, '```json\n' + GEOJSON],
  ])('%s', (_label, markdown, expected) => {
    expect(GeographyParser.extractRawContent(markdown)).toBe(expected);
    expect(oldExtract(markdown)).toBe(expected);
  });

  it('answers null for nothing', () => {
    expect(GeographyParser.extractRawContent('')).toBeNull();
    expect(GeographyParser.extractRawContent('   \n ')).toBeNull();
  });

  it('agrees with the pattern it replaced, on 200,000 generated bodies', () => {
    const tokens = [
      '```',
      '```json',
      '```geojson',
      '```xml',
      '```js',
      '\n',
      '\n\n',
      ' ',
      '\t',
      '\r\n',
      '{',
      '}',
      'x',
      '"a":1',
      '``',
      '`',
    ];
    const random = mulberry32(11);

    for (let i = 0; i < 200_000; i++) {
      const length = 1 + Math.floor(random() * 10);
      let body = '';
      for (let j = 0; j < length; j++) {
        body += tokens[Math.floor(random() * tokens.length)];
      }
      expect(GeographyParser.extractRawContent(body)).toBe(oldExtract(body));
    }
  });

  it('is linear on a fence that is never closed', () => {
    // 2.2 s for 300 KB, before.
    const body = '```json' + '\n '.repeat(200_000);
    const started = Date.now();

    GeographyParser.extractRawContent(body);

    expect(Date.now() - started).toBeLessThan(500);
  });
});
