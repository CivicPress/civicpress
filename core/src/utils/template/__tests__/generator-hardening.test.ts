import { describe, it, expect } from 'vitest';
import { TemplateGenerator } from '../generator.js';
import type { Partial, Template } from '../types.js';

/**
 * Two things about the template generator that a request could reach.
 *
 *  1. Variable KEYS went into a regular expression unescaped, and on the
 *     preview route they come from the request body.
 *  2. Partials and `{{#if}}` blocks were found with global regular expressions
 *     that are quadratic on a body of openings with no closing.
 *
 * The second was fixed by replacing the patterns with a linear scan, which is
 * only a fix if it behaves the same. So the old implementation is kept below,
 * verbatim, as the specification, and the new one is compared with it on
 * generated input.
 */

const PARTIALS: Record<string, Partial> = {
  header: {
    name: 'header',
    content: 'HEADER[{{title}}|{{ who }}]{{#if who}}+who{{/if}}',
    parameters: [],
    description: '',
  },
  footer: {
    name: 'footer',
    content: 'FOOTER',
    parameters: [],
    description: '',
  },
};

const loader = (name: string) => PARTIALS[name] ?? null;
const generator = new TemplateGenerator(loader);

const internals = generator as any;

const template = (content: string): Template =>
  ({
    name: 'default',
    type: 'notice',
    validation: {},
    sections: [],
    content,
    rawContent: content,
  }) as unknown as Template;

/** Fixed values for everything the generator would otherwise default. */
const FIXED = {
  date: '2026-01-01',
  created: '2026-01-01',
  updated: '2026-01-01',
  author: 'Ada',
  version: '1.0.0',
  status: 'draft',
  fiscal_year: '2026',
};

const render = (content: string, variables: Record<string, unknown> = {}) =>
  generator.generateContent(template(content), { ...FIXED, ...variables });

// ---------------------------------------------------------------------------
// The implementation being replaced, as it was.
// ---------------------------------------------------------------------------

function oldEvaluateCondition(
  condition: string,
  variables: Record<string, unknown>
): boolean {
  const parts = condition.trim().split(/\s*(==|!=)\s*/);
  if (parts.length === 1) {
    const field = parts[0].replace(/^!/, '');
    const value = variables[field];
    const isNegated = parts[0].startsWith('!');
    if (isNegated) {
      return !value || value === '' || value === null || value === undefined;
    }
    return !!value && value !== '' && value !== null && value !== undefined;
  } else if (parts.length === 3) {
    const field = parts[0].trim();
    const operator = parts[1];
    const expectedValue = parts[2].replace(/['"]/g, '');
    const actualValue = variables[field];
    if (operator === '==') return String(actualValue) === expectedValue;
    if (operator === '!=') return String(actualValue) !== expectedValue;
  }
  return false;
}

function oldConditionalBlocks(
  content: string,
  variables: Record<string, unknown>
): string {
  const ifBlockRegex = /{{#if\s+([^}]+)}}([\s\S]*?){{\/if}}/g;
  return content.replace(ifBlockRegex, (_match, condition, blockContent) =>
    oldEvaluateCondition(condition, variables) ? blockContent : ''
  );
}

function oldPartials(
  content: string,
  variables: Record<string, unknown>
): string {
  const partialRegex = /{{>\s*([a-zA-Z0-9_-]+)(?:\s+([^}]+))?}}/g;
  return content.replace(partialRegex, (_match, partialName, params) => {
    const partial = loader(partialName);
    if (!partial) return `<!-- Partial not found: ${partialName} -->`;
    const partialVariables = internals.parsePartialParameters(
      params,
      variables
    ) as Record<string, unknown>;
    let partialContent = partial.content;
    for (const [key, value] of Object.entries(partialVariables)) {
      // Keys here are `\w+` by construction, so the old unescaped pattern and
      // the new escaped one are the same pattern.
      partialContent = partialContent.replace(
        new RegExp(`{{\\s*${key}\\s*}}`, 'g'),
        () => String(value || '')
      );
    }
    return oldConditionalBlocks(partialContent, partialVariables);
  });
}

// ---------------------------------------------------------------------------

/** Deterministic PRNG, so a failure can be reproduced. */
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

/**
 * Strings built from TOKENS rather than characters: a character-level
 * generator almost never produces `{{#if` followed by `{{/if}}`, so it would
 * agree on everything and test nothing.
 */
function generated(
  tokens: string[],
  count: number,
  seed: number,
  maxLength = 12
): string[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const length = 1 + Math.floor(random() * maxLength);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += tokens[Math.floor(random() * tokens.length)];
    }
    return out;
  });
}

