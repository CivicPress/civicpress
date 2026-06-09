import { describe, it, expect } from 'vitest'
import {
  editorSchema,
  parseMarkdownToDoc,
  serializeDocToMarkdown,
} from '../index.js'

describe('civic-ref nodes round-trip', () => {
  // Inline civic-refs sit mid-sentence, so markdown-it tokenizes them as
  // `html_inline` (a block-level comment on its own line becomes `html_block`,
  // which is a separate path — see report / W5). HTML-comment form keeps the
  // Markdown human-readable + Git-diff-friendly.
  const recordRefMd =
    'See <!--civic-ref type="record" id="rec-abc" label="Budget 2026"--> for details.\n'
  const geographyRefMd =
    'In <!--civic-ref type="geography" id="geo-001" label="Ward 3"-->, the bylaw applies.\n'
  const attachmentRefMd =
    'Attached: <!--civic-ref type="attachment" id="att-77" label="map.pdf"-->.\n'

  it.each([
    ['record-ref', recordRefMd],
    ['geography-ref', geographyRefMd],
    ['attachment-ref', attachmentRefMd],
  ])('round-trips %s', (_name, md) => {
    const doc = parseMarkdownToDoc(md)
    const back = serializeDocToMarkdown(doc)
    expect(back.trim()).toBe(md.trim())
  })

  it('schema has civic-ref node definitions', () => {
    expect(editorSchema.nodes.civicRef).toBeDefined()
    const spec = editorSchema.nodes.civicRef.spec
    expect(spec.attrs?.refType).toBeDefined()
    expect(spec.attrs?.id).toBeDefined()
    expect(spec.attrs?.label).toBeDefined()
  })

  it('parses civic-ref attrs into the node', () => {
    const doc = parseMarkdownToDoc(recordRefMd)
    let found: { refType: string; id: string; label: string } | null = null
    doc.descendants((node) => {
      if (node.type.name === 'civicRef') {
        found = {
          refType: node.attrs.refType as string,
          id: node.attrs.id as string,
          label: node.attrs.label as string,
        }
      }
    })
    expect(found).toEqual({
      refType: 'record',
      id: 'rec-abc',
      label: 'Budget 2026',
    })
  })

  it('round-trips a label containing a double-quote', () => {
    const md = 'See <!--civic-ref type="record" id="rec-1" label="The &quot;big&quot; budget"--> now.\n'
    const doc = parseMarkdownToDoc(md)
    let label: string | null = null
    doc.descendants((node) => {
      if (node.type.name === 'civicRef') label = node.attrs.label as string
    })
    expect(label).toBe('The "big" budget')
    expect(serializeDocToMarkdown(doc).trim()).toBe(md.trim())
  })

  it('does not crash on a non-civic-ref inline HTML comment', () => {
    const md = 'A para with <!-- just a comment --> inside.\n'
    expect(() => parseMarkdownToDoc(md)).not.toThrow()
    const doc = parseMarkdownToDoc(md)
    // The stray comment is dropped (not mis-converted into a civicRef).
    let civicRefCount = 0
    doc.descendants((node) => {
      if (node.type.name === 'civicRef') civicRefCount += 1
    })
    expect(civicRefCount).toBe(0)
  })

  it('does not crash on a stray inline HTML tag', () => {
    expect(() => parseMarkdownToDoc('Line<br>break.\n')).not.toThrow()
  })
})
