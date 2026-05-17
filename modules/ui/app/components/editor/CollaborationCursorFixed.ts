/**
 * Fixed CollaborationCursor extension for TipTap v3.
 *
 * The official @tiptap/extension-collaboration-cursor v3.0.0 imports yCursorPlugin
 * from 'y-prosemirror', but @tiptap/extension-collaboration v3.19.0 uses
 * '@tiptap/y-tiptap' (TipTap's own fork). These use different ySyncPluginKey
 * constants, causing the cursor plugin to fail with "ystate.doc is undefined".
 *
 * This extension re-implements the cursor using yCursorPlugin from '@tiptap/y-tiptap'
 * so both plugins share the same ySyncPluginKey.
 */

import { Extension } from '@tiptap/core';
import { yCursorPlugin, defaultSelectionBuilder } from '@tiptap/y-tiptap';

export interface CollaborationCursorOptions {
  provider: any;
  user: Record<string, any>;
  render(user: Record<string, any>): HTMLElement;
  selectionRender(user: Record<string, any>): any;
}

const awarenessStatesToArray = (states: Map<number, Record<string, any>>) => {
  return Array.from(states.entries()).map(([key, value]) => {
    return {
      clientId: key,
      ...value.user,
    };
  });
};

export const CollaborationCursorFixed = Extension.create<
  CollaborationCursorOptions,
  { users: { clientId: number; [key: string]: any }[] }
>({
  name: 'collaborationCursor',

  addOptions() {
    return {
      provider: null,
      user: {
        name: null,
        color: null,
      },
      render: (user: Record<string, any>) => {
        const cursor = document.createElement('span');
        cursor.classList.add('collaboration-cursor__caret');
        cursor.setAttribute('style', `border-color: ${user.color}`);

        const label = document.createElement('div');
        label.classList.add('collaboration-cursor__label');
        label.setAttribute('style', `background-color: ${user.color}`);
        label.insertBefore(document.createTextNode(user.name), null);
        cursor.insertBefore(label, null);

        return cursor;
      },
      selectionRender: defaultSelectionBuilder,
    };
  },

  addStorage() {
    return {
      users: [],
    };
  },

  addProseMirrorPlugins() {
    return [
      yCursorPlugin(
        (() => {
          this.options.provider.awareness.setLocalStateField(
            'user',
            this.options.user
          );

          this.storage.users = awarenessStatesToArray(
            this.options.provider.awareness.states
          );

          this.options.provider.awareness.on('update', () => {
            this.storage.users = awarenessStatesToArray(
              this.options.provider.awareness.states
            );
          });

          return this.options.provider.awareness;
        })(),
        {
          cursorBuilder: this.options.render,
          selectionBuilder: this.options.selectionRender,
        }
      ),
    ];
  },
});
