<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">Geography Files</h1>
        </template>
        <template #description>
          Manage geographic data for municipal records
        </template>
        <template #right>
          <UButton color="primary" @click="navigateToCreate">
            <UIcon name="i-lucide-plus" class="w-4 h-4" />
            Create Geography File
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

        <!-- Empty State -->
        <UCard v-else-if="geographyFiles.length === 0">
          <div class="text-center py-12">
            <UIcon
              name="i-lucide-map"
              class="w-16 h-16 text-gray-400 mx-auto mb-4"
            />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No geography files found
            </h3>
            <p class="text-gray-600 dark:text-gray-400 mb-6">
              Create your first geography file to get started with spatial data
              management.
            </p>
            <UButton color="primary" @click="navigateToCreate">
              <UIcon name="i-lucide-plus" class="w-4 h-4" />
              Create Geography File
            </UButton>
          </div>
        </UCard>

        <!-- Geography Files Grid -->
        <UCard v-else>
          <template #header>
            <div class="flex items-center space-x-3">
              <UIcon name="i-lucide-map-pin" class="w-6 h-6 text-primary-600" />
              <div>
                <h2 class="text-xl font-semibold">Geography Files</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ geographyFiles.length }} file{{
                    geographyFiles.length === 1 ? '' : 's'
                  }}
                  found
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-6">
            <!-- Search and Filters -->
            <div class="flex flex-col sm:flex-row gap-4">
              <div class="flex-1">
                <UInput
                  v-model="searchQuery"
                  placeholder="Search geography files..."
                  icon="i-lucide-search"
                  @input="debouncedSearch"
                />
              </div>
              <div class="flex gap-2">
                <USelect
                  v-model="selectedCategory"
                  :options="categoryOptions"
                  placeholder="All Categories"
                  @change="applyFilters"
                />
                <USelect
                  v-model="selectedType"
                  :options="typeOptions"
                  placeholder="All Types"
                  @change="applyFilters"
                />
              </div>
            </div>

            <!-- Geography Files Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div
                v-for="file in filteredFiles"
                :key="file.id"
                class="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
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
                      :color="getCategoryColor(file.category)"
                      variant="soft"
                      size="sm"
                    >
                      {{ file.category }}
                    </UBadge>
                  </div>
                  <UDropdownMenu :items="getFileMenuItems(file)">
                    <UButton
                      icon="i-lucide-more-vertical"
                      color="gray"
                      variant="ghost"
                      size="sm"
                    />
                  </UDropdownMenu>
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
                    Bounds: {{ formatBounds(file.bounds) }}
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
          </div>
        </UCard>
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
} from '@civicpress/core';

// Composables
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

// Breadcrumbs
const breadcrumbItems = [{ label: 'Geography' }];

// Reactive data
const geographyFiles = ref<GeographyFile[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref('');
const selectedCategory = ref<GeographyCategory | ''>('');
const selectedType = ref<GeographyFileType | ''>('');
const currentPage = ref(1);
const totalFiles = ref(0);
const totalPages = ref(1);

// Computed properties
const canCreateGeography = computed(() => {
  const userRole = authStore.user?.role;
  console.log(
    'User role:',
    userRole,
    'Can create geography:',
    userRole === 'admin' || userRole === 'clerk'
  );
  return userRole === 'admin' || userRole === 'clerk';
});

const canEditGeography = computed(() => {
  return authStore.user?.role === 'admin' || authStore.user?.role === 'clerk';
});

const categoryOptions = computed(() => [
  { label: 'All Categories', value: '' },
  { label: 'Zone', value: 'zone' },
  { label: 'Boundary', value: 'boundary' },
  { label: 'District', value: 'district' },
  { label: 'Facility', value: 'facility' },
  { label: 'Route', value: 'route' },
]);

const typeOptions = computed(() => [
  { label: 'All Types', value: '' },
  { label: 'GeoJSON', value: 'geojson' },
  { label: 'KML', value: 'kml' },
  { label: 'GPX', value: 'gpx' },
  { label: 'Shapefile', value: 'shapefile' },
]);

const filteredFiles = computed(() => {
  let filtered = geographyFiles.value;

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(
      (file) =>
        file.name.toLowerCase().includes(query) ||
        file.description.toLowerCase().includes(query)
    );
  }

  if (selectedCategory.value) {
    filtered = filtered.filter(
      (file) => file.category === selectedCategory.value
    );
  }

  if (selectedType.value) {
    filtered = filtered.filter((file) => file.type === selectedType.value);
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

    if (selectedCategory.value) {
      params.append('category', selectedCategory.value);
    }

    if (selectedType.value) {
      params.append('type', selectedType.value);
    }

    const response = await useNuxtApp().$civicApi(
      `/api/v1/geography?${params}`
    );

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
  const icons = {
    geojson: 'i-lucide-map',
    kml: 'i-lucide-map-pin',
    gpx: 'i-lucide-route',
    shapefile: 'i-lucide-layers',
  };
  return icons[type] || 'i-lucide-file';
};

const getCategoryColor = (category: GeographyCategory): string => {
  const colors = {
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
  return `${bounds.minLon.toFixed(4)}, ${bounds.minLat.toFixed(4)} to ${bounds.maxLon.toFixed(4)}, ${bounds.maxLat.toFixed(4)}`;
};

const getFileMenuItems = (file: GeographyFile) => {
  const items = [
    {
      label: 'View',
      icon: 'i-lucide-eye',
      onClick: () => navigateToFile(file.id),
    },
  ];

  if (canEditGeography.value) {
    items.push({
      label: 'Edit',
      icon: 'i-lucide-edit',
      onClick: () => navigateToEdit(file.id),
    });
  }

  return items;
};

// Lifecycle
onMounted(() => {
  console.log('Geography index mounted, auth state:', {
    user: authStore.user,
    isAuthenticated: authStore.isAuthenticated,
    initialized: authStore.initialized,
  });
  loadGeographyFiles();
});
</script>
