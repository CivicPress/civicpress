import { describe, it, expect } from 'vitest'
import {
  editorSchema,
  serializeDocToMarkdown,
  parseMarkdownToDoc,
} from '../index.js'

describe('editor-schema StarterKit round-trip', () => {
  // Each `md` is the *idiomatic* output of prosemirror-markdown's serializer,
  // chosen so that serialize(parse(md)) === md (a true fixed point). For four
  // cases the canonical form differs *stylistically* from how a human might
  // hand-author the same content; those are annotated below with the original
  // authored form and why the normalization is loss-free (no text/structure
  // dropped — verified against doc JSON). The crux — fenced-code language and
  // list nesting — survives intact (the code_block `params` attr is the fix).
  const cases: Array<{ name: string; md: string }> = [
    { name: 'plain paragraph', md: 'Hello world.\n' },
    { name: 'heading h1', md: '# Title\n' },
    { name: 'heading h2', md: '## Subtitle\n' },
    // STYLISTIC: authored `- one\n- two\n- three`. Serializer normalizes the
    // bullet char `-`→`*` and renders list items "loose" (blank line between).
    // Structure + every item's text preserved; only the marker glyph + spacing
    // change.
    { name: 'bullet list', md: '* one\n\n* two\n\n* three\n' },
    // STYLISTIC: authored `1. first\n2. second`. Items rendered loose
    // (blank line between). Order attr + text preserved.
    { name: 'ordered list', md: '1. first\n\n2. second\n' },
    // STYLISTIC: authored `- top\n  - nested\n  - also nested\n- back at top`.
    // Bullet `-`→`*` + loose items. Crucially the nesting is PRESERVED (doc
    // JSON keeps the inner bullet_list under the first list_item) — NOT
    // flattened — so this is the would-be-bug guard, and it passes.
    {
      name: 'nested list',
      md: '* top\n\n  * nested\n\n  * also nested\n\n* back at top\n',
    },
    { name: 'bold + italic', md: 'This is **bold** and *italic*.\n' },
    { name: 'inline code', md: 'Use `code` inline.\n' },
    // Exact round-trip INCLUDING the `ts` language token. This required adding
    // a `params` attr to the code_block node (see schema.ts) — without it the
    // basic schema silently dropped the fence info-string (a real fidelity
    // bug, now fixed).
    {
      name: 'fenced code block',
      md: '```ts\nconst x = 1\n```\n',
    },
    {
      name: 'link',
      md: 'See [civicpress](https://civicpress.io) for more.\n',
    },
    // STYLISTIC: authored `> a quote\n> spans lines`. Per CommonMark, two
    // adjacent non-blank lines in a blockquote are ONE paragraph joined by a
    // soft line break (rendered as a space). The serializer reflows to the
    // canonical single-line form. Both render to identical HTML; no text lost.
    {
      name: 'blockquote',
      md: '> a quote spans lines\n',
    },
  ]

  for (const { name, md } of cases) {
    it(`round-trips: ${name}`, () => {
      const doc = parseMarkdownToDoc(md)
      const back = serializeDocToMarkdown(doc)
      expect(back.trim()).toBe(md.trim())
    })
  }

  it('exposes a valid ProseMirror schema', () => {
    expect(editorSchema).toBeDefined()
    expect(editorSchema.nodes.paragraph).toBeDefined()
    expect(editorSchema.nodes.heading).toBeDefined()
    expect(editorSchema.marks.strong).toBeDefined()
    expect(editorSchema.marks.em).toBeDefined()
  })
})
