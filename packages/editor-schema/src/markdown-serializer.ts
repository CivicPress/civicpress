import {
  defaultMarkdownSerializer,
  MarkdownSerializer,
  MarkdownSerializerState,
} from 'prosemirror-markdown'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { editorSchema, isCellAlign } from './schema.js'
import type { CellAlign } from './schema.js'
import type { CivicRefAttrs } from './civic-ref-nodes.js'

/**
 * Escape an attribute value so it can't break out of the HTML-comment civic-ref
 * syntax: `"` would terminate the attribute and `--` would terminate the
 * comment. Both are encoded with HTML entities the parser reverses on read.
 */
const escapeAttr = (s: string): string =>
  s.replace(/"/g, '&quot;').replace(/--/g, '&#45;&#45;')

/** Serialize the `civicRef` inline atom as its human-readable HTML comment. */
const serializeCivicRef = (
  state: MarkdownSerializerState,
  node: ProseMirrorNode,
): void => {
  const { refType, id, label } = node.attrs as CivicRefAttrs
  state.write(
    `<!--civic-ref type="${escapeAttr(refType)}" id="${escapeAttr(id)}" label="${escapeAttr(label)}"-->`,
  )
}

/**
 * GFM delimiter-row glyph for a column alignment. The 3-char minimum forms are
 * the canonical round-trip output (markdown-it parses each back to the same
 * alignment): none `---`, left `:--`, center `:-:`, right `--:`.
 */
const alignDelimiter = (align: CellAlign): string => {
  switch (align) {
    case 'left':
      return ':--'
    case 'center':
      return ':-:'
    case 'right':
      return '--:'
    default:
      return '---'
  }
}

/**
 * Dedicated serializer for the inline content of a single table cell.
 *
 * Reuses the main serializer's node + mark rules (so marks, links, and
 * civic-refs render identically inside a cell) but overrides:
 *   - `paragraph` to emit *only* its inline content (no trailing block newline —
 *     a GFM cell is a single line);
 *   - `hard_break` to `<br>` (GFM's in-cell line break; the default `\`-newline
 *     would split the table row).
 * The result is post-processed by `renderCell` below (newline-collapse + pipe
 * escaping).
 */
const cellInlineSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    civicRef: serializeCivicRef,
    paragraph(state, node) {
      state.renderInline(node)
    },
    hard_break(state) {
      state.write('<br>')
    },
  },
  defaultMarkdownSerializer.marks,
)

/**
 * Render one table cell to a single GFM-cell string: its inline Markdown with
 * any newline collapsed to a space (multi-paragraph cells, soft breaks) and
 * literal pipes backslash-escaped so they don't split the row.
 */
const renderCell = (cell: ProseMirrorNode): string => {
  const inline = cellInlineSerializer.serialize(cell, { tightLists: true })
  return inline
    .replace(/\n+/g, ' ')
    .trim()
    .replace(/\|/g, '\\|')
}

/**
 * Serialize a `table` node to a GFM pipe table:
 *
 *   | h1 | h2 |
 *   | --- | :-: |
 *   | a  | b  |
 *
 * The first row supplies the header + per-column alignment (read off each header
 * cell's `align` attr). GFM cannot express block content in a cell, multiple
 * header rows, or row/col spans — see the module note; the canonical form is a
 * single-space-padded, non-width-aligned table that is a true round-trip fixed
 * point.
 */
const serializeTable = (
  state: MarkdownSerializerState,
  node: ProseMirrorNode,
): void => {
  const rows: string[][] = []
  const aligns: CellAlign[] = []
  node.forEach((row, _rowOffset, rowIndex) => {
    const cells: string[] = []
    row.forEach((cell, _cellOffset, colIndex) => {
      cells.push(renderCell(cell))
      if (rowIndex === 0) {
        const a = cell.attrs.align
        aligns[colIndex] = isCellAlign(a) ? a : null
      }
    })
    rows.push(cells)
  })

  if (rows.length === 0) return

  const renderRow = (cells: string[]): string => `| ${cells.join(' | ')} |`
  const lines: string[] = []
  lines.push(renderRow(rows[0]))
  lines.push(
    `| ${rows[0].map((_, i) => alignDelimiter(aligns[i] ?? null)).join(' | ')} |`,
  )
  for (let i = 1; i < rows.length; i++) lines.push(renderRow(rows[i]))

  // Emit via `state.text(..., false)` (escape off — the GFM pipe/delimiter
  // syntax and the already-pipe-escaped cells must not be re-escaped). `text`
  // calls `write` per line, which prepends the active block delimiter (e.g. a
  // blockquote's `> `) to every continuation line; a single multi-line `write`
  // would only prefix the first line.
  state.text(lines.join('\n'), false)
  state.closeBlock(node)
}

/**
 * Markdown serializer for CivicPress editor schema.
 * Uses prosemirror-markdown's default serializer for built-in nodes; the
 * `civicRef` inline atom is written as an HTML comment so the Markdown stays
 * human-readable + Git-diff-friendly.
 */
export const civicMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    civicRef: serializeCivicRef,
    // Tables are serialized whole by `serializeTable` (which walks rows/cells
    // directly). The row/cell node serializers are therefore never reached, but
    // must be defined so the serializer doesn't throw on them in strict mode.
    table: serializeTable,
    table_row() {},
    table_cell() {},
    table_header() {},
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
