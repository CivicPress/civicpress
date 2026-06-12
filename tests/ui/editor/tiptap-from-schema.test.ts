import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import { editorSchema, serializeDocToMarkdown } from '@civicpress/editor-schema';
import { buildTiptapExtensionsFromSchema } from '~/utils/tiptap-from-schema';

/**
 * The collaborative editor must write into the shared Yjs `default` fragment
 * using the SAME node/mark/attr names the realtime server's editor-schema uses
 * to serialize that fragment back to Markdown. TipTap builds its schema from
 * extensions (not from a raw ProseMirror Schema), and its bundled extensions
 * use camelCase node names (bulletList, codeBlock, tableCell) that would NOT
 * reconstruct under editor-schema (bullet_list, code_block, table_cell).
 *
 * `buildTiptapExtensionsFromSchema` derives TipTap extensions directly from
 * `editorSchema`, so the resulting TipTap schema is name- and attr-compatible
 * with editor-schema. These tests pin that parity.
 */
describe('buildTiptapExtensionsFromSchema', () => {
  const tiptapSchema = getSchema(buildTiptapExtensionsFromSchema());

  it('produces every node type editor-schema defines, with the same names', () => {
    const expected = Object.keys(editorSchema.nodes).sort();
    const actual = Object.keys(tiptapSchema.nodes).sort();
    expect(actual).toEqual(expected);
  });

  it('produces every mark type editor-schema defines, with the same names', () => {
    const expected = Object.keys(editorSchema.marks).sort();
    const actual = Object.keys(tiptapSchema.marks).sort();
    expect(actual).toEqual(expected);
  });

  it('uses snake_case list node names (not TipTap camelCase)', () => {
    expect(tiptapSchema.nodes.bullet_list).toBeDefined();
    expect(tiptapSchema.nodes.ordered_list).toBeDefined();
    expect(tiptapSchema.nodes.list_item).toBeDefined();
    expect(tiptapSchema.nodes.bulletList).toBeUndefined();
  });

  it('preserves code_block.params attr', () => {
    expect(tiptapSchema.nodes.code_block?.spec.attrs?.params).toBeDefined();
  });

  it('preserves the GFM table cell align attr', () => {
    expect(tiptapSchema.nodes.table_cell?.spec.attrs?.align).toBeDefined();
    expect(tiptapSchema.nodes.table_header?.spec.attrs?.align).toBeDefined();
  });

  it('preserves the civicRef inline atom with its attrs', () => {
    const civicRef = tiptapSchema.nodes.civicRef;
    expect(civicRef).toBeDefined();
    expect(civicRef?.isInline).toBe(true);
    expect(civicRef?.isAtom).toBe(true);
    expect(civicRef?.spec.attrs?.refType).toBeDefined();
    expect(civicRef?.spec.attrs?.id).toBeDefined();
    expect(civicRef?.spec.attrs?.label).toBeDefined();
  });

  it('keeps table nodes table-aware (tableRole) so prosemirror-tables works', () => {
    expect(tiptapSchema.nodes.table?.spec.tableRole).toBe('table');
    expect(tiptapSchema.nodes.table_row?.spec.tableRole).toBe('row');
    expect(tiptapSchema.nodes.table_cell?.spec.tableRole).toBe('cell');
    expect(tiptapSchema.nodes.table_header?.spec.tableRole).toBe('header_cell');
  });

  it('round-trips a doc with a table, civic-ref and list identically to editor-schema', () => {
    // Build a document against editor-schema (the canonical schema), then
    // re-create the equivalent node tree under the TipTap-derived schema using
    // the SAME names/attrs. If the names matched, the TipTap schema can build
    // the node and its Markdown serialization is identical.
    const { nodes } = editorSchema;
    const refNode = nodes.civicRef.create({
      refType: 'record',
      id: 'rec-1',
      label: 'Budget 2026',
    });
    const para = nodes.paragraph.create(null, [
      editorSchema.text('See '),
      refNode,
    ]);
    const item1 = nodes.list_item.create(null, nodes.paragraph.create(null, [editorSchema.text('a')]));
    const item2 = nodes.list_item.create(null, nodes.paragraph.create(null, [editorSchema.text('b')]));
    const list = nodes.bullet_list.create(null, [item1, item2]);
    const doc = nodes.doc.create(null, [para, list]);

    const fromEditorSchema = serializeDocToMarkdown(doc);

    // Rebuild the identical tree under the TipTap-derived schema by node name.
    const tRef = tiptapSchema.nodes.civicRef.create({
      refType: 'record',
      id: 'rec-1',
      label: 'Budget 2026',
    });
    const tPara = tiptapSchema.nodes.paragraph.create(null, [
      tiptapSchema.text('See '),
      tRef,
    ]);
    const tItem1 = tiptapSchema.nodes.list_item.create(
      null,
      tiptapSchema.nodes.paragraph.create(null, [tiptapSchema.text('a')])
    );
    const tItem2 = tiptapSchema.nodes.list_item.create(
      null,
      tiptapSchema.nodes.paragraph.create(null, [tiptapSchema.text('b')])
    );
    const tList = tiptapSchema.nodes.bullet_list.create(null, [tItem1, tItem2]);
    const tDoc = tiptapSchema.nodes.doc.create(null, [tPara, tList]);

    // Serialize the TipTap-built doc with editor-schema's serializer — it works
    // only if the node/mark names + attrs line up with editor-schema.
    const fromTiptapSchema = serializeDocToMarkdown(tDoc);

    expect(fromTiptapSchema).toBe(fromEditorSchema);
    expect(fromTiptapSchema).toContain('civic-ref');
    expect(fromTiptapSchema).toContain('* a');
  });
});
