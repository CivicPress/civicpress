/**
 * useRealtimeEditor Composable
 *
 * Manages real-time collaborative editing connections for records using Yjs.
 * Provides WebSocket provider, connection status, and collaborator presence.
 */

import { ref, computed, onUnmounted, shallowRef, watch } from 'vue';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useAuthStore } from '~/stores/auth';

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  cursor?: { anchor: number; head: number } | null;
}

export interface RealtimeEditorOptions {
  /**
   * Whether to automatically connect when the composable is created
   * @default false
   */
  autoConnect?: boolean;

  /**
   * Callback when connection is established
   */
  onConnect?: () => void;

  /**
   * Callback when connection is lost
   */
  onDisconnect?: () => void;

  /**
   * Callback when a connection error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Callback when connection status changes
   */
  onStatusChange?: (
    status: 'connecting' | 'connected' | 'disconnected'
  ) => void;

  /**
   * Callback when collaborators change
   */
  onCollaboratorsChange?: (collaborators: Collaborator[]) => void;
}

// Generate a random color for the current user
function generateUserColor(): string {
  const colors = [
    '#F44336',
    '#E91E63',
    '#9C27B0',
    '#673AB7',
    '#3F51B5',
    '#2196F3',
    '#03A9F4',
    '#00BCD4',
    '#009688',
    '#4CAF50',
    '#8BC34A',
    '#CDDC39',
    '#FFC107',
    '#FF9800',
    '#FF5722',
    '#795548',
  ];
  return colors[Math.floor(Math.random() * colors.length)] || '#3F51B5';
}

