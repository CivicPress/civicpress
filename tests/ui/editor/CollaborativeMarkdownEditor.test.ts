import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import * as Y from 'yjs';
import CollaborativeMarkdownEditor from '~/components/editor/CollaborativeMarkdownEditor.vue';

/**
 * CollaborativeMarkdownEditor wires TipTap (schema derived from
 * @civicpress/editor-schema) to a Yjs document + WebsocketProvider from
 * useRealtimeEditor, with the Collaboration + CollaborationCaret extensions.
 * These tests mock y-websocket (no real socket) and stub the runtime config +
 * auth store, then assert the realtime room, the Yjs/TipTap binding, and the
 * editor schema.
 */

// Minimal y-websocket mock with the surface TipTap's CollaborationCaret needs
// (`awareness`), plus the room/url/protocols surface useRealtimeEditor asserts.
const ywsMock = vi.hoisted(() => {
  class MockAwareness {
    public states = new Map<number, unknown>();
    public clientID = 1;
    private handlers = new Map<string, Array<(...a: unknown[]) => void>>();
    private local: Record<string, unknown> = {};
    setLocalStateField(field: string, value: unknown) {
      this.local[field] = value;
      this.states.set(this.clientID, this.local);
    }
    setLocalState(state: Record<string, unknown> | null) {
      this.local = state ?? {};
      this.states.set(this.clientID, this.local);
    }
    getLocalState() {
      return this.local;
    }
    getStates() {
      return this.states;
    }
    on(event: string, fn: (...a: unknown[]) => void) {
      const arr = this.handlers.get(event) ?? [];
      arr.push(fn);
      this.handlers.set(event, arr);
    }
    off() {}
    destroy() {}
  }

  class MockWebsocketProvider {
    public url: string;
    public roomName: string;
    public doc: unknown;
    public protocols: string[];
    public awareness = new MockAwareness();
    private listeners = new Map<string, Array<(payload: unknown) => void>>();
    constructor(
      serverUrl: string,
      roomName: string,
      doc: unknown,
      opts: { protocols?: string[] } = {}
    ) {
      this.roomName = roomName;
      this.doc = doc;
      this.protocols = opts?.protocols ?? [];
      let trimmed = serverUrl;
      while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
      this.url = `${trimmed}/${roomName}`;
    }
    on(event: string, fn: (payload: unknown) => void) {
      const arr = this.listeners.get(event) ?? [];
      arr.push(fn);
      this.listeners.set(event, arr);
    }
    off() {}
    destroy() {}
  }

  return {
    MockWebsocketProvider,
    lastInstance: null as InstanceType<typeof MockWebsocketProvider> | null,
    reset() {
      this.lastInstance = null;
    },
  };
});

vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn(
    (
      serverUrl: string,
      roomName: string,
      doc: unknown,
      opts: { protocols?: string[] } = {}
    ) => {
      const inst = new ywsMock.MockWebsocketProvider(
        serverUrl,
        roomName,
        doc,
        opts
      );
      ywsMock.lastInstance = inst;
      return inst;
    }
  ),
}));

const TOKEN = 'jwt-token-xyz';

function mountEditor(props: Record<string, unknown> = {}) {
  // Per-test runtime config + auth store stubs.
  globalThis.useRuntimeConfig = vi.fn(() => ({
    public: { realtimeWsUrl: 'wss://realtime.test' },
  }));
  globalThis.useAuthStore = vi.fn(() => ({
    token: TOKEN,
    user: { id: 7, name: 'Ada Civic', username: 'ada' },
  }));

  return mount(CollaborativeMarkdownEditor, {
    props: { recordId: 'rec-7', modelValue: '## Title\n\nBody.', ...props },
    global: {
      stubs: { ClientOnly: { template: '<div><slot /></div>' } },
    },
  });
}

