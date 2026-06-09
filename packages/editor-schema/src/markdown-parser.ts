import { defaultMarkdownParser, MarkdownParser } from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
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

/**
 * Tokenizer with HTML enabled (the default prosemirror-markdown parser uses
 * `{ html: false }`, which collapses HTML comments into plain text). Enabling
 * HTML makes markdown-it emit `html_inline`/`html_block` tokens we can detect.
 */
const civicTokenizer: MarkdownIt = MarkdownIt('commonmark', { html: true })
civicTokenizer.core.ruler.push('civic_ref', civicRefCoreRule)

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
