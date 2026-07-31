import type { ApiResponse } from '~/utils/api-response';

export interface OperatorNotification {
  id: number;
  type: string;
  severity: 'info' | 'warning' | 'critical' | 'action';
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  status: 'unread' | 'read' | 'dismissed';
  createdAt?: string;
}

interface ListResponse {
  notifications: OperatorNotification[];
  total: number;
  unread: number;
}

/**
 * Operator notification center client. Shared unread count via useState so the
 * sidebar badge and the notifications page stay in sync. Admin-only endpoints
 * (system:admin) — callers should be gated by the require-admin middleware.
 */
export function useOperatorNotifications() {
  const { $civicApi } = useNuxtApp();
  const authStore = useAuthStore();

  // App-wide shared state (badge + page read the same value).
  const unread = useState<number>('operator-unread', () => 0);

  const notifications = ref<OperatorNotification[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref('');

  const canView = computed(() => authStore.hasPermission('system:admin'));

  async function refreshUnread(): Promise<void> {
    if (!canView.value) return;
    try {
      const res = (await $civicApi(
        '/api/v1/admin/notifications/unread-count'
      )) as ApiResponse<{ unread: number }>;
      if (res.success) unread.value = res.data.unread;
    } catch {
      // Non-fatal: the badge simply keeps its last value.
    }
  }

  async function list(
    query: { status?: string; type?: string; severity?: string; limit?: number } = {}
  ): Promise<void> {
    if (!canView.value) return;
    loading.value = true;
    error.value = '';
    try {
      const res = (await $civicApi('/api/v1/admin/notifications', {
        query,
      })) as ApiResponse<ListResponse>;
      if (res.success) {
        notifications.value = res.data.notifications;
        total.value = res.data.total;
        unread.value = res.data.unread;
      } else {
        error.value = 'Failed to load notifications';
      }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to load notifications';
    } finally {
      loading.value = false;
    }
  }

  async function markRead(id: number): Promise<void> {
    await $civicApi(`/api/v1/admin/notifications/${id}/read`, { method: 'POST' });
    await refreshUnread();
  }

  async function dismiss(id: number): Promise<void> {
    await $civicApi(`/api/v1/admin/notifications/${id}/dismiss`, {
      method: 'POST',
    });
    await refreshUnread();
  }

  async function markAllRead(): Promise<void> {
    await $civicApi('/api/v1/admin/notifications/read-all', { method: 'POST' });
    await refreshUnread();
  }

  return {
    notifications,
    total,
    unread,
    loading,
    error,
    canView,
    refreshUnread,
    list,
    markRead,
    dismiss,
    markAllRead,
  };
}