export function useRealtimeEditor(
  recordId: string | (() => string),
  options: RealtimeEditorOptions = {}
) {
  const config = useRuntimeConfig();
  const authStore = useAuthStore();

  // Reactive record ID
  const getRecordId = () =>
    typeof recordId === 'function' ? recordId() : recordId;

  // Yjs document (shared across all collaborators)
  const yjsDoc = shallowRef(new Y.Doc());

  // WebSocket provider
  const wsProvider = shallowRef<WebsocketProvider | null>(null);

  // Connection status
  const connectionStatus = ref<'connecting' | 'connected' | 'disconnected'>(
    'disconnected'
  );

  // Collaborators currently editing
  const collaborators = ref<Collaborator[]>([]);

  // Current user info
  const currentUser = computed(() => ({
    id: String(authStore.user?.id || 'anonymous'),
    name: authStore.user?.name || authStore.user?.username || 'Anonymous',
    color: generateUserColor(),
  }));

  // Track if we're connected
  const isConnected = computed(() => connectionStatus.value === 'connected');

  // Track reconnection attempts
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

  /**
   * Get the WebSocket URL for the realtime server
   */
  function getRealtimeUrl(): string {
    // Extract host from API URL
    const apiUrl = config.public.civicApiUrl || 'http://localhost:3000';
    const url = new URL(apiUrl);
    // Realtime server runs on port 3001
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.hostname}:3001`;
  }

  /**
   * Update collaborators list from awareness
   */
  function updateCollaborators() {
    if (!wsProvider.value) return;

    const awareness = wsProvider.value.awareness;
    const states = awareness.getStates();
    const newCollaborators: Collaborator[] = [];

    states.forEach((state, clientId) => {
      // Skip if no user info or if it's the current client
      if (!state.user || clientId === awareness.clientID) return;

      newCollaborators.push({
        id: String(clientId),
        name: state.user.name || 'Anonymous',
        color: state.user.color || '#888888',
        cursor: state.cursor || null,
      });
    });

    collaborators.value = newCollaborators;
    options.onCollaboratorsChange?.(newCollaborators);
  }

  /**
   * Set connection status and trigger callback
   */
  function setStatus(status: 'connecting' | 'connected' | 'disconnected') {
    connectionStatus.value = status;
    options.onStatusChange?.(status);
  }

  /**
   * Connect to the realtime server
   */
  async function connect(): Promise<void> {
    const id = getRecordId();
    if (!id) {
      console.warn('[useRealtimeEditor] No record ID provided, cannot connect');
      return;
    }

    // Check authentication
    if (!authStore.isAuthenticated || !authStore.token) {
      console.warn('[useRealtimeEditor] Not authenticated, cannot connect');
      return;
    }

    // Already connected or connecting
    if (wsProvider.value) {
      if (wsProvider.value.wsconnected) {
        console.log('[useRealtimeEditor] Already connected');
        return;
      }
      // Destroy existing provider before creating new one
      disconnect();
    }

    setStatus('connecting');

    const realtimeUrl = getRealtimeUrl();
    const roomName = `records:${id}`;
    const token = authStore.token;

    console.log(
      `[useRealtimeEditor] Connecting to ${realtimeUrl}/realtime/records/${id}`
    );

    try {
      // Create WebSocket provider with authentication
      // y-websocket uses WebSocket URL directly, we pass token via subprotocol
      const provider = new WebsocketProvider(
        realtimeUrl,
        roomName,
        yjsDoc.value,
        {
          // Pass auth token as WebSocket subprotocol
          protocols: [token],
          // Enable awareness for presence
          awareness: undefined, // Will be created automatically
          // Connection options
          connect: true,
          resyncInterval: 30000, // Resync every 30 seconds
        }
      );

      // Set up awareness with current user info
      provider.awareness.setLocalStateField('user', {
        name: currentUser.value.name,
        color: currentUser.value.color,
        id: currentUser.value.id,
      });

      // Listen for awareness changes
      provider.awareness.on('change', updateCollaborators);

      // Connection status handlers
      provider.on('status', (event: { status: string }) => {
        console.log(`[useRealtimeEditor] Status: ${event.status}`);

        if (event.status === 'connected') {
          setStatus('connected');
          reconnectAttempts = 0;
          options.onConnect?.();
        } else if (event.status === 'disconnected') {
          setStatus('disconnected');
          options.onDisconnect?.();
        }
      });

      // Sync event
      provider.on('sync', (isSynced: boolean) => {
        console.log(
          `[useRealtimeEditor] Sync: ${isSynced ? 'synced' : 'syncing'}`
        );
      });

      // Connection close handler for reconnection
      provider.on(
        'connection-close',
        (event: CloseEvent | null, _provider: WebsocketProvider) => {
          const code = event?.code ?? 0;
          const reason = event?.reason ?? '';
          console.log(
            `[useRealtimeEditor] Connection closed: ${code} ${reason}`
          );

          // Handle reconnection with exponential backoff
          if (code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay =
              RECONNECT_DELAYS[reconnectAttempts] ||
              RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
            reconnectAttempts++;

            console.log(
              `[useRealtimeEditor] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
            );

            setTimeout(() => {
              if (!wsProvider.value?.wsconnected) {
                connect();
              }
            }, delay);
          }
        }
      );

      wsProvider.value = provider;

      // Initial collaborators update
      updateCollaborators();
    } catch (error) {
      console.error('[useRealtimeEditor] Connection error:', error);
      setStatus('disconnected');
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(err);
      throw error;
    }
  }

  /**
   * Disconnect from the realtime server
   */
  function disconnect(): void {
    if (wsProvider.value) {
      console.log('[useRealtimeEditor] Disconnecting');

      // Remove awareness listener
      wsProvider.value.awareness.off('change', updateCollaborators);

      // Destroy provider
      wsProvider.value.destroy();
      wsProvider.value = null;

      // Clear collaborators
      collaborators.value = [];

      setStatus('disconnected');
    }
  }

  /**
   * Force reconnection
   */
  async function reconnect(): Promise<void> {
    disconnect();
    reconnectAttempts = 0;
    await connect();
  }

  /**
   * Get the Yjs text type for the editor content
   * This is used by TipTap Collaboration extension
   */
  function getYjsText(name = 'content'): Y.XmlFragment {
    return yjsDoc.value.getXmlFragment(name);
  }

  // Auto-connect if requested
  if (options.autoConnect && process.client) {
    connect();
  }

  // Cleanup on unmount
  if (process.client) {
    onUnmounted(() => {
      disconnect();
    });
  }

  return {
    // Yjs document
    yjsDoc,
    getYjsText,

    // WebSocket provider (for TipTap collaboration cursor)
    wsProvider,

    // Connection state
    connectionStatus,
    isConnected,

    // Collaborators
    collaborators,
    currentUser,

    // Actions
    connect,
    disconnect,
    reconnect,
  };
}
