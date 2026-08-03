<script setup lang="ts">
import type { OperatorNotification } from '~/composables/useOperatorNotifications';

const { t } = useI18n();
const {
  notifications,
  total,
  unread,
  loading,
  error,
  list,
  markRead,
  dismiss,
  markAllRead,
} = useOperatorNotifications();

definePageMeta({
  middleware: ['require-auth', 'require-admin'],
});

const statusFilter = ref<'unread' | 'all'>('unread');
const query = computed(() =>
  statusFilter.value === 'unread' ? { status: 'unread' } : {}
);

async function refresh() {
  await list(query.value);
}

watch(statusFilter, refresh);
onMounted(refresh);

function severityColor(
  s: OperatorNotification['severity']
): 'neutral' | 'warning' | 'error' | 'primary' {
  return s === 'critical'
    ? 'error'
    : s === 'warning'
      ? 'warning'
      : s === 'action'
        ? 'primary'
        : 'neutral';
}
function severityIcon(s: OperatorNotification['severity']): string {
  return s === 'critical'
    ? 'i-lucide-octagon-alert'
    : s === 'warning'
      ? 'i-lucide-triangle-alert'
      : s === 'action'
        ? 'i-lucide-circle-dot'
        : 'i-lucide-info';
}

function formatDate(d?: string): string {
  if (!d) return '';
  return new Date(d).toLocaleString();
}

// A reset-request task links straight to the user's set-password action.
function resetTargetUsername(n: OperatorNotification): string | undefined {
  if (n.type !== 'password_reset_request') return undefined;
  const u = n.data?.username;
  return typeof u === 'string' ? u : undefined;
}

async function onMarkRead(id: number) {
  await markRead(id);
  await refresh();
}
async function onDismiss(id: number) {
  await dismiss(id);
  await refresh();
}
async function onMarkAllRead() {
  await markAllRead();
  await refresh();
}

const breadcrumbItems = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('common.settings'), to: '/settings' },
  { label: t('settings.alerts.title') },
]);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="t('settings.alerts.title')">
        <template #right>
          <UButton
            v-if="unread > 0"
            color="neutral"
            variant="outline"
            icon="i-lucide-check-check"
            :label="t('settings.alerts.markAllRead')"
            @click="onMarkAllRead"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" class="mb-4" />

      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-muted">
          {{ t('settings.alerts.description') }}
        </p>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :icon="statusFilter === 'unread' ? 'i-lucide-eye' : 'i-lucide-list'"
          :label="
            statusFilter === 'unread'
              ? t('settings.alerts.showAll')
              : t('settings.alerts.showUnread')
          "
          @click="statusFilter = statusFilter === 'unread' ? 'all' : 'unread'"
        />
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="error"
        icon="i-lucide-alert-triangle"
        class="mb-4"
      />

      <div v-if="loading" class="py-12 text-center text-muted">
        <UIcon name="i-lucide-loader-circle" class="animate-spin w-6 h-6" />
      </div>

      <div
        v-else-if="notifications.length === 0"
        class="py-16 text-center space-y-2"
      >
        <UIcon name="i-lucide-bell-off" class="w-12 h-12 mx-auto text-gray-400" />
        <p class="text-muted">{{ t('settings.alerts.empty') }}</p>
      </div>

      <div v-else class="space-y-3">
        <UCard v-for="n in notifications" :key="n.id" :ui="{ body: 'sm:p-4' }">
          <div class="flex items-start gap-3">
            <UIcon
              :name="severityIcon(n.severity)"
              :class="`w-5 h-5 mt-0.5 shrink-0 text-${severityColor(n.severity)}`"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-gray-900 dark:text-white">
                  {{ n.title }}
                </span>
                <UBadge
                  v-if="n.status === 'unread'"
                  size="xs"
                  color="primary"
                  variant="subtle"
                  :label="t('settings.alerts.unreadBadge')"
                />
                <UBadge
                  size="xs"
                  :color="severityColor(n.severity)"
                  variant="soft"
                  :label="n.severity"
                />
              </div>
              <p v-if="n.body" class="text-sm text-muted mt-1">{{ n.body }}</p>
              <p class="text-xs text-muted mt-1">{{ formatDate(n.createdAt) }}</p>

              <div class="flex items-center gap-2 mt-3">
                <UButton
                  v-if="resetTargetUsername(n)"
                  size="xs"
                  color="primary"
                  variant="soft"
                  icon="i-lucide-key-round"
                  :label="t('settings.alerts.setPassword')"
                  :to="`/settings/users/${resetTargetUsername(n)}`"
                />
                <UButton
                  v-if="n.status === 'unread'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-check"
                  :label="t('settings.alerts.markRead')"
                  @click="onMarkRead(n.id)"
                />
                <UButton
                  v-if="n.status !== 'dismissed'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  :label="t('settings.alerts.dismiss')"
                  @click="onDismiss(n.id)"
                />
              </div>
            </div>
          </div>
        </UCard>

        <p class="text-xs text-muted text-center pt-2">
          {{ t('settings.alerts.countSummary', { total, unread }) }}
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
