import {
  defaultMarkdownSerializer,
  MarkdownSerializer,
} from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { editorSchema } from './schema.js'
import type { CivicRefAttrs } from './civic-ref-nodes.js'

/**
 * Escape an attribute value so it can't break out of the HTML-comment civic-ref
 * syntax: `"` would terminate the attribute and `--` would terminate the
 * comment. Both are encoded with HTML entities the parser reverses on read.
 */
const escapeAttr = (s: string): string =>
  s.replace(/"/g, '&quot;').replace(/--/g, '&#45;&#45;')

/**
 * Markdown serializer for CivicPress editor schema.
 * Uses prosemirror-markdown's default serializer for built-in nodes; the
 * `civicRef` inline atom is written as an HTML comment so the Markdown stays
 * human-readable + Git-diff-friendly.
 */
export const civicMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    civicRef(state, node) {
      const { refType, id, label } = node.attrs as CivicRefAttrs
      state.write(
        `<!--civic-ref type="${escapeAttr(refType)}" id="${escapeAttr(id)}" label="${escapeAttr(label)}"-->`,
      )
    },
  },
  defaultMarkdownSerializer.marks,
)

/**
 * Serialize a ProseMirror document (built against `editorSchema`) to Markdown.
 */
export function serializeDocToMarkdown(doc: ProseMirrorNode): string {
  return civicMarkdownSerializer.serialize(doc)
}

// Re-export for tests that want the schema reference.
export { editorSchema }
