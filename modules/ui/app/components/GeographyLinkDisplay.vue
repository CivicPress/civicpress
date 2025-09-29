<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
        Linked Geography Files
      </h3>
      <UBadge v-if="linkedFiles.length > 0" color="primary" variant="soft">
        {{ linkedFiles.length }} file{{ linkedFiles.length !== 1 ? 's' : '' }}
      </UBadge>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <UIcon
        name="i-lucide-loader-2"
        class="w-6 h-6 animate-spin text-gray-400"
      />
      <span class="ml-3 text-gray-600">Loading geography files...</span>
    </div>

    <!-- Error State -->
    <UAlert v-else-if="error" :title="error" color="error" variant="soft" />

    <!-- Combined Map View -->
    <div v-if="linkedFiles.length > 1 && allGeographyData" class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-md font-medium text-gray-900 dark:text-gray-100">
          Combined Map View
        </h4>
        <UBadge color="blue" variant="soft">
          {{ linkedFiles.length }} files
        </UBadge>
      </div>
      <div
        class="h-80 rounded-lg overflow-hidden border bg-gray-50 dark:bg-gray-800"
      >
        <GeographyMap
          :geography-data="allGeographyData"
          :bounds="combinedBounds"
          :interactive="true"
          height="100%"
        />
      </div>
    </div>

    <!-- Linked Files List -->
    <div v-else-if="linkedFiles.length > 0" class="space-y-3">
      <div
        v-for="link in linkedFiles"
        :key="link.id"
        class="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2">
              <h4 class="font-medium text-gray-900 dark:text-gray-100">
                {{ link.name }}
              </h4>
              <UBadge :color="getCategoryColor(link.category)" variant="soft">
                {{ link.category }}
              </UBadge>
            </div>

            <p
              v-if="link.description"
              class="text-sm text-gray-600 dark:text-gray-400 mb-3"
            >
              {{ link.description }}
            </p>

            <!-- Map Preview -->
            <div v-if="link.content" class="mb-3">
              <div
                class="h-64 rounded-lg overflow-hidden border bg-gray-50 dark:bg-gray-800"
              >
                <GeographyMap
                  :geography-data="link.content"
                  :bounds="link.bounds"
                  :interactive="true"
                  height="100%"
                />
              </div>
            </div>

            <!-- File Info -->
            <div
              class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500"
            >
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-file" class="w-3 h-3" />
                {{ link.type.toUpperCase() }}
              </span>
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-calendar" class="w-3 h-3" />
                {{ formatDate(link.created_at) }}
              </span>
              <span v-if="link.stats" class="flex items-center gap-1">
                <UIcon name="i-lucide-map-pin" class="w-3 h-3" />
                {{ link.stats.featureCount }} features
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 ml-4">
            <!-- View Full Map Button -->
            <UButton
              size="sm"
              color="blue"
              variant="outline"
              @click="viewFullMap(link)"
            >
              <UIcon name="i-lucide-map" class="w-4 h-4" />
              Full Map
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-8">
      <UIcon name="i-lucide-map" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        No geography files linked
      </h4>
      <p class="text-gray-600 dark:text-gray-400 mb-4">
        This record doesn't have any geography files linked to it yet.
      </p>
      <UButton
        v-if="canEdit"
        color="primary"
        variant="outline"
        @click="$emit('edit-links')"
      >
        <UIcon name="i-lucide-link" class="w-4 h-4" />
        Link Geography Files
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { GeographyFile } from '@civicpress/core';
import GeographyMap from './GeographyMap.vue';

// Props
interface Props {
  linkedGeographyFiles: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  showMapPreview?: boolean;
  canEdit?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showMapPreview: true,
  canEdit: false,
});

// Emits
const emit = defineEmits<{
  'view-file': [file: GeographyFile];
  'edit-links': [];
}>();

// State
const loading = ref(false);
const error = ref<string | null>(null);
const geographyFiles = ref<GeographyFile[]>([]);

// Computed
const linkedFiles = computed(() => {
  return props.linkedGeographyFiles.map((link) => {
    const geographyFile = geographyFiles.value.find(
      (file) => file.id === link.id
    );
    return {
      ...link,
      ...geographyFile, // This includes geographyData, bounds, stats, etc.
    };
  });
});

// Combined map data for multiple files
const allGeographyData = computed(() => {
  const filesWithData = linkedFiles.value.filter((file) => file.geographyData);
  if (filesWithData.length === 0) return null;

  // Combine all GeoJSON features into a single FeatureCollection
  const allFeatures: any[] = [];
  filesWithData.forEach((file) => {
    if (file.geographyData && file.geographyData.features) {
      allFeatures.push(...file.geographyData.features);
    }
  });

  return {
    type: 'FeatureCollection',
    features: allFeatures,
  };
});

const combinedBounds = computed(() => {
  const filesWithBounds = linkedFiles.value.filter((file) => file.bounds);
  if (filesWithBounds.length === 0) return null;

  // Calculate combined bounds
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;

  filesWithBounds.forEach((file) => {
    if (file.bounds) {
      minLon = Math.min(minLon, file.bounds[0]);
      minLat = Math.min(minLat, file.bounds[1]);
      maxLon = Math.max(maxLon, file.bounds[2]);
      maxLat = Math.max(maxLat, file.bounds[3]);
    }
  });

  return [minLon, minLat, maxLon, maxLat];
});

// Methods
const getCategoryColor = (category: string) => {
  const colors = {
    Reference: 'blue',
    Financial: 'green',
    Legal: 'purple',
    Planning: 'orange',
    Environmental: 'emerald',
    Infrastructure: 'gray',
  };
  return colors[category as keyof typeof colors] || 'neutral';
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString();
};

const viewFile = (file: GeographyFile) => {
  // Navigate to the geography file view page
  navigateTo(`/geography/${file.id}`);
};

const viewFullMap = (file: GeographyFile) => {
  // Navigate to the geography file view page
  navigateTo(`/geography/${file.id}`);
};

// Load geography files
const loadGeographyFiles = async () => {
  if (props.linkedGeographyFiles.length === 0) {
    return;
  }

  try {
    loading.value = true;
    error.value = null;

    // Load each linked geography file individually to get the full data
    const loadedFiles: GeographyFile[] = [];

    for (const link of props.linkedGeographyFiles) {
      try {
        const response = (await useNuxtApp().$civicApi(
          `/api/v1/geography/${link.id}`
        )) as any;

        if (response.success && response.data) {
          loadedFiles.push(response.data);
        }
      } catch (err) {
        console.warn(`Failed to load geography file ${link.id}:`, err);
      }
    }

    geographyFiles.value = loadedFiles;
  } catch (err) {
    console.error('Error loading geography files:', err);
    error.value = 'Failed to load geography files';
  } finally {
    loading.value = false;
  }
};

// Load data on mount
onMounted(() => {
  loadGeographyFiles();
});
</script>
