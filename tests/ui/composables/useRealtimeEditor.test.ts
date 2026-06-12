import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { useRealtimeEditor } from '~/composables/useRealtimeEditor';

// The mock class + registry live in a vi.hoisted() block so they are available
// to the hoisted `vi.mock('y-websocket')` factory (which runs before normal
// module evaluation) and to the test bodies. Defining everything inline keeps
// the factory synchronous — a dynamic import inside the factory silently fell
// back to the real module, which opens a live socket in its constructor.
//
// MockWebsocketProvider mirrors the real WebsocketProvider:
//   - constructor (serverUrl, roomName, doc, { protocols })
//   - `.url` === serverUrl(trimmed) + '/' + roomName  (see y-websocket@3 src)
//   - on/off/emit for the 'status' and 'connection-close' channels
//   - a spy-able destroy()
const ywsMock = vi.hoisted(() => {
  class MockWebsocketProvider {
    public destroyed = false;
    public url: string;
    public roomName: string;
    public doc: unknown;
    public protocols: string[];
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

    emit(event: string, payload: unknown) {
      for (const fn of this.listeners.get(event) ?? []) fn(payload);
    }

    on(event: string, fn: (payload: unknown) => void) {
      const arr = this.listeners.get(event) ?? [];
      arr.push(fn);
      this.listeners.set(event, arr);
    }

    off(event: string, fn: (payload: unknown) => void) {
      const arr = this.listeners.get(event) ?? [];
      this.listeners.set(
        event,
        arr.filter((f) => f !== fn)
      );
    }

    destroy() {
      this.destroyed = true;
    }
  }

  return {
    MockWebsocketProvider,
    lastInstance: null as MockWebsocketProvider | null,
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

describe('useRealtimeEditor', () => {
  beforeEach(() => {
    ywsMock.reset();
  });

  it('opens a WebsocketProvider against /realtime/records/:id with auth subprotocol', () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt-token-here',
      wsUrl: 'wss://example.test',
    });

    const provider = ywsMock.lastInstance!;
    expect(provider).not.toBeNull();
    expect(provider.url).toBe('wss://example.test/realtime/records/abc-123');
    // Server-side extractToken reads the `auth.<token>` subprotocol first
    // (modules/realtime/src/auth.ts), so the client must send exactly that.
    expect(provider.protocols).toEqual(['auth.jwt-token-here']);

    editor.disconnect();
  });

  it('tolerates a wsUrl with a trailing slash', () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test/',
    });

    const provider = ywsMock.lastInstance!;
    expect(provider.url).toBe('wss://example.test/realtime/records/abc-123');

    editor.disconnect();
  });

  it('exposes connectionState as a reactive ref driven by status events', async () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    });

    expect(editor.connectionState.value).toBe('connecting');

    ywsMock.lastInstance!.emit('status', {
      status: 'connected',
    });
    await nextTick();
    expect(editor.connectionState.value).toBe('connected');

    ywsMock.lastInstance!.emit('status', {
      status: 'disconnected',
    });
    await nextTick();
    expect(editor.connectionState.value).toBe('disconnected');

    editor.disconnect();
  });

  it('maps close codes to user-readable connectionError messages', async () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    });

    ywsMock.lastInstance!.emit('connection-close', {
      code: 4001,
    });
    await nextTick();
    expect(editor.connectionError.value).toMatch(/session expired/i);
    expect(editor.connectionState.value).toBe('failed');

    ywsMock.lastInstance!.emit('connection-close', {
      code: 4003,
    });
    await nextTick();
    expect(editor.connectionError.value).toMatch(/permission/i);

    ywsMock.lastInstance!.emit('connection-close', {
      code: 4004,
    });
    await nextTick();
    expect(editor.connectionError.value).toMatch(/not found/i);

    ywsMock.lastInstance!.emit('connection-close', {
      code: 4029,
    });
    await nextTick();
    expect(editor.connectionError.value).toMatch(/too many active sessions/i);

    editor.disconnect();
  });

  it('treats a normal close (1000) as disconnected, not failed, with no error', async () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    });

    ywsMock.lastInstance!.emit('connection-close', {
      code: 1000,
    });
    await nextTick();
    expect(editor.connectionState.value).toBe('disconnected');
    expect(editor.connectionError.value).toBeNull();

    editor.disconnect();
  });

  it('disconnect() destroys both the provider and the yDoc', () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    });

    const provider = ywsMock.lastInstance!;
    const providerDestroy = vi.spyOn(provider, 'destroy');
    const docDestroy = vi.spyOn(editor.yDoc, 'destroy');

    editor.disconnect();

    expect(providerDestroy).toHaveBeenCalled();
    expect(docDestroy).toHaveBeenCalled();
  });

  it('provides a deterministic, client-side participant-color palette (realtime-007)', () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    });

    // Same user id → same color (deterministic); valid hex.
    expect(editor.pickUserColor('user-1')).toBe(editor.pickUserColor('user-1'));
    expect(editor.pickUserColor('user-1')).toMatch(/^#[0-9a-f]{6}$/i);

    editor.disconnect();
  });

  it('does NOT reintroduce manual reconnection scaffolding (regression: realtime-008)', () => {
    const editor = useRealtimeEditor({
      recordId: 'abc-123',
      token: 'jwt',
      wsUrl: 'wss://example.test',
    });

    expect(
      (editor as unknown as { MAX_RECONNECT_ATTEMPTS?: number })
        .MAX_RECONNECT_ATTEMPTS
    ).toBeUndefined();
    expect(
      (editor as unknown as { RECONNECT_DELAYS?: number[] }).RECONNECT_DELAYS
    ).toBeUndefined();
    expect(
      (editor as unknown as { reconnect?: unknown }).reconnect
    ).toBeUndefined();

    editor.disconnect();
  });
});
