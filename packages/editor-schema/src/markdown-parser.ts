import { defaultMarkdownParser, MarkdownParser } from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import MarkdownIt from 'markdown-it'
import Token from 'markdown-it/lib/token.mjs'
import type { CellAlign } from './schema.js'
import { editorSchema } from './schema.js'
import type { CivicRefAttrs, CivicRefType } from './civic-ref-nodes.js'
import { isCivicRefType } from './civic-ref-nodes.js'

/**
 * Tagged error for malformed Markdown — lets the realtime serializer
 * distinguish "parser failure" from "doc structure failure" (per spec §7.4).
 */
export class EditorSchemaParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'EditorSchemaParseError'
  }
}

/**
 * Matches a single civic-ref HTML comment. Anchored (^…$) so it only fires on a
 * token whose *entire* content is the comment — a stray `<br>` or unrelated
 * `<!-- note -->` will not match and is left as a plain `html_inline` token.
 */
const CIVIC_REF_RE =
  /^<!--civic-ref\s+type="([^"]+)"\s+id="([^"]+)"\s+label="([^"]*)"-->$/

/** Reverse the serializer's attribute escaping. */
function unescapeAttr(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#45;&#45;/g, '--')
}

function parseCivicRefAttrs(raw: string): CivicRefAttrs | null {
  const m = CIVIC_REF_RE.exec(raw.trim())
  if (!m) return null
  const refType = m[1]
  return {
    refType: isCivicRefType(refType) ? refType : ('record' as CivicRefType),
    id: m[2],
    label: unescapeAttr(m[3]),
  }
}

/**
 * markdown-it core rule: rewrite any `html_inline` token whose content is a
 * civic-ref comment into a dedicated `civic_ref` token. Non-matching HTML
 * tokens are untouched (so they hit the `html_inline`/`html_block` ignore
 * handlers below rather than being mis-converted into an empty civicRef).
 *
 * Runs over every `inline` block token (including the per-cell `inline` tokens
 * markdown-it's table rule emits), so a civic-ref inside a table cell is mapped
 * to a `civicRef` node just like one in a paragraph.
 */
function civicRefCoreRule(state: { tokens: Token[] }): void {
  for (const block of state.tokens) {
    const children = block.children
    if (block.type !== 'inline' || !children) continue
    for (const child of children) {
      if (child.type === 'html_inline' && CIVIC_REF_RE.test(child.content)) {
        child.type = 'civic_ref'
      }
    }
  }
}

/** Read a GFM cell alignment from a `th_open`/`td_open` token's inline style. */
function alignFromCellToken(tok: Token): CellAlign {
  const style = tok.attrGet('style')
  if (!style) return null
  if (style.includes('text-align:left')) return 'left'
  if (style.includes('text-align:center')) return 'center'
  if (style.includes('text-align:right')) return 'right'
  return null
}

/**
 * markdown-it core rule: wrap each table cell's `inline` token in
 * `paragraph_open` / `paragraph_close`.
 *
 * markdown-it emits cell content as a bare `inline` token between `th_open`/
 * `td_open` and its close, but the ProseMirror table cell's content is `block+`
 * (a paragraph holding the inline content) — without a paragraph wrapper the
 * cell would fail to fill. Injecting the wrapper here lets the existing
 * `paragraph` token handler build the cell's paragraph, so cell inline content
 * (marks + civic-refs) flows through the normal inline pipeline.
 */
function tableCellParagraphRule(state: { tokens: Token[] }): void {
  const out: Token[] = []
  for (let i = 0; i < state.tokens.length; i++) {
    const tok = state.tokens[i]
    const isCellOpen = tok.type === 'th_open' || tok.type === 'td_open'
    const next = state.tokens[i + 1]
    out.push(tok)
    if (isCellOpen && next && next.type === 'inline') {
      const open = new Token('paragraph_open', 'p', 1)
      open.block = true
      out.push(open)
      out.push(next)
      const close = new Token('paragraph_close', 'p', -1)
      close.block = true
      out.push(close)
      i += 1 // the inline token has been consumed
    }
  }
  state.tokens = out
}

/**
 * Tokenizer with HTML enabled (the default prosemirror-markdown parser uses
 * `{ html: false }`, which collapses HTML comments into plain text). Enabling
 * HTML makes markdown-it emit `html_inline`/`html_block` tokens we can detect.
 *
 * The `table` rule is DISABLED under the bare `'commonmark'` preset, so it is
 * re-enabled explicitly — civic records carry GFM pipe tables that must
 * round-trip. Enabling it leaves civic-ref `html_inline` handling intact (a
 * civic-ref still tokenizes as `html_inline`, including inside a table cell).
 */
const civicTokenizer: MarkdownIt = MarkdownIt('commonmark', { html: true })
civicTokenizer.enable('table')
civicTokenizer.core.ruler.push('civic_ref', civicRefCoreRule)
civicTokenizer.core.ruler.push('civic_table_cell_paragraph', tableCellParagraphRule)

const tokens = {
  ...defaultMarkdownParser.tokens,
  civic_ref: {
    node: 'civicRef',
    getAttrs(tok: Token) {
      const attrs = parseCivicRefAttrs(tok.content)
      if (!attrs) return null
      return { refType: attrs.refType, id: attrs.id, label: attrs.label }
    },
  },
  // GFM tables. markdown-it nests rows under thead/tbody wrappers that have no
  // ProseMirror equivalent — they are `ignore`d (registered as no-op
  // _open/_close), which makes them transparent: the row tokens they wrap are
  // still processed and open `table_row` nodes directly inside the `table`.
  // Header cells (`th`) → `table_header`, body cells (`td`) → `table_cell`;
  // both read GFM column alignment off the open token's inline style.
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: {
    block: 'table_header',
    getAttrs: (tok: Token) => ({ align: alignFromCellToken(tok) }),
  },
  td: {
    block: 'table_cell',
    getAttrs: (tok: Token) => ({ align: alignFromCellToken(tok) }),
  },
  // Stray (non-civic-ref) HTML must not crash the parser. It is dropped rather
  // than mis-converted; civic-refs are extracted ahead of this by the core rule.
  // `noCloseToken` registers the handler under the bare token name (html_inline
  // / html_block are self-closing — they have no _open/_close variants).
  html_inline: { ignore: true, noCloseToken: true },
  html_block: { ignore: true, noCloseToken: true },
}

export const civicMarkdownParser = new MarkdownParser(
  editorSchema,
  civicTokenizer,
  tokens,
)

/**
 * Parse Markdown to a ProseMirror document built against `editorSchema`.
 * Throws `EditorSchemaParseError` on malformed input.
 */
export function parseMarkdownToDoc(md: string): ProseMirrorNode {
  try {
    const doc = civicMarkdownParser.parse(md)
    if (!doc) throw new Error('parser returned null/undefined')
    return doc
  } catch (err) {
    throw new EditorSchemaParseError(
      `Failed to parse Markdown: ${err instanceof Error ? err.message : String(err)}`,
      err,
    )
  }
}
