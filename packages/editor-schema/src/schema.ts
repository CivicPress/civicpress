import { Schema, type NodeSpec } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { tableNodes } from 'prosemirror-tables'
import { civicRefNodeSpec } from './civic-ref-nodes.js'

/**
 * Override the basic schema's `code_block` with a `params` attribute so the
 * fenced-code language token (```` ```ts ````) survives Markdown round-trips.
 *
 * prosemirror-markdown already reads the fence info-string into `params` on
 * parse and re-emits `fence + params` on serialize — but the *basic* schema's
 * code_block declares no attrs, so the language was silently dropped. These
 * attr + DOM rules mirror prosemirror-markdown's own bundled schema, so the
 * language also survives the editor's DOM (parseDOM/toDOM) path used by the UI.
 */
const codeBlockWithParams: NodeSpec = {
  ...basicSchema.spec.nodes.get('code_block'),
  attrs: { params: { default: '' } },
  parseDOM: [
    {
      tag: 'pre',
      preserveWhitespace: 'full',
      getAttrs: (node) => ({
        params: (node as HTMLElement).getAttribute('data-params') || '',
      }),
    },
  ],
  toDOM(node) {
    return [
      'pre',
      node.attrs.params ? { 'data-params': String(node.attrs.params) } : {},
      ['code', 0],
    ]
  },
}

/** GFM column-alignment values for a table cell. `null` = no explicit align. */
export type CellAlign = 'left' | 'center' | 'right' | null

/** Narrow an arbitrary value to a GFM `CellAlign`. */
export function isCellAlign(value: unknown): value is Exclude<CellAlign, null> {
  return value === 'left' || value === 'center' || value === 'right'
}

/**
 * GFM table nodes (`table`, `table_row`, `table_cell`, `table_header`) from
 * prosemirror-tables. Civic records routinely carry budget/schedule tables; the
 * schema must hold them so the Yjs → Markdown writeback round-trips them
 * losslessly (without these nodes the prosemirror-markdown serializer would drop
 * the table structure entirely).
 *
 * - `tableGroup: 'block'` lets a table sit anywhere a block node can (top level,
 *   inside a blockquote, etc.).
 * - `cellContent: 'block+'` lets a cell hold the same block content the rest of
 *   the schema supports (paragraphs carrying marks + civicRef). GFM pipe tables
 *   only render single-line inline content per cell, so the Markdown
 *   parser/serializer operate on the paragraph-of-inline subset; richer block
 *   content (lists, nested tables) is representable in the editor/Yjs document
 *   but not in GFM Markdown — see markdown-serializer.ts.
 * - `align` (extra cell attr) carries GFM column alignment. `getFromDOM` /
 *   `setDOMAttr` mirror it onto a `data-align` attribute so alignment also
 *   survives the editor's DOM (parseDOM/toDOM) path used by the UI, the same way
 *   `code_block.params` does above.
 */
const civicTableNodes = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    align: {
      default: null,
      getFromDOM(dom) {
        const value = dom.getAttribute('data-align')
        return isCellAlign(value) ? value : null
      },
      setDOMAttr(value, attrs) {
        if (isCellAlign(value)) attrs['data-align'] = value
      },
    },
  },
})

/**
 * Shared ProseMirror schema for CivicPress editor + realtime server.
 * Built from prosemirror-schema-basic (paragraph, heading, blockquote,
 * horizontal_rule, code_block, text, hard_break, image, marks: link, em,
 * strong, code) extended with list nodes (bullet_list, ordered_list,
 * list_item) and GFM table nodes (table, table_row, table_cell, table_header).
 *
 * Civic-reference nodes (record/geography/attachment) are added as a single
 * inline atom `civicRef` (one node type, discriminated by its `refType` attr)
 * appended to the node set below.
 */
export const editorSchema: Schema<string, string> = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block')
    .update('code_block', codeBlockWithParams)
    .addToEnd('table', civicTableNodes.table)
    .addToEnd('table_row', civicTableNodes.table_row)
    .addToEnd('table_cell', civicTableNodes.table_cell)
    .addToEnd('table_header', civicTableNodes.table_header)
    .addToEnd('civicRef', civicRefNodeSpec),
  marks: basicSchema.spec.marks,
})
