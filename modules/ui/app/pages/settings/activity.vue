<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('settings.activity.title') }}
          </h1>
        </template>
        <template #description>{{
          t('settings.activity.description')
        }}</template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb
        :items="[
          { label: t('common.home'), to: '/' },
          { label: t('settings.title'), to: '/settings' },
          { label: t('settings.activity.title') },
        ]"
      />

      <UCard class="mt-6">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium">
                {{ t('settings.activity.recentEntries') }}
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ t('settings.activity.latestEvents', { count: limit }) }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <USelect
                v-model="filters.source"
                :items="sourceOptions"
                class="w-28"
              />
              <USelect
                v-model="filters.outcome"
                :items="outcomeOptions"
                class="w-28"
              />
              <UInput
                v-model="filters.actor"
                :placeholder="t('settings.activity.actorPlaceholder')"
                class="w-40"
              />
              <UInput
                v-model="filters.action"
                :placeholder="t('settings.activity.actionPlaceholder')"
                class="w-40"
              />
              <UInput
                v-model.number="limit"
                type="number"
                min="10"
                max="500"
                class="w-24"
              />
              <UButton @click="load(0)" :loading="loading" variant="outline">{{
                t('common.apply')
              }}</UButton>
            </div>
          </div>
        </template>

        <div
          v-if="loading"
          class="py-8 text-center text-sm text-gray-600 dark:text-gray-400"
        >
          {{ t('common.loading') }}
        </div>
        <div
          v-else-if="error"
          class="py-8 text-center text-sm text-red-600 dark:text-red-400"
        >
          {{ error }}
        </div>
        <div v-else class="overflow-auto">
          <table class="min-w-full text-sm">
            <thead class="text-left text-gray-600 dark:text-gray-400">
              <tr>
                <th class="py-2 pr-4">{{ t('settings.activity.time') }}</th>
                <th class="py-2 pr-4">{{ t('settings.activity.actor') }}</th>
                <th class="py-2 pr-4">{{ t('settings.activity.action') }}</th>
                <th class="py-2 pr-4">{{ t('settings.activity.target') }}</th>
                <th class="py-2 pr-4">{{ t('settings.activity.outcome') }}</th>
                <th class="py-2 pr-4">{{ t('settings.activity.message') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in items"
                :key="item.id"
                class="border-t border-gray-200 dark:border-gray-800"
              >
                <td class="py-2 pr-4 whitespace-nowrap">
                  {{ formatTime(item.timestamp) }}
                </td>
                <td class="py-2 pr-4">{{ formatActor(item.actor) }}</td>
                <td class="py-2 pr-4">{{ item.action }}</td>
                <td class="py-2 pr-4">{{ formatTarget(item.target) }}</td>
                <td class="py-2 pr-4">
                  <UBadge
                    :color="item.outcome === 'success' ? 'primary' : 'error'"
                    variant="soft"
                    >{{ item.outcome }}</UBadge
                  >
                </td>
                <td class="py-2 pr-4 truncate max-w-[320px]">
                  {{ item.message || '' }}
                </td>
              </tr>
            </tbody>
          </table>
          <div class="flex items-center justify-between py-3">
            <UButton :disabled="page <= 0" @click="prevPage" variant="ghost">{{
              t('common.previous')
            }}</UButton>
            <span class="text-xs text-gray-500">{{
              t('settings.activity.paginationRange', {
                start: pageStart + 1,
                end: pageEnd,
                total,
              })
            }}</span>
            <UButton
              :disabled="pageEnd >= total"
              @click="nextPage"
              variant="ghost"
              >{{ t('common.next') }}</UButton
            >
          </div>
        </div>
      </UCard>

      <!-- Footer -->
      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import SystemFooter from '~/components/SystemFooter.vue';
const { t } = useI18n();

definePageMeta({
  requiresAuth: true,
  layout: 'default',
  middleware: ['require-config-manage'],
});

const items = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const limit = ref(100);
const page = ref(0);
const total = ref(0);
const filters = reactive<{
  source: string | null;
  outcome: string | null;
  actor: string;
  action: string;
}>({ source: null, outcome: null, actor: '', action: '' });
const sourceOptions = computed(() => [
  { label: t('settings.activity.allSources'), value: null },
  { label: t('settings.activity.api'), value: 'api' },
  { label: t('settings.activity.cli'), value: 'cli' },
  { label: t('settings.activity.ui'), value: 'ui' },
  { label: t('settings.activity.system'), value: 'system' },
  { label: t('settings.activity.core'), value: 'core' },
]);
const outcomeOptions = computed(() => [
  { label: t('settings.activity.allOutcomes'), value: null },
  { label: t('settings.activity.success'), value: 'success' },
  { label: t('settings.activity.failure'), value: 'failure' },
  { label: t('settings.activity.warning'), value: 'warning' },
]);

const load = async (goTo?: number) => {
  loading.value = true;
  error.value = '';
  try {
    if (typeof goTo === 'number') page.value = Math.max(0, goTo);
    const params = new URLSearchParams({
      limit: String(limit.value),
      offset: String(page.value * limit.value),
    });
    if (filters.source) params.set('source', String(filters.source));
    if (filters.outcome) params.set('outcome', String(filters.outcome));
    if (filters.actor) params.set('actor', filters.actor);
    if (filters.action) params.set('action', filters.action);
    const res = (await useNuxtApp().$civicApi(
      `/api/v1/audit?${params.toString()}`
    )) as any;
    if (res?.success && res?.data?.entries) {
      items.value = res.data.entries;
      total.value = res.data.pagination?.total || items.value.length;
    } else {
      throw new Error('Unexpected response');
    }
  } catch (e: any) {
    error.value = e.message || t('settings.activity.failedToLoad');
  } finally {
    loading.value = false;
  }
};

const formatTime = (ts: string) => new Date(ts).toLocaleString();
const formatActor = (a: any) =>
  a ? `${a.username || a.id || ''}${a.role ? ` (${a.role})` : ''}` : '';
const formatTarget = (t: any) =>
  t ? `${t.type}${t.id ? `:${t.id}` : ''}` : '';

const pageStart = computed(() => page.value * limit.value);
const pageEnd = computed(() =>
  Math.min(pageStart.value + limit.value, total.value)
);
const prevPage = () => {
  if (page.value > 0) load(page.value - 1);
};
const nextPage = () => {
  if (pageEnd.value < total.value) load(page.value + 1);
};

onMounted(load);
</script>
