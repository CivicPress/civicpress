import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import {
  editorSchema,
  serializeDocToMarkdown,
  parseMarkdownToDoc,
  yXmlFragmentToMarkdown,
  prosemirrorJSONToYDoc,
} from '../index.js'

/**
 * GFM pipe-table round-trip (user-directed addition to the Phase 3 schema —
 * civic records carry budget/schedule tables that must NOT be normalized away
 * on the Yjs → Markdown writeback).
 *
 * Each `md` below is the *canonical* serializer output, chosen so that
 * serialize(parse(md)) === md (a true fixed point). The canonical form
 * normalizes only stylistic whitespace:
 *   - cells are single-space padded: `| a | b |`;
 *   - the delimiter row uses the 3-char minimum glyphs
 *       none `---`, left `:--`, center `:-:`, right `--:`;
 *   - columns are NOT width-aligned (a budget column's `---` is not stretched to
 *     match its widest cell).
 * No cell text, row, column, alignment, or inline mark is dropped — that would
 * be a fidelity bug, not stylistic normalization. Authored (pre-normalization)
 * forms are shown inline where they differ.
 */
describe('GFM table round-trip', () => {
  it('round-trips a simple 2-col table (header + 2 body rows)', () => {
    // AUTHORED form is identical to canonical here (already single-padded,
    // 3-char delimiters) — this is the baseline fixed point.
    const md = [
      '| Name | Role |',
      '| --- | --- |',
      '| Ada | Engineer |',
      '| Linus | Maintainer |',
    ].join('\n')
    const doc = parseMarkdownToDoc(md)
    const back = serializeDocToMarkdown(doc)
    expect(back.trim()).toBe(md)
  })

  it('round-trips column alignment (left / center / right / none)', () => {
    // AUTHORED:  | :--- | :--: | ---: | --- |   (varying delimiter widths)
    // Canonical collapses each delimiter to its 3-char minimum but PRESERVES
    // the alignment semantics (the `:` markers), which is the load-bearing part.
    const md = [
      '| Item | Qty | Cost | Note |',
      '| :-- | :-: | --: | --- |',
      '| Chairs | 4 | 200 | bulk |',
      '| Desks | 2 | 500 | oak |',
    ].join('\n')
    const doc = parseMarkdownToDoc(md)
    const back = serializeDocToMarkdown(doc)
    expect(back.trim()).toBe(md)
  })

  it('round-trips inline marks + a civic-ref inside cells', () => {
    // Cells carry bold/italic/inline-code/a link and a civic-ref comment.
    const md = [
      '| Field | Value |',
      '| --- | --- |',
      '| **Bold** and *italic* | `code` here |',
      '| [site](https://civicpress.io) | <!--civic-ref type="record" id="rec-1" label="Budget 2026"--> |',
    ].join('\n')
    const doc = parseMarkdownToDoc(md)
    const back = serializeDocToMarkdown(doc)
    expect(back.trim()).toBe(md)
  })

  it('escapes a literal pipe in cell content', () => {
    // A `|` inside a cell must be backslash-escaped so it does not split the
    // cell; the escape must survive the round-trip.
    const md = [
      '| Expr | Meaning |',
      '| --- | --- |',
      '| a \\| b | a or b |',
    ].join('\n')
    const doc = parseMarkdownToDoc(md)
    const back = serializeDocToMarkdown(doc)
    expect(back.trim()).toBe(md)
  })

  it('exposes table node types on the schema', () => {
    expect(editorSchema.nodes.table).toBeDefined()
    expect(editorSchema.nodes.table_row).toBeDefined()
    expect(editorSchema.nodes.table_cell).toBeDefined()
    expect(editorSchema.nodes.table_header).toBeDefined()
  })

  it('preserves cells/rows/alignment structurally (doc-level, not just text)', () => {
    const md = [
      '| A | B |',
      '| :-- | --: |',
      '| 1 | 2 |',
    ].join('\n')
    const doc = parseMarkdownToDoc(md)
    let table: import('prosemirror-model').Node | null = null
    doc.descendants((node) => {
      if (node.type.name === 'table') table = node
    })
    expect(table).not.toBeNull()
    const t = table as unknown as import('prosemirror-model').Node
    // header row + 1 body row = 2 rows
    expect(t.childCount).toBe(2)
    // 2 cells per row
    expect(t.child(0).childCount).toBe(2)
    expect(t.child(1).childCount).toBe(2)
    // header cells are table_header, body cells are table_cell
    expect(t.child(0).child(0).type.name).toBe('table_header')
    expect(t.child(1).child(0).type.name).toBe('table_cell')
    // alignment carried on cell attrs
    expect(t.child(0).child(0).attrs.align).toBe('left')
    expect(t.child(0).child(1).attrs.align).toBe('right')
  })

  it('round-trips a table nested in a blockquote (per-line delimiter)', () => {
    // Regression: a table is multi-line, so every line — not just the first —
    // must carry the blockquote `> ` prefix.
    const md = [
      '> | A | B |',
      '> | :-- | --: |',
      '> | 1 | 2 |',
      '> | 3 | 4 |',
    ].join('\n')
    const doc = parseMarkdownToDoc(md)
    const back = serializeDocToMarkdown(doc)
    expect(back.trim()).toBe(md)
  })

  it('pads a ragged body row and round-trips it (GFM fixed point)', () => {
    // A body row with fewer cells than the header is padded with empty cells by
    // GFM; the padded form is the canonical fixed point.
    const md = [
      '| A | B | C |',
      '| --- | --- | --- |',
      '| 1 | 2 |  |',
    ].join('\n')
    const doc = parseMarkdownToDoc(md)
    const back = serializeDocToMarkdown(doc)
    expect(back.trim()).toBe(md)
  })

  it('survives the Yjs round-trip (Markdown → Y.Doc → Markdown)', () => {
    const md = [
      '| Month | Amount |',
      '| --- | --: |',
      '| Jan | 1000 |',
      '| Feb | **2000** |',
    ].join('\n')
    const pmDoc = parseMarkdownToDoc(md)
    const yDoc = new Y.Doc()
    prosemirrorJSONToYDoc(pmDoc, yDoc)
    const back = yXmlFragmentToMarkdown(yDoc.getXmlFragment('default'), editorSchema)
    expect(back.trim()).toBe(md)
  })
})
