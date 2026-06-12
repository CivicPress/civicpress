import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import {
  parseMarkdownToDoc,
  serializeDocToMarkdown,
} from '@civicpress/editor-schema';

/**
 * Content-loss guard for the collaborative (TipTap+Yjs) editor path.
 *
 * `@civicpress/editor-schema` is the schema the realtime server uses to
 * serialize the Yjs document back to the canonical Markdown file. A record may
 * only be opened in the collaborative editor if its Markdown round-trips
 * through that schema WITHOUT losing content — otherwise a collaborator's first
 * keystroke would silently rewrite the file, dropping anything the schema can't
 * represent. Records that fail the guard stay in the single-user CodeMirror
 * editor (which edits the raw Markdown text and never drops anything).
 *
 * Two complementary checks (see `isLosslesslyRoundTrippable`):
 *
 *  1. A POSITIVE DETECTOR for the constructs the editor-schema is known to drop
 *     or degrade on the *first* parse — raw HTML blocks, inline HTML that is not
 *     a civic-ref, and footnote refs/defs. These are lost on parse, so the
 *     fixed-point check below can't see them (both serializations have already
 *     dropped them and therefore match). The detector tokenises with the SAME
 *     markdown-it configuration the editor-schema parser uses (commonmark +
 *     html:true + table), so it agrees with the schema about what is and isn't
 *     HTML — and, because it inspects the token stream rather than raw text, it
 *     does not false-positive on a literal `<` inside a code span/fence.
 *
 *  2. A FIXED-POINT backstop for any *other* structural surprise. The schema
 *     applies documented STYLISTIC normalizations on the first parse/serialize
 *     (bullet `-`→`*`, loose→tight lists, blockquote reflow, table-cell
 *     padding). Those are intended and lossless, so a naive
 *     `serialize(parse(md)) === md` would wrongly reject them. Instead we
 *     compare the FIRST serialization to the SECOND: `serialize(parse(md))`
 *     vs `serialize(parse(serialize(parse(md))))`. The stylistic normalization
 *     happens on the first pass, so a faithfully-representable document is a
 *     fixed point (s1 === s2); a document that still mutates on the second pass
 *     is not safely representable and falls back.
 */

/**
 * Matches a single civic-ref HTML comment — mirrors the editor-schema parser's
 * `CIVIC_REF_RE`. A civic-ref comment is SUPPORTED (it becomes a civicRef node),
 * so it must NOT be treated as a content-dropping HTML token.
 */
const CIVIC_REF_RE =
  /^<!--civic-ref\s+type="([^"]+)"\s+id="([^"]+)"\s+label="([^"]*)"-->$/;

/**
 * Matches a footnote reference (`[^id]`) or definition (`[^id]:`). markdown-it's
 * bare commonmark preset has no footnote plugin, so footnote syntax tokenises as
 * plain text — it would "round-trip" as literal text but lose its meaning in the
 * editor (a footnote silently becomes the characters `[^1]`). Per the W5-T9
 * content-loss decision, footnotes therefore force the single-user fallback.
 */
const FOOTNOTE_RE = /\[\^[^\]]+\]/;

/**
 * markdown-it configured to match the editor-schema parser (commonmark, HTML
 * enabled so comments/HTML surface as tokens, GFM tables enabled). Kept module-
 * local and reused across calls.
 */
const detector: MarkdownIt = MarkdownIt('commonmark', { html: true });
detector.enable('table');

/** True if a token's content is exactly a civic-ref comment. */
function isCivicRefToken(content: string): boolean {
  return CIVIC_REF_RE.test(content.trim());
}

/**
 * Scan the markdown-it token stream for constructs the editor-schema drops or
 * degrades. Returns true if any are present.
 */
function hasUnsupportedConstruct(md: string): boolean {
  const tokens = detector.parse(md, {});
  for (const token of tokens) {
    // Raw HTML block (e.g. a <div>…</div>) — dropped by the schema parser.
    if (token.type === 'html_block') return true;

    if (token.type !== 'inline') continue;
    const children: Token[] = token.children ?? [];
    for (const child of children) {
      // Inline HTML that is not a civic-ref (e.g. <span>, <br>, a plain
      // <!-- note -->) — dropped by the schema parser.
      if (child.type === 'html_inline' && !isCivicRefToken(child.content)) {
        return true;
      }
      // Footnote ref/def surfaces as plain text under commonmark; treat as
      // degrading. Code spans are `code_inline` children and are skipped, so a
      // literal `[^x]` inside backticks does not trigger a false positive.
      if (child.type === 'text' && FOOTNOTE_RE.test(child.content)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Decide whether `md` can be edited in the collaborative editor without losing
 * content. Never throws: any parse/serialize failure is treated as "not safe"
 * (fall back to single-user editing).
 */
export function isLosslesslyRoundTrippable(md: string): boolean {
  if (typeof md !== 'string') return false;
  // Empty content is trivially representable (an empty document).
  if (md.trim().length === 0) return true;

  try {
    if (hasUnsupportedConstruct(md)) return false;

    // Fixed-point backstop: the first parse/serialize absorbs all stylistic
    // normalization, so a faithfully-representable document is unchanged by a
    // second pass.
    const s1 = serializeDocToMarkdown(parseMarkdownToDoc(md));
    const s2 = serializeDocToMarkdown(parseMarkdownToDoc(s1));
    return s1 === s2;
  } catch {
    return false;
  }
}
