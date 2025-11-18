<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import { getFieldValue as normalizeValue } from '~/utils/config';
import SystemFooter from '~/components/SystemFooter.vue';

// Stores
const authStore = useAuthStore();

// Composables
const { $civicApi } = useNuxtApp();
const { formatDate } = useRecordUtils();
const runtimeConfig = useRuntimeConfig();
const { t } = useI18n();

// Reactive state
const organizationInfo = ref<any>(null);
const recentRecords = ref<CivicRecord[]>([]);
const loading = ref(true);
const error = ref('');
const homeSearchQuery = ref('');
const aboutSectionRef = ref<HTMLElement | null>(null);

// Auth
const isAuthenticated = computed(() => authStore.isAuthenticated);
const isAdmin = computed(() => authStore.currentUser?.role === 'admin');

// Default copy
const defaultAboutIntro =
  'This is an example CivicPress deployment. It includes sample bylaws, meeting minutes, and geography layers to demonstrate how documents, sessions, and zones appear in an open, transparent civic registry.';

// Normalized organization fields
const orgName = computed(
  () => normalizeValue<string>(organizationInfo.value?.name) || 'CivicPress'
);
const orgCity = computed(() =>
  normalizeValue<string | undefined>(organizationInfo.value?.city)
);
const orgState = computed(() =>
  normalizeValue<string | undefined>(organizationInfo.value?.state)
);
const orgCountry = computed(() =>
  normalizeValue<string | undefined>(organizationInfo.value?.country)
);
const orgTimezone = computed(() =>
  normalizeValue<string | undefined>(organizationInfo.value?.timezone)
);
const orgAboutIntro = computed(
  () =>
    normalizeValue<string | undefined>(organizationInfo.value?.about_intro) ||
    defaultAboutIntro
);
const orgVersionLabel = computed(
  () =>
    normalizeValue<string | undefined>(organizationInfo.value?.version) ||
    runtimeConfig.public.appVersion ||
    '1.0.0'
);

// Search submit
const submitHomeSearch = () => {
  const query = homeSearchQuery.value.trim();

  if (!query) {
    navigateTo('/records');
    return;
  }

  navigateTo({
    path: '/records',
    query: { search: query },
  });
};

// Fetch organization info (public endpoint)
const fetchOrganizationInfo = async () => {
  try {
    const response = (await $civicApi('/info')) as any;
    if (response.success) {
      organizationInfo.value = response.organization;
    }
  } catch (err: any) {
    console.error('Error fetching organization info:', err);
    // Non-critical, so no error UI
  }
};

// Fetch recent records (public)
const fetchRecentRecords = async () => {
  try {
    const response = (await $civicApi('/api/v1/records?limit=5')) as any;
    if (response.success) {
      recentRecords.value = response.data.records || [];
    }
  } catch (err: any) {
    console.error('Error fetching recent records:', err);
    // Non-critical, so no error UI
  }
};

// Load all data
const loadDashboardData = async () => {
  loading.value = true;
  error.value = '';

  try {
    await fetchOrganizationInfo();
    await fetchRecentRecords();
  } catch (err: any) {
    error.value = err.message || t('home.failedToLoad');
    console.error('Error loading dashboard data:', err);
  } finally {
    loading.value = false;
  }
};

// Quick actions
const navigateToRecords = () => {
  navigateTo('/records');
};
const navigateToCreate = () => {
  navigateTo('/records/new');
};
const navigateToLogin = () => {
  navigateTo('/auth/login');
};
const navigateToSettings = () => {
  navigateTo('/settings');
};
const navigateToProfile = () => {
  navigateTo('/settings/profile');
};

