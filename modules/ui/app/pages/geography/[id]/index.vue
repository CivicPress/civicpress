<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ geographyFile?.name || 'Geography File' }}
          </h1>
        </template>
        <template #description>
          {{ geographyFile?.type?.toUpperCase() }} •
          {{ geographyFile?.category }}
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" @click="router.back()">
              <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
              Back
            </UButton>
            <UButton
              v-if="canEditGeography"
              color="primary"
              variant="outline"
              @click="editFile"
            >
              <UIcon name="i-lucide-edit" class="w-4 h-4" />
              Edit
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <!-- Breadcrumb -->
        <UBreadcrumb :items="breadcrumbItems" />

        <!-- Loading State -->
        <div v-if="loading" class="space-y-6">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- File Info Skeleton -->
            <UCard>
              <template #header>
                <div class="animate-pulse">
                  <div class="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div class="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </template>
              <div class="space-y-4">
                <div class="animate-pulse">
                  <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
                  <div class="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
                  <div class="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            </UCard>

            <!-- Map Skeleton -->
            <UCard>
              <template #header>
                <div class="animate-pulse">
                  <div class="h-6 bg-gray-200 rounded w-1/2"></div>
                </div>
              </template>
              <div class="h-64 bg-gray-200 rounded animate-pulse"></div>
            </UCard>
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
            <UButton @click="loadGeographyFile"> Try Again </UButton>
          </template>
        </UAlert>

        <!-- Main Content -->
        <div v-else-if="geographyFile" class="space-y-6">
          <!-- File Information and Map -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <!-- File Information Card -->
            <UCard>
              <div class="space-y-4">
                <!-- Basic Info -->
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      class="text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Name
                    </label>
                    <p class="text-sm text-gray-900 dark:text-white">
                      {{ geographyFile.name }}
                    </p>
                  </div>
                  <div>
                    <label
                      class="text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Type
                    </label>
                    <p class="text-sm text-gray-900 dark:text-white">
                      {{ geographyFile.type.toUpperCase() }}
                    </p>
                  </div>
                  <div>
                    <label
                      class="text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Category
                    </label>
                    <p class="text-sm text-gray-900 dark:text-white">
                      {{ geographyFile.category }}
                    </p>
                  </div>
                  <div>
                    <label
                      class="text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      SRID
                    </label>
                    <p class="text-sm text-gray-900 dark:text-white">
                      {{ geographyFile.srid }}
                    </p>
                  </div>
                </div>

                <!-- Description -->
                <div>
                  <label
                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Description
                  </label>
                  <p class="text-sm text-gray-900 dark:text-white mt-1">
                    {{ geographyFile.description }}
                  </p>
                </div>

                <!-- Bounds -->
                <div>
                  <label
                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Bounding Box
                  </label>
                  <div class="grid grid-cols-2 gap-2 mt-1 text-xs">
                    <div>
                      <span class="text-gray-500">Min:</span>
                      {{ geographyFile.bounds.minLon.toFixed(6) }},
                      {{ geographyFile.bounds.minLat.toFixed(6) }}
                    </div>
                    <div>
                      <span class="text-gray-500">Max:</span>
                      {{ geographyFile.bounds.maxLon.toFixed(6) }},
                      {{ geographyFile.bounds.maxLat.toFixed(6) }}
                    </div>
                  </div>
                </div>

                <!-- Timestamps -->
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      class="text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Created
                    </label>
                    <p class="text-sm text-gray-900 dark:text-white">
                      {{ formatDate(geographyFile.created_at) }}
                    </p>
                  </div>
                  <div>
                    <label
                      class="text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Updated
                    </label>
                    <p class="text-sm text-gray-900 dark:text-white">
                      {{ formatDate(geographyFile.updated_at) }}
                    </p>
                  </div>
                </div>

                <!-- Metadata -->
                <div v-if="geographyFile.metadata">
                  <label
                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Metadata
                  </label>
                  <div class="mt-1 space-y-1">
                    <div v-if="geographyFile.metadata.source" class="text-xs">
                      <span class="text-gray-500">Source:</span>
                      {{ geographyFile.metadata.source }}
                    </div>
                    <div v-if="geographyFile.metadata.version" class="text-xs">
                      <span class="text-gray-500">Version:</span>
                      {{ geographyFile.metadata.version }}
                    </div>
                    <div v-if="geographyFile.metadata.accuracy" class="text-xs">
                      <span class="text-gray-500">Accuracy:</span>
                      {{ geographyFile.metadata.accuracy }}
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Map Visualization -->
            <UCard>
              <div class="rounded-lg overflow-hidden" style="height: 450px">
                <GeographyMap
                  :geography-data="parsedGeoJsonData"
                  :bounds="geographyFile?.bounds"
                  :interactive="true"
                  :scroll-wheel-zoom="false"
                  height="450px"
                />
              </div>
            </UCard>
          </div>

          <!-- Data Preview and Statistics -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Data Preview -->
            <UCard>
              <div class="space-y-4">
                <div
                  class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-64 overflow-auto"
                >
                  <pre
                    class="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap"
                    >{{ rawContent }}</pre
                  >
                </div>
                <div class="flex items-center justify-end">
                  <UButton size="sm" variant="outline" @click="copyToClipboard">
                    <UIcon name="i-lucide-copy" class="w-4 h-4" />
                    Copy
                  </UButton>
                </div>
              </div>
            </UCard>

            <!-- Statistics -->
            <UCard>
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div
                    class="text-center p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
                  >
                    <div class="text-2xl font-bold text-primary-600">
                      {{ parsedData?.featureCount || 0 }}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                      Features
                    </div>
                  </div>
                  <div
                    class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg"
                  >
                    <div class="text-2xl font-bold text-green-600">
                      {{ parsedData?.geometryTypes?.length || 0 }}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                      Geometry Types
                    </div>
                  </div>
                </div>

                <div v-if="parsedData?.geometryTypes?.length" class="space-y-2">
                  <label
                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Geometry Types
                  </label>
                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="type in parsedData.geometryTypes"
                      :key="type"
                      color="primary"
                      variant="soft"
                    >
                      {{ type }}
                    </UBadge>
                  </div>
                </div>

                <div class="space-y-2">
                  <label
                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    File Size
                  </label>
                  <p class="text-sm text-gray-900 dark:text-white">
                    {{ formatFileSize(rawContent.length) }}
                  </p>
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Linked Records -->
        <GeographyLinkedRecords
          v-if="geographyFile"
          :geography-id="geographyFile.id"
        />

        <!-- Footer -->
        <SystemFooter v-if="geographyFile" />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
