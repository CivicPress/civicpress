import { ref, onUnmounted, getCurrentInstance } from 'vue';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface UseRealtimeEditorOptions {
  /** Record id; becomes the room: /realtime/records/<recordId>. */
  recordId: string;
  /** Session token, sent to the server as the `auth.<token>` subprotocol. */
  token: string;
  /** WebSocket origin, e.g. `wss://example.test` (no trailing path needed). */
  wsUrl: string;
}

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed';

/**
 * Local participant-color palette.
 *
 * Colors are assigned entirely client-side: the realtime server has no
 * participant-color concept (realtime-007 removed it). `pickUserColor` is
 * deterministic per user id so a given collaborator keeps the same color
 * across reconnects and across other clients' views.
 */
const PARTICIPANT_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#06b6d4',
  '#84cc16',
  '#6366f1',
  '#f43f5e',
  '#0ea5e9',
  '#a855f7',
  '#22c55e',
  '#eab308',
];

function pickUserColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0;
  }
  const color = PARTICIPANT_COLORS[Math.abs(h) % PARTICIPANT_COLORS.length];
  // PARTICIPANT_COLORS is non-empty, so this is always defined; the fallback
  // keeps the return type a plain string for strict consumers.
  return color ?? PARTICIPANT_COLORS[0]!;
}

/**
 * Maps the server's WebSocket close codes (spec §7.1) to user-readable
 * messages. Codes 4500/4503 are transient — y-websocket reconnects on its
 * own, so the copy says so rather than presenting a dead end.
 */
const CLOSE_CODE_MESSAGES: Record<number, string> = {
  4001: 'Your session expired. Please reload.',
  4003: "You don't have permission to edit this record.",
  4004: 'Record not found.',
  4013: 'Too many edits at once. Try again in a moment.',
  4029: 'Too many active sessions from this account.',
  4500: 'Connection lost. Reconnecting...',
  4503: 'Server is restarting. Reconnecting...',
};

/** Normal closure — not an error condition. */
const NORMAL_CLOSE_CODE = 1000;

/**
 * Opens a Yjs collaborative editing session for a record over y-websocket.
 *
 * Reconnection is delegated entirely to y-websocket; this composable
 * deliberately carries NO manual reconnect scaffolding (no
 * MAX_RECONNECT_ATTEMPTS / RECONNECT_DELAYS / reconnect()) — that dead
 * broadcast-box machinery was the realtime-008 finding and is not
 * reintroduced here.
 */
export function useRealtimeEditor(opts: UseRealtimeEditorOptions) {
  const yDoc = new Y.Doc();

  // y-websocket appends the room name to the server URL as a path segment, so
  // the server URL carries the fixed prefix and the record id is the room.
  // Result connect URL: `<wsUrl>/realtime/records/<recordId>`. Strip a trailing
  // slash from wsUrl first so a configured origin like `wss://host/` does not
  // produce a `//realtime` double slash.
  const base = opts.wsUrl.replace(/\/+$/, '');
  const serverUrl = `${base}/realtime/records`;
  const roomName = opts.recordId;

  const provider = new WebsocketProvider(serverUrl, roomName, yDoc, {
    // Server-side extractToken reads the `auth.<token>` subprotocol first
    // (modules/realtime/src/auth.ts). The browser WebSocket API can only send
    // auth via subprotocol, so this is the contract.
    protocols: [`auth.${opts.token}`],
  });

  const connectionState = ref<ConnectionState>('connecting');
  const connectionError = ref<string | null>(null);

  provider.on('status', (event: { status: string }) => {
    if (event.status === 'connected') {
      connectionState.value = 'connected';
      connectionError.value = null;
    } else if (event.status === 'connecting') {
      connectionState.value = 'connecting';
    } else if (event.status === 'disconnected') {
      connectionState.value = 'disconnected';
    }
  });

  provider.on('connection-close', (event: CloseEvent | null) => {
    const code = event?.code ?? 0;
    if (code === NORMAL_CLOSE_CODE) {
      connectionState.value = 'disconnected';
      connectionError.value = null;
      return;
    }
    connectionError.value =
      CLOSE_CODE_MESSAGES[code] ?? 'Connection lost.';
    connectionState.value = 'failed';
  });

  const disconnect = () => {
    provider.destroy();
    yDoc.destroy();
  };

  const instance = getCurrentInstance();
  if (instance) {
    onUnmounted(() => disconnect());
  }

  return {
    yDoc,
    provider,
    connectionState,
    connectionError,
    disconnect,
    pickUserColor,
  };
}