const scrollToAboutSection = () => {
  if (aboutSectionRef.value) {
    aboutSectionRef.value.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
};

// Init
onMounted(() => {
  loadDashboardData();
});

// Watch auth changes
watch(isAuthenticated, (newValue) => {
  if (newValue) {
    // User just logged in, reload any auth-dependent data in future
    loadDashboardData();
  }
});
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4"
          />
          <p class="text-gray-600">{{ t('home.loadingDashboard') }}</p>
        </div>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        :title="error"
        icon="i-lucide-alert-circle"
        class="mb-4"
      >
        <template #footer>
          <UButton color="error" variant="soft" @click="loadDashboardData">
            {{ t('common.tryAgain') }}
          </UButton>
        </template>
      </UAlert>

      <!-- Dashboard Content -->
      <div v-else class="space-y-8">
        <!-- Welcome Section -->
        <div class="text-center py-12 space-y-6">
          <h2 class="text-4xl font-bold">{{ t('home.title') }}</h2>
          <p
            class="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg mb-10"
          >
            {{ t('home.tagline') }}
          </p>

          <!-- Hero search -->
          <form
            class="max-w-xl mx-auto mt-6 mb-12"
            @submit.prevent="submitHomeSearch"
          >
            <UInput
              v-model="homeSearchQuery"
              :placeholder="t('home.searchPlaceholder')"
              size="lg"
              icon="i-lucide-search"
              class="w-full"
            />
          </form>
        </div>

        <!-- Quick Actions (logged-out) -->
        <div v-if="!isAuthenticated" class="max-w-4xl mx-auto mt-6 pb-12">
          <UCard class="" :ui="{ body: 'p-4 sm:p-6' }">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <!-- Browse Records -->
              <button
                type="button"
                class="flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
                @click="navigateToRecords"
              >
                <UIcon
                  name="i-lucide-folder-open"
                  class="w-5 h-5 text-blue-600"
                />
                <span>{{ t('home.browseRecordsButton') }}</span>
              </button>

              <!-- Sign In -->
              <button
                type="button"
                class="flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
                @click="navigateToLogin"
              >
                <UIcon name="i-lucide-log-in" class="w-5 h-5 text-blue-600" />
                <span>{{ t('common.signIn') }}</span>
              </button>

              <!-- About Demo -->
              <button
                type="button"
                class="flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
                @click="scrollToAboutSection"
              >
                <UIcon name="i-lucide-info" class="w-5 h-5 text-blue-600" />
                <span>{{ t('home.aboutDemo') }}</span>
              </button>
            </div>
          </UCard>
        </div>

        <!-- Quick Actions (logged-in only) -->
        <div v-if="isAuthenticated" class="max-w-4xl mx-auto mt-6 pb-12">
          <UCard class="" :ui="{ body: 'p-4 sm:p-6' }">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <!-- Browse Records -->
              <button
                type="button"
                class="flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
                @click="navigateToRecords"
              >
                <UIcon
                  name="i-lucide-folder-open"
                  class="w-5 h-5 text-blue-600"
                />
                <span>{{ t('home.browseRecordsButton') }}</span>
              </button>

              <!-- Create Record -->
              <button
                type="button"
                class="flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
                @click="navigateToCreate"
              >
                <UIcon
                  name="i-lucide-plus-circle"
                  class="w-5 h-5 text-blue-600"
                />
                <span>{{ t('home.createRecord') }}</span>
              </button>

              <!-- Geography -->
              <button
                type="button"
                class="flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
                @click="navigateTo('/geography')"
              >
                <UIcon name="i-lucide-map" class="w-5 h-5 text-blue-600" />
                <span>{{ t('home.geography') }}</span>
              </button>

              <!-- Profile -->
              <button
                type="button"
                class="flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
                @click="navigateToProfile"
              >
                <UIcon name="i-lucide-user" class="w-5 h-5 text-blue-600" />
                <span>{{ t('common.profile') }}</span>
              </button>
            </div>
          </UCard>
        </div>

        <!-- Recent Records -->
        <div
          v-if="recentRecords.length > 0"
          class="space-y-4 border-t border-gray-200 dark:border-gray-800 mt-12 pt-8"
        >
          <h3 class="text-xl font-semibold text-center">
            {{ t('home.latestPublicRecords') }}
          </h3>
          <div class="grid gap-4">
            <UCard
              v-for="record in recentRecords"
              :key="record.id"
              class="hover:shadow-md transition-shadow cursor-pointer"
              @click="navigateTo(`/records/${record.type}/${record.id}`)"
            >
              <div class="flex items-start space-x-4">
                <UIcon
                  name="i-heroicons-document-text"
                  class="w-4 h-4 text-gray-400 flex-shrink-0 mt-1"
                />
                <div class="flex-1 min-w-0">
                  <h4 class="text-sm font-medium truncate">
                    {{ record.title }}
                  </h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ formatDate(record.created_at) }}
                  </p>
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Environment Information -->
        <div
          ref="aboutSectionRef"
          class="space-y-4 border-t border-gray-200 dark:border-gray-800 mt-12 pt-8"
        >
          <h3 class="text-xl font-semibold text-center">
            {{ t('home.aboutEnvironment') }}
          </h3>
          <UCard class="border-gray-200 dark:border-gray-800">
            <div class="space-y-4">
              <div class="text-left">
                <p class="text-gray-700 dark:text-gray-300">
                  {{ orgAboutIntro }}
                </p>
              </div>

              <div class="space-y-2 text-sm">
                <div v-if="orgName" class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-building-2"
                    class="w-4 h-4 text-gray-500"
                  />
                  <span class="text-gray-700 dark:text-gray-300">
                    {{ orgName }}
                  </span>
                </div>
                <div v-if="orgCity && orgState" class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-map-pin"
                    class="w-4 h-4 text-gray-500"
                  />
                  <span class="text-gray-700 dark:text-gray-300">
                    {{ orgCity }}, {{ orgState }}
                  </span>
                </div>
                <div v-if="orgCountry" class="flex items-center gap-2">
                  <UIcon name="i-lucide-globe" class="w-4 h-4 text-gray-500" />
                  <span class="text-gray-700 dark:text-gray-300">
                    {{ orgCountry }}
                  </span>
                </div>
                <div v-if="orgTimezone" class="flex items-center gap-2">
                  <UIcon name="i-lucide-clock" class="w-4 h-4 text-gray-500" />
                  <span class="text-gray-700 dark:text-gray-300">
                    {{ orgTimezone }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-badge-check"
                    class="w-4 h-4 text-gray-500"
                  />
                  <span class="text-gray-700 dark:text-gray-300">
                    {{ t('home.versionLabel', { version: orgVersionLabel }) }}
                  </span>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <!-- System / Workspace Info (Admin only) -->
        <div
          v-if="isAuthenticated && isAdmin"
          class="space-y-4 border-t border-gray-200 dark:border-gray-800 pt-8"
        >
          <h3 class="text-xl font-semibold text-center">
            {{ t('home.workspaceInformation') }}
          </h3>

          <UCard class="border-gray-200 dark:border-gray-800">
            <div class="space-y-2 text-sm">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-server" class="w-4 h-4 text-gray-500" />
                <span
                  >{{ t('home.environment') }}:
                  {{ runtimeConfig.public.environment || 'Demo' }}</span
                >
              </div>

              <div class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-user-check"
                  class="w-4 h-4 text-gray-500"
                />
                <span
                  >{{ t('home.role') }}: {{ authStore.currentUser?.role }}</span
                >
              </div>

              <div class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-git-branch"
                  class="w-4 h-4 text-gray-500"
                />
                <span
                  >{{ t('home.title') }} {{ t('home.version') }}
                  {{ orgVersionLabel }}</span
                >
              </div>
            </div>
          </UCard>
        </div>

        <!-- Footer -->
        <SystemFooter />
      </div>
    </template>
  </UDashboardPanel>
</template>
