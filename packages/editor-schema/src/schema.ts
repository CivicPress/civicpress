import { Schema, type NodeSpec } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
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

/**
 * Shared ProseMirror schema for CivicPress editor + realtime server.
 * Built from prosemirror-schema-basic (paragraph, heading, blockquote,
 * horizontal_rule, code_block, text, hard_break, image, marks: link, em,
 * strong, code) extended with list nodes (bullet_list, ordered_list,
 * list_item).
 *
 * Civic-reference nodes (record/geography/attachment) are added as a single
 * inline atom `civicRef` (one node type, discriminated by its `refType` attr)
 * appended to the node set below.
 */
export const editorSchema: Schema<string, string> = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block')
    .update('code_block', codeBlockWithParams)
    .addToEnd('civicRef', civicRefNodeSpec),
  marks: basicSchema.spec.marks,
})
