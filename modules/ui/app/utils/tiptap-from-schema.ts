import { Extension, Mark, Node, type Extensions } from '@tiptap/core';
import { keymap } from '@tiptap/pm/keymap';
import { baseKeymap } from '@tiptap/pm/commands';
import { dropCursor } from '@tiptap/pm/dropcursor';
import { gapCursor } from '@tiptap/pm/gapcursor';
import {
  goToNextCell,
  tableEditing,
} from '@tiptap/pm/tables';
import type { MarkSpec, NodeSpec } from '@tiptap/pm/model';
import { editorSchema } from '@civicpress/editor-schema';

/**
 * Build the TipTap extension set for the CivicPress collaborative editor
 * directly from `@civicpress/editor-schema`.
 *
 * Why derive from editor-schema instead of TipTap's StarterKit:
 *
 *  - The realtime server serializes the shared Yjs `default` fragment back to
 *    the canonical Markdown file using `editorSchema`. The editor MUST write
 *    nodes/marks with the SAME names and attributes, or the server-side
 *    reconstruction (yXmlFragmentToProseMirrorRootNode against editorSchema)
 *    drops or mangles them. TipTap's bundled nodes use camelCase names
 *    (bulletList, codeBlock, tableCell) that editor-schema (snake_case:
 *    bullet_list, code_block, table_cell) cannot reconstruct.
 *  - editor-schema also carries CivicPress-specific schema (the civicRef inline
 *    atom, code_block.params, GFM table cell `align`) and GFM tables, which
 *    StarterKit does not include at all.
 *
 * TipTap builds its ProseMirror schema from extension config fields
 * (getSchemaByResolvedExtensions). We bypass TipTap's per-field plumbing and
 * inject each node/mark's COMPILED ProseMirror spec verbatim via
 * `extendNodeSchema` / `extendMarkSchema`, guarded by name so a given
 * extension only contributes its own spec. Because we provide no
 * `parseHTML`/`renderHTML`/`addAttributes`, TipTap leaves the injected
 * `parseDOM`/`toDOM`/`attrs` untouched — yielding a TipTap schema that is
 * structurally identical to editorSchema.
 */

/**
 * TipTap derives most schema fields from dedicated config fields (content,
 * group, inline, atom, marks, …) and OVERWRITES them in its schema item even
 * when the config returns undefined — so those fields must be supplied via
 * config, not via `extendNodeSchema` (which would be clobbered). The two fields
 * TipTap does NOT read from config — `parseDOM`/`toDOM` (it only sets them when
 * a `parseHTML`/`renderHTML` is present, which we deliberately omit) and
 * `tableRole` — are injected via `extendNodeSchema`/`extendMarkSchema` instead.
 * `attrs` is forwarded through `addAttributes()` (TipTap's attr channel).
 */

type SpecRecord = Record<string, unknown>;

/** Build TipTap's `addAttributes()` return value from a ProseMirror attrs spec. */
function attributesFromSpec(spec: SpecRecord): Record<
  string,
  { default: unknown }
> {
  const attrs = spec.attrs as
    | Record<string, { default?: unknown }>
    | undefined;
  if (!attrs) return {};
  const out: Record<string, { default: unknown }> = {};
  for (const [attrName, def] of Object.entries(attrs)) {
    out[attrName] = { default: def?.default ?? null };
  }
  return out;
}

/** Create a TipTap Node extension that contributes editor-schema's spec for `name`. */
function nodeFromSpec(name: string, spec: NodeSpec, isTopNode: boolean): Node {
  const s = spec as unknown as SpecRecord;
  return Node.create({
    name,
    topNode: isTopNode,
    content: s.content as string | undefined,
    marks: s.marks as string | undefined,
    group: s.group as string | undefined,
    inline: s.inline as boolean | undefined,
    atom: s.atom as boolean | undefined,
    selectable: s.selectable as boolean | undefined,
    draggable: s.draggable as boolean | undefined,
    code: s.code as boolean | undefined,
    whitespace: s.whitespace as 'pre' | 'normal' | undefined,
    defining: s.defining as boolean | undefined,
    isolating: s.isolating as boolean | undefined,
    addAttributes() {
      return attributesFromSpec(s);
    },
    // parseDOM/toDOM/tableRole are not config-derived — inject the compiled
    // spec's own. Guard on name so the per-node fields are only contributed when
    // TipTap is building THIS node (the loop calls every extension's
    // extendNodeSchema for every node).
    extendNodeSchema(extension) {
      if (extension.name !== name) return {};
      const injected: SpecRecord = {};
      if (s.parseDOM !== undefined) injected.parseDOM = s.parseDOM;
      if (s.toDOM !== undefined) injected.toDOM = s.toDOM;
      if (s.tableRole !== undefined) injected.tableRole = s.tableRole;
      return injected;
    },
  });
}

/** Create a TipTap Mark extension that contributes editor-schema's spec for `name`. */
function markFromSpec(name: string, spec: MarkSpec): Mark {
  const s = spec as unknown as SpecRecord;
  return Mark.create({
    name,
    inclusive: s.inclusive as boolean | undefined,
    excludes: s.excludes as string | undefined,
    group: s.group as string | undefined,
    spanning: s.spanning as boolean | undefined,
    code: s.code as boolean | undefined,
    addAttributes() {
      return attributesFromSpec(s);
    },
    extendMarkSchema(extension) {
      if (extension.name !== name) return {};
      const injected: SpecRecord = {};
      if (s.parseDOM !== undefined) injected.parseDOM = s.parseDOM;
      if (s.toDOM !== undefined) injected.toDOM = s.toDOM;
      return injected;
    },
  });
}

/**
 * Editor behaviour that does NOT affect the schema: the base ProseMirror
 * keymap (Enter/Backspace/Delete/etc.), drop + gap cursors, and table editing
 * (cell selection, Tab/Shift-Tab navigation). Document history is intentionally
 * omitted — the Collaboration extension supplies Yjs-backed undo/redo.
 */
function behaviorExtension(): Extension {
  return Extension.create({
    name: 'civicEditorBehavior',
    addProseMirrorPlugins() {
      return [
        keymap({
          Tab: goToNextCell(1),
          'Shift-Tab': goToNextCell(-1),
        }),
        keymap(baseKeymap),
        dropCursor(),
        gapCursor(),
        tableEditing(),
      ];
    },
  });
}

/**
 * The full extension set: one extension per editor-schema node and mark, plus
 * the behaviour extension. `topNode` is set on editor-schema's `doc` node so
 * TipTap uses it as the document root.
 */
export function buildTiptapExtensionsFromSchema(): Extensions {
  const topNodeName = editorSchema.spec.topNode ?? 'doc';
  const extensions: Extensions = [];

  editorSchema.spec.nodes.forEach((name: string, spec: NodeSpec) => {
    extensions.push(nodeFromSpec(name, spec, name === topNodeName));
  });

  editorSchema.spec.marks.forEach((name: string, spec: MarkSpec) => {
    extensions.push(markFromSpec(name, spec));
  });

  extensions.push(behaviorExtension());
  return extensions;
}
