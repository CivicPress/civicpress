<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">Setup Wizard</h1>
        </template>
        <template #description>
          Create missing configuration files from defaults and validate
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb
        :items="[
          { label: 'Home', to: '/' },
          { label: 'Settings', to: '/settings' },
          { label: 'Setup' },
        ]"
      />

      <UCard class="mt-8">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-base font-medium">Configuration Status</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Review and create missing files
              </p>
            </div>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              :loading="loading"
              @click="loadStatus"
              >Refresh</UButton
            >
          </div>
        </template>

        <div
          v-if="loading"
          class="py-6 text-sm text-gray-600 dark:text-gray-400"
        >
          Loading…
        </div>
        <div v-else>
          <div class="grid gap-3">
            <div
              v-for="(state, type) in status"
              :key="type"
              class="flex items-center justify-between p-3 border rounded dark:border-gray-700"
            >
              <div class="flex items-center gap-3">
                <UBadge
                  :color="
                    state === 'missing'
                      ? 'error'
                      : state === 'default'
                        ? 'neutral'
                        : 'primary'
                  "
                  variant="subtle"
                >
                  {{ state }}
                </UBadge>
                <span class="font-medium">{{ type }}</span>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  v-if="state === 'missing'"
                  size="xs"
                  icon="i-lucide-file-plus"
                  @click="createFromDefaults(String(type))"
                  :loading="busy === type"
                  >Create from defaults
                </UButton>
                <UButton
                  size="xs"
                  variant="outline"
                  icon="i-lucide-shield-check"
                  @click="validateOne(String(type))"
                  :loading="busy === 'validate:' + type"
                  >Validate
                </UButton>
              </div>
            </div>
          </div>

          <div class="mt-6 flex items-center gap-2">
            <UButton
              icon="i-lucide-shield-check"
              :loading="validatingAll"
              @click="validateAll"
              >Validate all
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Footer -->
      <SystemFooter />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import SystemFooter from '~/components/SystemFooter.vue';
import { errorMessage } from '~/utils/errors';

/** Standard envelope for config status / reset / validate endpoints. */
interface ConfigEnvelope<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
}

definePageMeta({
  layout: 'default',
  middleware: ['require-auth', 'require-admin'],
});

const { $civicApi } = useNuxtApp();

const status = ref<Record<string, 'default' | 'user' | 'missing'>>({});
const loading = ref(false);
const busy = ref<string | null>(null);
const validatingAll = ref(false);

async function loadStatus() {
  loading.value = true;
  try {
    const res = (await $civicApi(
      '/api/v1/config/status'
    )) as ConfigEnvelope<Record<string, 'default' | 'user' | 'missing'>>;
    if (res?.success) status.value = res.data || {};
  } catch {
    // intentional: config status fetch failure is non-fatal; status stays empty
  } finally {
    loading.value = false;
  }
}

async function createFromDefaults(type: string) {
  busy.value = type;
  try {
    const res = (await $civicApi(
      `/api/v1/config/${encodeURIComponent(type)}/reset`,
      { method: 'POST' }
    )) as ConfigEnvelope;
    if (res?.success) {
      useToast().add({
        title: `Created ${type} from defaults`,
        color: 'primary',
      });
      await loadStatus();
    } else {
      throw new Error(res?.error || 'Failed to create from defaults');
    }
  } catch (e: unknown) {
    useToast().add({
      title: `Failed to create ${type}`,
      description: errorMessage(e),
      color: 'error',
    });
  } finally {
    busy.value = null;
  }
}

async function validateOne(type: string) {
  busy.value = 'validate:' + type;
  try {
    const res = (await $civicApi(
      `/api/v1/config/${encodeURIComponent(type)}/validate`,
      { method: 'POST' }
    )) as ConfigEnvelope<{ valid?: boolean }>;
    const valid = res?.data?.valid;
    useToast().add({
      title: valid ? `Valid: ${type}` : `Invalid: ${type}`,
      color: valid ? 'primary' : 'error',
    });
  } catch (e: unknown) {
    useToast().add({
      title: `Validation failed: ${type}`,
      description: errorMessage(e),
      color: 'error',
    });
  } finally {
    busy.value = null;
  }
}

async function validateAll() {
  validatingAll.value = true;
  try {
    const res = (await $civicApi(
      '/api/v1/config/validate/all'
    )) as ConfigEnvelope<Record<string, { valid?: boolean }>>;
    if (res?.success) {
      const results = res.data || {};
      const invalid = Object.entries(results).filter(
        ([, r]) => r && r.valid === false
      );
      if (invalid.length === 0) {
        useToast().add({
          title: 'All configurations are valid',
          color: 'primary',
        });
      } else {
        useToast().add({
          title: `${invalid.length} configuration(s) invalid`,
          color: 'error',
        });
      }
    }
  } catch (e: unknown) {
    useToast().add({
      title: 'Validation failed',
      description: errorMessage(e),
      color: 'error',
    });
  } finally {
    validatingAll.value = false;
  }
}

onMounted(loadStatus);
</script>
