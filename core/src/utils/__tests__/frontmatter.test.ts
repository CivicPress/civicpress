import { describe, it, expect, afterEach } from 'vitest';
// The one sanctioned direct import outside the wrapper: the control test below
// needs the unguarded library to prove the probe these tests rely on is real.
import matter from 'gray-matter';
import { parseFrontmatter, stringifyFrontmatter } from '../frontmatter.js';
import { ValidationError } from '../../errors/index.js';

/**
 * A record file must be data. gray-matter hands a front-matter block tagged
 * `---js` to `eval`, so an unguarded parse turns any file that reaches the
 * data directory — by import, restore, or Git — into code that runs as the
 * server.
 *
 * The probe: front matter that sets a global as a side effect. If the global is
 * set after a parse, the block was executed.
 */
const PROBE = '__civicpressFrontmatterProbe';
const probeState = globalThis as unknown as Record<string, unknown>;

const executable = (tag: string) =>
  `---${tag}\n(globalThis.${PROBE} = 'executed', { title: 'x' })\n---\nbody\n`;

afterEach(() => {
  delete probeState[PROBE];
  // The control test parses without options, which populates gray-matter's
  // process-wide cache. Clear it so no test depends on another's leftovers.
  (matter as unknown as { clearCache(): void }).clearCache();
});

describe('parseFrontmatter', () => {
  it('CONTROL: the unguarded library really does execute a js block', () => {
    // Not a test of our code. It proves the probe detects execution, so the
    // "was not executed" assertions below cannot pass vacuously — and if
    // gray-matter ever drops this engine, this is the test that says so.
    matter(executable('js'));
    expect(probeState[PROBE]).toBe('executed');
  });

  it.each(['js', 'javascript', 'JS', 'JavaScript'])(
    'refuses front matter tagged "%s" without executing it',
    (tag) => {
      expect(() => parseFrontmatter(executable(tag))).toThrow(ValidationError);
      expect(probeState[PROBE]).toBeUndefined();
    }
  );

  it('refuses the tag when it is followed by trailing whitespace', () => {
    // gray-matter trims the language name, so `---js  ` selects the engine too.
    const content = `---js  \n(globalThis.${PROBE} = 'executed', {})\n---\nbody\n`;
    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(probeState[PROBE]).toBeUndefined();
  });

  it('refuses it on the first parse and on every parse after', () => {
    // The unguarded library caches by content; a refusal must not be a
    // one-time event that a second parse of the same text slips past.
    const content = executable('js');
    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(() => parseFrontmatter(content)).toThrow(ValidationError);
    expect(probeState[PROBE]).toBeUndefined();
  });

  it('parses YAML front matter, the format CivicPress writes', () => {
    const parsed = parseFrontmatter(
      '---\ntitle: Noise bylaw\ntype: bylaw\ntags:\n  - noise\n---\n\n# Body\n'
    );
    expect(parsed.data).toEqual({
      title: 'Noise bylaw',
      type: 'bylaw',
      tags: ['noise'],
    });
    expect(parsed.content).toBe('\n# Body\n');
  });

  it('still accepts explicitly tagged YAML and JSON', () => {
    expect(parseFrontmatter('---yaml\ntitle: a\n---\nbody').data).toEqual({
      title: 'a',
    });
    expect(parseFrontmatter('---json\n{"title": "a"}\n---\nbody').data).toEqual(
      { title: 'a' }
    );
  });

  it('returns empty data for a document with no front matter', () => {
    const parsed = parseFrontmatter('# Just a heading\n\nText.\n');
    expect(parsed.data).toEqual({});
    expect(parsed.content).toBe('# Just a heading\n\nText.\n');
  });

  it('treats a js block that is not at the top of the file as body text', () => {
    // Only the FIRST block is front matter. This is what makes the API's own
    // writers safe: they emit a server-built YAML header, so caller-supplied
    // text always lands after it.
    const parsed = parseFrontmatter(
      `---\ntitle: a\n---\n---js\n(globalThis.${PROBE} = 'executed', {})\n---\n`
    );
    expect(parsed.data).toEqual({ title: 'a' });
    expect(parsed.content).toContain('---js');
    expect(probeState[PROBE]).toBeUndefined();
  });

  it('throws on a language that has no engine, as gray-matter always has', () => {
    expect(() => parseFrontmatter('---toml\ntitle = "a"\n---\nbody')).toThrow(
      /not registered/
    );
  });

  it('throws on malformed YAML, as gray-matter always has', () => {
    expect(() =>
      parseFrontmatter('---\ntitle: [unclosed\n---\nbody')
    ).toThrow();
  });

  it('does not share parsed data between calls', () => {
    // Without options gray-matter returns the SAME `data` object for the same
    // text, so one caller's mutation leaks into the next caller's result.
    const content = '---\ntitle: original\n---\nbody';
    const first = parseFrontmatter(content);
    first.data.title = 'mutated';
    first.data.injected = true;

    const second = parseFrontmatter(content);
    expect(second.data).toEqual({ title: 'original' });
    expect(second.data).not.toBe(first.data);
  });

  it('does not grow the process-wide cache', () => {
    const cache = (matter as unknown as { cache: Record<string, unknown> })
      .cache;
    const before = Object.keys(cache).length;
    for (let i = 0; i < 25; i++) {
      parseFrontmatter(`---\ntitle: record ${i}\n---\nbody ${i}`);
    }
    expect(Object.keys(cache).length).toBe(before);
  });
});

describe('stringifyFrontmatter', () => {
  it('writes exactly what matter.stringify writes for an ordinary body', () => {
    const body = '# Title\n\nSome text.\n';
    const data = { title: 'Noise bylaw', type: 'bylaw', tags: ['a', 'b'] };
    expect(stringifyFrontmatter(body, data)).toBe(matter.stringify(body, data));
  });

  it('round-trips through parseFrontmatter', () => {
    const body = '# Title\n\nSome text.\n';
    const data = { title: 'Noise bylaw', status: 'draft' };
    const parsed = parseFrontmatter(stringifyFrontmatter(body, data));
    expect(parsed.data).toEqual(data);
    expect(parsed.content).toBe(body);
  });

  it('never executes a body that begins with a js block', () => {
    // matter.stringify PARSES a string body before serializing it, so an
    // unguarded call here is an eval site as well.
    const body = `---js\n(globalThis.${PROBE} = 'executed', {})\n---\ntext\n`;
    const out = stringifyFrontmatter(body, { title: 'a' });
    expect(probeState[PROBE]).toBeUndefined();
    expect(out).toContain(body);
  });

  it('keeps a body that begins with "---" as body, not as metadata', () => {
    // The unguarded call reads such a body as front matter and folds its keys
    // into the record's metadata, silently rewriting the document.
    const body = '---\nsmuggled: true\n---\nreal text\n';
    const out = stringifyFrontmatter(body, { title: 'a' });

    const parsed = parseFrontmatter(out);
    expect(parsed.data).toEqual({ title: 'a' });
    expect(parsed.content).toBe(body);
  });
});
