<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">Activity</h1>
        </template>
        <template #description> Recent system activity (admin only) </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb
        :items="[
          { label: 'Home', to: '/' },
          { label: 'Settings', to: '/settings' },
          { label: 'Activity' },
        ]"
      />

      <UCard class="mt-6">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium">Recent Entries</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Latest {{ limit }} events
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
                placeholder="actor (username/id)"
                class="w-40"
              />
              <UInput
                v-model="filters.action"
                placeholder="action"
                class="w-40"
              />
              <UInput
                v-model.number="limit"
                type="number"
                min="10"
                max="500"
                class="w-24"
              />
              <UButton @click="load(0)" :loading="loading" variant="outline"
                >Apply</UButton
              >
            </div>
          </div>
        </template>

        <div
          v-if="loading"
          class="py-8 text-center text-sm text-gray-600 dark:text-gray-400"
        >
          Loading…
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
                <th class="py-2 pr-4">Time</th>
                <th class="py-2 pr-4">Actor</th>
                <th class="py-2 pr-4">Action</th>
                <th class="py-2 pr-4">Target</th>
                <th class="py-2 pr-4">Outcome</th>
                <th class="py-2 pr-4">Message</th>
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
            <UButton :disabled="page <= 0" @click="prevPage" variant="ghost"
              >Previous</UButton
            >
            <span class="text-xs text-gray-500"
              >{{ pageStart + 1 }}-{{ pageEnd }} of {{ total }}</span
            >
            <UButton
              :disabled="pageEnd >= total"
              @click="nextPage"
              variant="ghost"
              >Next</UButton
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
const sourceOptions = ref([
  { label: 'All sources', value: null },
  { label: 'API', value: 'api' },
  { label: 'CLI', value: 'cli' },
  { label: 'UI', value: 'ui' },
  { label: 'System', value: 'system' },
  { label: 'Core', value: 'core' },
]);
const outcomeOptions = ref([
  { label: 'All outcomes', value: null },
  { label: 'Success', value: 'success' },
  { label: 'Failure', value: 'failure' },
  { label: 'Warning', value: 'warning' },
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
    error.value = e.message || 'Failed to load activity log';
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
