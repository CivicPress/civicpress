<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ t('geography.filesTitle') }}
          </h1>
        </template>
        <template #description>
          {{ t('geography.filesDescription') }}
        </template>
        <template #right>
          <UButton
            v-if="
              authStore.isLoggedIn &&
              authStore.hasPermission('geography:create')
            "
            color="primary"
            @click="navigateToCreate"
          >
            <UIcon name="i-lucide-plus" class="w-4 h-4" />
            {{ t('geography.createGeography') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UBreadcrumb :items="breadcrumbItems" />
        <!-- Loading State -->
        <div v-if="loading" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="i in 6"
              :key="i"
              class="p-4 border rounded-lg animate-pulse"
            >
              <div class="h-4 bg-gray-200 rounded mb-2"></div>
              <div class="h-3 bg-gray-200 rounded mb-2"></div>
              <div class="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
          </div>
        </div>

        <!-- Error State -->
        <UAlert
          v-else-if="error"
          :title="error"
          color="error"
          variant="soft"
          class="mb-6"
        >
          <template #actions>
            <UButton @click="loadGeographyFiles"> Try Again </UButton>
          </template>
        </UAlert>

        <!-- Content when not loading -->
        <template v-else>
          <!-- Search and Filters -->
          <div
            class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40 space-y-3"
          >
            <div class="sm:hidden">
              <span
                class="text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                Filters
              </span>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div class="flex-1">
                <UInput
                  v-model="searchQuery"
                  :placeholder="t('geography.searchPlaceholder')"
                  icon="i-lucide-search"
                  @input="debouncedSearch"
                  class="w-full"
                />
              </div>
              <USelectMenu
                v-model="selectedCategory"
                :items="categoryOptions"
                placeholder="Filter by category..."
                value-key="value"
                option-attribute="label"
                class="w-full sm:w-48"
                @change="applyFilters"
              />
              <USelectMenu
                v-model="selectedType"
                :items="typeOptions"
                placeholder="Filter by type..."
                value-key="value"
                option-attribute="label"
                class="w-full sm:w-48"
                @change="applyFilters"
              />
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="filteredFiles.length === 0" class="py-16">
            <div
              class="mx-auto flex max-w-xl flex-col items-center rounded-xl border border-dashed border-gray-200 bg-white px-8 py-12 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900/40"
            >
              <UIcon
                name="i-lucide-file-search"
                class="mb-6 h-16 w-16 text-gray-300 dark:text-gray-600"
              />
              <h3
                class="text-xl font-semibold text-gray-900 dark:text-gray-100"
              >
                No geography files match your filters
              </h3>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Try adjusting or clearing your filters to see all available
                geography files.
              </p>
              <div class="mt-6 flex flex-col items-center gap-3 sm:flex-row">
                <UButton
                  variant="link"
                  color="primary"
                  class="text-sm"
                  @click="resetFilters"
                >
                  Clear all filters
                </UButton>
                <UButton
                  v-if="canCreateGeography"
                  variant="link"
                  color="primary"
                  class="text-sm"
                  @click="navigateToCreate"
                >
                  Create new geography file
                </UButton>
              </div>
            </div>
          </div>

          <!-- Geography Files Grid -->
          <div v-else class="space-y-6">
            <!-- Geography Files Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div
                v-for="file in filteredFiles"
                :key="file.id"
                class="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                @click="navigateToFile(file.id)"
              >
                <!-- File Header -->
                <div class="flex items-start justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="getFileTypeIcon(file.type)"
                      class="w-5 h-5 text-blue-500"
                    />
                    <UBadge
                      :color="getCategoryColor(file.category) as any"
                      variant="soft"
                      size="sm"
                    >
                      {{ t(`geography.categories.${file.category}`) }}
                    </UBadge>
                  </div>
                </div>

                <!-- File Info -->
                <div class="space-y-2">
                  <h3
                    class="font-medium text-gray-900 dark:text-white truncate"
                  >
                    {{ file.name }}
                  </h3>
                  <p
                    class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2"
                  >
                    {{ file.description }}
                  </p>

                  <!-- File Metadata -->
                  <div class="flex items-center gap-4 text-xs text-gray-500">
                    <span>{{ file.type.toUpperCase() }}</span>
                    <span>{{ formatDate(file.created_at) }}</span>
                  </div>

                  <!-- Bounds Info -->
                  <div class="text-xs text-gray-500">
                    {{ t('geography.bounds') }}: {{ formatBounds(file.bounds) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Pagination -->
            <div v-if="totalPages > 1" class="flex justify-center">
              <UPagination
                v-model="currentPage"
                :page-count="totalPages"
                :total="totalFiles"
                @update:model-value="loadGeographyFiles"
              />
            </div>

            <!-- Footer -->
            <SystemFooter />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import { useToast } from '#imports';
import { useDebounceFn } from '@vueuse/core';
import type {
  GeographyFile,
  GeographyCategory,
  GeographyFileType,
} from '~/types/geography';
import SystemFooter from '~/components/SystemFooter.vue';

// Composables
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();
const { t } = useI18n();

// Breadcrumbs
const breadcrumbItems = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('geography.title') },
]);

// Reactive data
const geographyFiles = ref<GeographyFile[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref('');
const selectedCategory = ref<GeographyCategory | 'all'>('all');
const selectedType = ref<GeographyFileType | 'all'>('all');
const currentPage = ref(1);
const totalFiles = ref(0);
const totalPages = ref(1);

// Computed properties
const canCreateGeography = computed(() => {
  return authStore.isLoggedIn && authStore.hasPermission('geography:create');
});

const canEditGeography = computed(() => {
  return authStore.user?.role === 'admin' || authStore.user?.role === 'clerk';
});

const categoryOptions = computed(() => [
  { label: t('geography.categories.all'), value: 'all' },
  { label: t('geography.categories.zone'), value: 'zone' },
  { label: t('geography.categories.boundary'), value: 'boundary' },
  { label: t('geography.categories.district'), value: 'district' },
  { label: t('geography.categories.facility'), value: 'facility' },
  { label: t('geography.categories.route'), value: 'route' },
]);

const typeOptions = computed(() => [
  { label: t('geography.types.all'), value: 'all' },
  { label: t('geography.types.geojson'), value: 'geojson' },
  { label: t('geography.types.kml'), value: 'kml' },
  { label: t('geography.types.gpx'), value: 'gpx' },
  { label: t('geography.types.shapefile'), value: 'shapefile' },
]);

const filteredFiles = computed(() => {
  let filtered = geographyFiles.value;

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(
      (file: GeographyFile) =>
        file.name.toLowerCase().includes(query) ||
        file.description.toLowerCase().includes(query)
    );
  }

  if (selectedCategory.value && selectedCategory.value !== 'all') {
    filtered = filtered.filter(
      (file: GeographyFile) => file.category === selectedCategory.value
    );
  }

  if (selectedType.value && selectedType.value !== 'all') {
    filtered = filtered.filter(
      (file: GeographyFile) => file.type === selectedType.value
    );
  }

  return filtered;
});

// Methods
const loadGeographyFiles = async () => {
  try {
    loading.value = true;
    error.value = null;

    const params = new URLSearchParams({
      page: currentPage.value.toString(),
      limit: '12',
    });

    if (selectedCategory.value && selectedCategory.value !== 'all') {
      params.append('category', selectedCategory.value);
    }

    if (selectedType.value && selectedType.value !== 'all') {
      params.append('type', selectedType.value);
    }

    const response = (await useNuxtApp().$civicApi(
      `/api/v1/geography?${params}`
    )) as any;

    if (response.success) {
      geographyFiles.value = response.data.files;
      totalFiles.value = response.data.total;
      totalPages.value = Math.ceil(totalFiles.value / 12);
    } else {
      throw new Error(response.error || 'Failed to load geography files');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('Failed to load geography files:', err);
  } finally {
    loading.value = false;
  }
};

const debouncedSearch = useDebounceFn(() => {
  // Search is handled by computed property
}, 300);

const applyFilters = () => {
  currentPage.value = 1;
  loadGeographyFiles();
};

const resetFilters = () => {
  searchQuery.value = '';
  selectedCategory.value = 'all';
  selectedType.value = 'all';
  currentPage.value = 1;
  loadGeographyFiles();
};

const navigateToCreate = () => {
  router.push('/geography/create');
};

const navigateToFile = (id: string) => {
  router.push(`/geography/${id}`);
};

const navigateToEdit = (id: string) => {
  router.push(`/geography/${id}/edit`);
};

const getFileTypeIcon = (type: GeographyFileType): string => {
  const icons: Record<GeographyFileType, string> = {
    geojson: 'i-lucide-map',
    kml: 'i-lucide-map-pin',
    gpx: 'i-lucide-route',
    shapefile: 'i-lucide-layers',
  };
  return icons[type] || 'i-lucide-file';
};

const getCategoryColor = (category: GeographyCategory): string => {
  const colors: Record<GeographyCategory, string> = {
    zone: 'blue',
    boundary: 'green',
    district: 'purple',
    facility: 'orange',
    route: 'red',
  };
  return colors[category] || 'gray';
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString();
};

const formatBounds = (bounds: any): string => {
  return `${bounds.minLon.toFixed(4)}, ${bounds.minLat.toFixed(4)} ${t('geography.boundsTo')} ${bounds.maxLon.toFixed(4)}, ${bounds.maxLat.toFixed(4)}`;
};

const getFileMenuItems = (file: GeographyFile) => {
  const items = [
    {
      label: t('common.view'),
      icon: 'i-lucide-eye',
      onClick: () => navigateToFile(file.id),
    },
  ];

  if (canEditGeography.value) {
    items.push({
      label: t('common.edit'),
      icon: 'i-lucide-edit',
      onClick: () => navigateToEdit(file.id),
    });
  }

  return items;
};

// Lifecycle
onMounted(() => {
  loadGeographyFiles();
});
</script>