// Define GeographyFile type locally to avoid import issues
interface GeographyFile {
  id: string;
  name: string;
  type: string;
  category: string;
  description?: string;
  srid: number;
  bounds: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  created_at: string;
  updated_at: string;
  metadata?: any;
  file_path?: string;
  content?: string;
}
import GeographyMap from '~/components/GeographyMap.vue';
import GeographyLinkedRecords from '~/components/GeographyLinkedRecords.vue';
import SystemFooter from '~/components/SystemFooter.vue';

// Route and router
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Reactive state
const loading = ref(true);
const error = ref<string | null>(null);
const geographyFile = ref<GeographyFile | null>(null);
const rawContent = ref('');
const parsedData = ref<any>(null);

// Computed properties
const breadcrumbItems = computed(() => [
  { label: 'Home', to: '/' },
  { label: 'Geography', to: '/geography' },
  { label: geographyFile.value?.name || 'Geography File' },
]);

const canEditGeography = computed(() => {
  return authStore.user?.role === 'admin' || authStore.user?.role === 'editor';
});

const parsedGeoJsonData = computed(() => {
  if (!rawContent.value || !geographyFile.value?.type) return null;

  try {
    if (geographyFile.value.type === 'geojson') {
      return JSON.parse(rawContent.value);
    }
    return null;
  } catch (error) {
    console.error('Error parsing GeoJSON data:', error);
    return null;
  }
});

// Methods
const loadGeographyFile = async () => {
  try {
    loading.value = true;
    error.value = null;

    const id = route.params.id as string;
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/geography/${id}`
    )) as any;

    if (response.success) {
      geographyFile.value = response.data;

      // Load raw content
      await loadRawContent();

      // Parse content for statistics
      await parseContent();
    } else {
      error.value = response.error || 'Failed to load geography file';
    }
  } catch (err) {
    console.error('Error loading geography file:', err);
    error.value = 'Failed to load geography file';
  } finally {
    loading.value = false;
  }
};

const loadRawContent = async () => {
  if (!geographyFile.value?.file_path) return;

  try {
    // For now, we'll use the content from the API response
    // In the future, we could fetch the raw file content
    const response = (await useNuxtApp().$civicApi(
      `/api/v1/geography/${geographyFile.value.id}`
    )) as any;
    if (response.success && response.data.content) {
      rawContent.value = response.data.content;
    }
  } catch (err) {
    console.error('Error loading raw content:', err);
    rawContent.value = 'Content not available';
  }
};

const parseContent = async () => {
  if (!rawContent.value || !geographyFile.value?.type) return;

  try {
    if (geographyFile.value.type === 'geojson') {
      const data = JSON.parse(rawContent.value);
      parsedData.value = {
        featureCount: data.features?.length || 0,
        geometryTypes:
          data.features?.map((f: any) => f.geometry?.type).filter(Boolean) ||
          [],
      };
    }
  } catch (err) {
    console.error('Error parsing content:', err);
    parsedData.value = null;
  }
};

const editFile = () => {
  if (geographyFile.value) {
    router.push(`/geography/${geographyFile.value.id}/edit`);
  }
};

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(rawContent.value);
    // You could add a toast notification here
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString();
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Lifecycle
onMounted(() => {
  loadGeographyFile();
});
</script>
