import { describe, it, expect } from 'vitest';
import { isLosslesslyRoundTrippable } from '~/utils/content-loss-guard';

/**
 * The content-loss guard decides whether a record's Markdown can be edited in
 * the TipTap+Yjs collaborative editor without losing content. It must:
 *   - PASS content the editor-schema preserves (paragraphs, headings, lists,
 *     blockquotes, code blocks, GFM tables, civic-ref comments, marks) even
 *     when the schema applies documented STYLISTIC normalizations
 *     (bullet `-`→`*`, loose→tight lists, table cell padding);
 *   - FAIL content the editor-schema drops or degrades (raw HTML blocks,
 *     inline HTML that is not a civic-ref, footnote refs/defs).
 */
describe('content-loss-guard: isLosslesslyRoundTrippable', () => {
  describe('round-trippable content (collaborative path)', () => {
    it('passes a plain paragraph', () => {
      expect(isLosslesslyRoundTrippable('Hello world.')).toBe(true);
    });

    it('passes headings + body', () => {
      expect(
        isLosslesslyRoundTrippable('## Budget 2026\n\nThe annual budget.')
      ).toBe(true);
    });

    it('passes a GFM table (tables are supported — must NOT fall back)', () => {
      const md = [
        '| Item | Cost |',
        '| --- | --: |',
        '| Roads | 100 |',
        '| Parks | 50 |',
      ].join('\n');
      expect(isLosslesslyRoundTrippable(md)).toBe(true);
    });

    it('passes a civic-ref comment (supported inline atom)', () => {
      const md =
        'See <!--civic-ref type="record" id="rec-1" label="Budget 2026"--> for details.';
      expect(isLosslesslyRoundTrippable(md)).toBe(true);
    });

    it('passes a bullet list written with `-` (stylistic `-`→`*` is not loss)', () => {
      const md = '- one\n- two\n- three';
      expect(isLosslesslyRoundTrippable(md)).toBe(true);
    });

    it('passes a loose list (loose→tight reflow is stylistic, not loss)', () => {
      const md = '- one\n\n- two\n\n- three';
      expect(isLosslesslyRoundTrippable(md)).toBe(true);
    });

    it('passes a fenced code block with a language token', () => {
      const md = '```ts\nconst x = 1;\n```';
      expect(isLosslesslyRoundTrippable(md)).toBe(true);
    });

    it('passes a blockquote', () => {
      expect(isLosslesslyRoundTrippable('> quoted line\n> second line')).toBe(
        true
      );
    });

    it('passes empty content', () => {
      expect(isLosslesslyRoundTrippable('')).toBe(true);
    });

    it('does not mistake a literal `<` in code for HTML', () => {
      const md = 'Use `a < b` to compare.';
      expect(isLosslesslyRoundTrippable(md)).toBe(true);
    });
  });

  describe('non-round-trippable content (single-user fallback path)', () => {
    it('fails a raw HTML block (e.g. a <div>)', () => {
      const md = 'Intro.\n\n<div class="callout">Important</div>\n\nOutro.';
      expect(isLosslesslyRoundTrippable(md)).toBe(false);
    });

    it('fails inline HTML that is not a civic-ref (e.g. <span>)', () => {
      const md = 'Text with <span style="color:red">inline html</span>.';
      expect(isLosslesslyRoundTrippable(md)).toBe(false);
    });

    it('fails a non-civic-ref HTML comment', () => {
      const md = 'Body.\n\n<!-- a private editorial note -->\n\nMore.';
      expect(isLosslesslyRoundTrippable(md)).toBe(false);
    });

    it('fails a footnote reference + definition', () => {
      const md = 'A claim.[^1]\n\n[^1]: The supporting source.';
      expect(isLosslesslyRoundTrippable(md)).toBe(false);
    });

    it('fails an inline <br> tag (raw HTML, not a hard break)', () => {
      const md = 'Line one<br>Line two.';
      expect(isLosslesslyRoundTrippable(md)).toBe(false);
    });
  });

  describe('malformed input', () => {
    it('returns false (falls back) rather than throwing on unparseable input', () => {
      // The guard must never throw — a parse failure means "not safe for the
      // collaborative editor", i.e. fall back to single-user editing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(isLosslesslyRoundTrippable(undefined as any)).toBe(false);
    });
  });
});
