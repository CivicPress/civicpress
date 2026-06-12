import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import {
  editorSchema,
  yXmlFragmentToMarkdown,
  prosemirrorJSONToYDoc,
  parseMarkdownToDoc,
} from '../index.js'

describe('Yjs helpers', () => {
  it('yXmlFragmentToMarkdown serializes a populated XmlFragment to Markdown', () => {
    const doc = new Y.Doc()
    const frag = doc.getXmlFragment('default')

    const para = new Y.XmlElement('paragraph')
    para.insert(0, [new Y.XmlText('Hello world.')])
    frag.insert(0, [para])

    const md = yXmlFragmentToMarkdown(frag, editorSchema)
    expect(md.trim()).toBe('Hello world.')
  })

  it('prosemirrorJSONToYDoc seeds a Y.Doc from a ProseMirror doc', () => {
    const pmDoc = parseMarkdownToDoc('# Hi\n\nA paragraph.\n')
    const yDoc = new Y.Doc()
    prosemirrorJSONToYDoc(pmDoc, yDoc)

    const frag = yDoc.getXmlFragment('default')
    expect(frag.length).toBeGreaterThan(0)

    const back = yXmlFragmentToMarkdown(frag, editorSchema)
    expect(back.trim()).toBe('# Hi\n\nA paragraph.'.trim())
  })

  it('Markdown → Y.Doc → Markdown is idempotent for civic-ref content', () => {
    const md = 'See <!--civic-ref type="record" id="r1" label="Budget"-->.\n'
    const pmDoc = parseMarkdownToDoc(md)
    const yDoc = new Y.Doc()
    prosemirrorJSONToYDoc(pmDoc, yDoc)

    const back = yXmlFragmentToMarkdown(yDoc.getXmlFragment('default'), editorSchema)
    expect(back.trim()).toBe(md.trim())
  })
})