const VARIABLES = { title: 'T', who: 'W', flag: 'yes', empty: '', n: 0 };

describe('variable keys are literal', () => {
  it('substitutes a placeholder', () => {
    expect(render('# {{title}} by {{ author }}', { title: 'Noise' })).toBe(
      '# Noise by Ada'
    );
  });

  it('does not let a key act as a pattern', () => {
    // As a pattern, `.*` matched every placeholder in the template.
    const out = render('{{title}} / {{author}} / {{.*}}', {
      title: 'Noise',
      '.*': 'TAKEN',
    });

    expect(out).toBe('Noise / Ada / TAKEN');
  });

  it('does not throw on a key that is not a valid pattern', () => {
    // `a(` was a SyntaxError — a 500 on the preview route.
    expect(() =>
      render('{{title}}', { title: 'Noise', 'a(': 'x' })
    ).not.toThrow();
    expect(render('{{a(}}', { 'a(': 'x' })).toBe('x');
  });

  it('does not run a key with a nested quantifier', () => {
    // Against a run of ordinary text this pattern is exponential: 28
    // characters took 2 s, and every 2 more multiplied that by 4. Run against
    // the old code this test does not fail an assertion — it times out.
    const line = 'a'.repeat(60) + ' ';
    const started = Date.now();

    const out = render(`{{title}}\n${line}\n`, {
      title: 'Noise',
      'q|([a-z ]+)+!|q': 'x',
    });

    expect(out).toBe(`Noise\n${line}\n`);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it.each([
    ['$&', 'the matched text'],
    ['$`', 'the text before'],
    ["$'", 'the text after'],
    ['$$', 'a dollar sign'],
    ['$1', 'a capture group'],
  ])('keeps %s in a value literal, not as %s', (value) => {
    expect(render('before {{title}} after', { title: `[${value}]` })).toBe(
      `before [${value}] after`
    );
  });
});

describe('partials', () => {
  it.each([
    ['{{> footer}}', 'FOOTER'],
    ['{{>footer}}', 'FOOTER'],
    ['{{>   footer}}', 'FOOTER'],
    ['a {{> footer}} b {{> footer}} c', 'a FOOTER b FOOTER c'],
    ['{{> missing}}', '<!-- Partial not found: missing -->'],
    ['{{> header title=title who=who}}', 'HEADER[T|W]+who'],
    // A parameter the tag does not give stays a placeholder.
    ['{{> header title="Bare"}}', 'HEADER[Bare|{{ who }}]'],
    ['{{>  header   title=title   who=flag  }}', 'HEADER[T|yes]+who'],
    // The pattern never matched a single space before the braces. Preserved,
    // not endorsed.
    ['{{> footer }}', '{{> footer }}'],
    ['{{> footer  }}', 'FOOTER'],
    ['{{> foo}ter}}', '{{> foo}ter}}'],
    ['{{> }}', '{{> }}'],
    ['{{>', '{{>'],
    ['{{> footer', '{{> footer'],
  ])('%j', (input, expected) => {
    expect(internals.processPartials(input, VARIABLES)).toBe(expected);
    expect(oldPartials(input, VARIABLES)).toBe(expected);
  });

  it('agrees with the pattern it replaced, on 100,000 generated inputs', () => {
    const inputs = generated(
      [
        '{{>',
        '{{',
        '}}',
        '}',
        '{',
        ' ',
        '  ',
        '\n',
        'header',
        'footer',
        'missing',
        'title=title',
        'who="x"',
        'a',
        '-',
        '_',
        '{{#if who}}',
        '{{/if}}',
        '{{title}}',
        '\t',
      ],
      100000,
      1
    );

    for (const input of inputs) {
      expect(internals.processPartials(input, VARIABLES)).toBe(
        oldPartials(input, VARIABLES)
      );
    }
  });

  it('is linear in a body of openings with no closing', () => {
    // 200 KB. The old pattern took 2.8 s for 50 KB and four times that for
    // each doubling.
    const body = '{{>a '.repeat(40000);
    const started = Date.now();

    expect(internals.processPartials(body, VARIABLES)).toBe(body);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('is linear when every opening has a closing that does not match', () => {
    // `!` cannot begin a name.
    const body = '{{>! a}}'.repeat(25000);
    const started = Date.now();

    expect(internals.processPartials(body, VARIABLES)).toBe(body);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('is linear when many openings share one distant closing', () => {
    // Each opening has to find out that the `}}` a long way off is not its
    // own. Slicing up to it, once per opening, is quadratic again.
    const body = '{{>! '.repeat(40000) + '}}';
    const started = Date.now();

    expect(internals.processPartials(body, VARIABLES)).toBe(body);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('is linear in whitespace that leads nowhere', () => {
    const body = '{{>' + ' '.repeat(200000) + '!}}';
    const started = Date.now();

    expect(internals.processPartials(body, VARIABLES)).toBe(body);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('conditional blocks', () => {
  it.each([
    ['{{#if flag}}yes{{/if}}', 'yes'],
    ['{{#if empty}}yes{{/if}}', ''],
    ['{{#if !empty}}yes{{/if}}', 'yes'],
    ['{{#if n}}yes{{/if}}', ''],
    ["{{#if flag == 'yes'}}a{{/if}}{{#if flag != 'yes'}}b{{/if}}", 'a'],
    ['{{#if   flag   ==   "yes"  }}a{{/if}}', 'a'],
    ['x{{#if flag}}\nline\n{{/if}}y', 'x\nline\ny'],
    // To the FIRST closing: blocks do not nest.
    ['{{#if flag}}a{{#if empty}}b{{/if}}c{{/if}}', 'a{{#if empty}}bc{{/if}}'],
    ['{{#if flag}}never closed', '{{#if flag}}never closed'],
    ['{{#ifflag}}a{{/if}}', '{{#ifflag}}a{{/if}}'],
    ['{{#if fl}ag}}a{{/if}}', '{{#if fl}ag}}a{{/if}}'],
  ])('%j', (input, expected) => {
    expect(internals.processConditionalBlocks(input, VARIABLES)).toBe(expected);
    expect(oldConditionalBlocks(input, VARIABLES)).toBe(expected);
  });

  it('agrees with the pattern it replaced, on 100,000 generated inputs', () => {
    const inputs = generated(
      [
        '{{#if',
        '{{/if}}',
        '{{',
        '}}',
        '}',
        ' ',
        '\n',
        'flag',
        'empty',
        '!empty',
        "== 'yes'",
        '!= "yes"',
        'text',
        '{{#if flag}}',
        '=',
        '!',
      ],
      100000,
      2
    );

    for (const input of inputs) {
      expect(internals.processConditionalBlocks(input, VARIABLES)).toBe(
        oldConditionalBlocks(input, VARIABLES)
      );
    }
  });

  it('is linear in a body of openings with no closing', () => {
    const body = '{{#if a '.repeat(25000);
    const started = Date.now();

    expect(internals.processConditionalBlocks(body, VARIABLES)).toBe(body);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('is linear in a body of conditions that never end', () => {
    const body = '{{#if a}}x'.repeat(20000);
    const started = Date.now();

    expect(internals.processConditionalBlocks(body, VARIABLES)).toBe(body);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('is linear when many openings share one distant closing', () => {
    const body = '{{#if! '.repeat(30000) + '}}x{{/if}}';
    const started = Date.now();

    expect(internals.processConditionalBlocks(body, VARIABLES)).toBe(body);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('conditions', () => {
  it('agrees with the split it replaced, on 100,000 generated inputs', () => {
    const inputs = generated(
      [
        'flag',
        'empty',
        'n',
        '!',
        '==',
        '!=',
        '=',
        ' ',
        '  ',
        "'yes'",
        '"yes"',
        'yes',
        '0',
        '\t',
        'missing',
      ],
      100000,
      3,
      8
    );

    for (const input of inputs) {
      expect(internals.evaluateCondition(input, VARIABLES)).toBe(
        oldEvaluateCondition(input, VARIABLES)
      );
    }
  });

  it('is linear in a run of spaces that no operator follows', () => {
    // 4.5 s for 100 KB, before.
    const condition = 'a' + ' '.repeat(200000) + 'b';
    const started = Date.now();

    expect(internals.evaluateCondition(condition, VARIABLES)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
