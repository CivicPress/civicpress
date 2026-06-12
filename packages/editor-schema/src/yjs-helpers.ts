import {
  yXmlFragmentToProseMirrorRootNode,
  prosemirrorToYXmlFragment,
} from 'y-prosemirror'
import type { Schema, Node as ProseMirrorNode } from 'prosemirror-model'
import type * as Y from 'yjs'
import { serializeDocToMarkdown } from './markdown-serializer.js'

/**
 * Convert a Yjs XmlFragment (TipTap's ProseMirror representation) into Markdown.
 * Used server-side by the realtime module to write the canonical Markdown
 * back to the record file at snapshot time.
 *
 * Goes through y-prosemirror's `yXmlFragmentToProseMirrorRootNode`, which
 * rebuilds a typed ProseMirror `Node` against the given schema directly (no
 * intermediate `any`-typed JSON), then serializes via the shared
 * civicMarkdownSerializer. The fragment must already be attached to a Y.Doc.
 */
export function yXmlFragmentToMarkdown(
  fragment: Y.XmlFragment,
  schema: Schema,
): string {
  const doc = yXmlFragmentToProseMirrorRootNode(fragment, schema)
  return serializeDocToMarkdown(doc)
}

/**
 * Seed a Y.Doc's `default` XmlFragment from a ProseMirror document.
 * Used at room first-open when no snapshot exists — server parses the
 * record's Markdown into a ProseMirror doc and primes the Yjs state from it.
 *
 * Populates the *given* Y.Doc's named fragment in place (via
 * y-prosemirror's `prosemirrorToYXmlFragment`), so callers can seed an
 * existing room document rather than receiving a fresh one. Per y-prosemirror's
 * contract this is an initial-import operation only and must not be used to
 * rehydrate a document after collaboration has begun (history would be lost).
 */
export function prosemirrorJSONToYDoc(
  doc: ProseMirrorNode,
  yDoc: Y.Doc,
  fragmentName = 'default',
): void {
  const fragment = yDoc.getXmlFragment(fragmentName)
  prosemirrorToYXmlFragment(doc, fragment)
}
