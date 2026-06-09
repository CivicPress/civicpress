import {
  defaultMarkdownSerializer,
  MarkdownSerializer,
} from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { editorSchema } from './schema.js'

/**
 * Markdown serializer for CivicPress editor schema.
 * Uses prosemirror-markdown's default serializer for built-in nodes;
 * civic-ref node rules are added by extending this in W3-T10.
 */
export const civicMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    // Civic-ref node rules added in W3-T10.
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
