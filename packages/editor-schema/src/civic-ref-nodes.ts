import type { NodeSpec } from 'prosemirror-model'

export type CivicRefType = 'record' | 'geography' | 'attachment'

export interface CivicRefAttrs {
  refType: CivicRefType
  id: string
  label: string
}

/**
 * civicRef — inline atom representing a CivicPress reference (record,
 * geography, or attachment). Rendered to/from Markdown as an HTML comment:
 *
 *   <!--civic-ref type="record" id="rec-abc" label="Budget 2026"-->
 *
 * Comment form keeps the Markdown human-readable + Git-diff-friendly while
 * allowing a typed runtime representation in the editor + Yjs document. As an
 * inline atom it lives inside a paragraph (or any inline-holding block); the
 * Markdown serializer/parser rules live in markdown-serializer.ts /
 * markdown-parser.ts.
 */
export const civicRefNodeSpec: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    refType: { default: 'record' },
    id: { default: '' },
    label: { default: '' },
  },
  parseDOM: [
    {
      tag: 'span[data-civic-ref]',
      getAttrs(el: HTMLElement) {
        const refType = el.dataset.refType
        return {
          refType: isCivicRefType(refType) ? refType : 'record',
          id: el.dataset.id ?? '',
          label: el.dataset.label ?? '',
        }
      },
    },
  ],
  toDOM(node) {
    const { refType, id, label } = node.attrs as CivicRefAttrs
    return [
      'span',
      {
        'data-civic-ref': 'true',
        'data-ref-type': refType,
        'data-id': id,
        'data-label': label,
      },
      label,
    ]
  },
}

/** Narrow an arbitrary string to a known CivicRefType. */
export function isCivicRefType(value: string | undefined): value is CivicRefType {
  return value === 'record' || value === 'geography' || value === 'attachment'
}
