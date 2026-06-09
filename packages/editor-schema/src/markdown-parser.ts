import { defaultMarkdownParser, MarkdownParser } from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { editorSchema } from './schema.js'

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

// Build a parser bound to editorSchema. The defaultMarkdownParser uses the
// basic schema; we replace its schema reference but keep its token handlers.
export const civicMarkdownParser = new MarkdownParser(
  editorSchema,
  defaultMarkdownParser.tokenizer,
  defaultMarkdownParser.tokens,
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