describe('CollaborativeMarkdownEditor', () => {
  beforeEach(() => {
    ywsMock.reset();
    vi.clearAllMocks();
  });

  it('opens a realtime room for the record with the auth subprotocol', async () => {
    const wrapper = mountEditor({ recordId: 'rec-7' });
    await nextTick();

    const provider = ywsMock.lastInstance;
    expect(provider).not.toBeNull();
    expect(provider!.url).toBe('wss://realtime.test/realtime/records/rec-7');
    // Token comes from the auth store; sent as the auth.<token> subprotocol.
    expect(provider!.protocols).toEqual([`auth.${TOKEN}`]);

    wrapper.unmount();
  });

  it('binds TipTap Collaboration to the Y.Doc default fragment', async () => {
    const wrapper = mountEditor();
    await nextTick();

    const doc = ywsMock.lastInstance!.doc as Y.Doc;
    // The Collaboration extension binds to getXmlFragment('default') on init —
    // the SAME fragment the realtime server seeds + serializes. Its presence on
    // the shared doc proves the binding (and the server-compatible field name).
    expect(doc.share.has('default')).toBe(true);

    wrapper.unmount();
  });

  it('builds the editor from the editor-schema (tables + civic-ref + snake_case lists)', async () => {
    const wrapper = mountEditor();
    await nextTick();

    const vm = wrapper.vm as unknown as {
      getEditor: () => { schema: { nodes: Record<string, unknown> } };
    };
    const schema = vm.getEditor().schema;
    expect(schema.nodes.table).toBeDefined();
    expect(schema.nodes.civicRef).toBeDefined();
    expect(schema.nodes.bullet_list).toBeDefined();
    expect(schema.nodes.bulletList).toBeUndefined();

    wrapper.unmount();
  });

  it('renders an editable ProseMirror surface', async () => {
    const wrapper = mountEditor();
    await nextTick();
    expect(wrapper.find('.ProseMirror').exists()).toBe(true);

    wrapper.unmount();
  });

  it('exposes a focus() command compatible with the host editorRef', async () => {
    const wrapper = mountEditor();
    await nextTick();
    const vm = wrapper.vm as unknown as { focus: () => void };
    expect(typeof vm.focus).toBe('function');
    expect(() => vm.focus()).not.toThrow();

    wrapper.unmount();
  });

  // The toolbar command surface (heading / lists / blockquote / rule / link /
  // image) used to be no-ops in the collaborative path. They must now mutate the
  // shared document via TipTap CORE commands against editor-schema node/mark
  // names (the editor is built from editor-schema's raw specs, so the bundled
  // convenience commands are unavailable). We assert on the resulting document
  // structure rather than serialized Markdown to stay serializer-agnostic.
  const collectNodeNames = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor: any
  ): Set<string> => {
    const names = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.state.doc.descendants((n: any) => names.add(n.type.name));
    return names;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seedAndGet = (wrapper: ReturnType<typeof mountEditor>): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vm = wrapper.vm as any;
    vm.getEditor().commands.insertContent('Content');
    return vm;
  };

  it('executeHeading turns the block into a heading of the requested level', async () => {
    const wrapper = mountEditor();
    await nextTick();
    const vm = seedAndGet(wrapper);

    vm.executeHeading(2);

    let level: number | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vm.getEditor().state.doc.descendants((n: any) => {
      if (n.type.name === 'heading') level = n.attrs.level;
    });
    expect(level).toBe(2);

    wrapper.unmount();
  });

  it('executeBulletList / executeNumberedList wrap the block in the matching list', async () => {
    const bulletWrapper = mountEditor();
    await nextTick();
    const bulletVm = seedAndGet(bulletWrapper);
    bulletVm.executeBulletList();
    expect(collectNodeNames(bulletVm.getEditor()).has('bullet_list')).toBe(
      true
    );
    bulletWrapper.unmount();

    const orderedWrapper = mountEditor();
    await nextTick();
    const orderedVm = seedAndGet(orderedWrapper);
    orderedVm.executeNumberedList();
    expect(collectNodeNames(orderedVm.getEditor()).has('ordered_list')).toBe(
      true
    );
    orderedWrapper.unmount();
  });

  it('executeBlockquote and executeHorizontalRule insert their nodes', async () => {
    const quoteWrapper = mountEditor();
    await nextTick();
    const quoteVm = seedAndGet(quoteWrapper);
    quoteVm.executeBlockquote();
    expect(collectNodeNames(quoteVm.getEditor()).has('blockquote')).toBe(true);
    quoteWrapper.unmount();

    const ruleWrapper = mountEditor();
    await nextTick();
    const ruleVm = seedAndGet(ruleWrapper);
    ruleVm.executeHorizontalRule();
    expect(collectNodeNames(ruleVm.getEditor()).has('horizontal_rule')).toBe(
      true
    );
    ruleWrapper.unmount();
  });

  it('executeLink applies a link mark using the prompted URL', async () => {
    window.prompt = vi.fn(() => 'https://example.com');
    const wrapper = mountEditor();
    await nextTick();
    const vm = seedAndGet(wrapper);

    vm.executeLink();

    let href: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vm.getEditor().state.doc.descendants((n: any) => {
      if (n.isText) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mark = n.marks.find((m: any) => m.type.name === 'link');
        if (mark) href = mark.attrs.href;
      }
    });
    expect(href).toBe('https://example.com');

    wrapper.unmount();
  });

  it('executeImage inserts an image node with the prompted src', async () => {
    window.prompt = vi.fn(() => 'https://example.com/photo.png');
    const wrapper = mountEditor();
    await nextTick();
    const vm = seedAndGet(wrapper);

    vm.executeImage();

    let src: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vm.getEditor().state.doc.descendants((n: any) => {
      if (n.type.name === 'image') src = n.attrs.src;
    });
    expect(src).toBe('https://example.com/photo.png');

    wrapper.unmount();
  });

  it('link / image commands no-op when the prompt is cancelled', async () => {
    window.prompt = vi.fn(() => null);
    const wrapper = mountEditor();
    await nextTick();
    const vm = seedAndGet(wrapper);

    vm.executeLink();
    vm.executeImage();

    const names = collectNodeNames(vm.getEditor());
    expect(names.has('image')).toBe(false);
    let hasLink = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vm.getEditor().state.doc.descendants((n: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (n.isText && n.marks.some((m: any) => m.type.name === 'link')) {
        hasLink = true;
      }
    });
    expect(hasLink).toBe(false);

    wrapper.unmount();
  });
});
