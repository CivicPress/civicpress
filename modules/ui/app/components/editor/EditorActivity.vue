<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Props {
  recordId?: string;
}

const props = defineProps<Props>();

const activities = ref<any[]>([]);
const loading = ref(false);

// TODO: Fetch activity from API
onMounted(() => {
  // Placeholder for activity fetching
  activities.value = [
    {
      type: 'created',
      user: 'System',
      timestamp: new Date().toISOString(),
      message: 'Record created',
    },
  ];
});
</script>

<template>
  <div class="space-y-3">
    <h4 class="text-sm font-medium">Activity</h4>

    <div v-if="loading" class="text-center py-4">
      <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin mx-auto" />
    </div>

    <div v-else-if="activities.length > 0" class="space-y-2">
      <div
        v-for="(activity, index) in activities"
        :key="index"
        class="text-xs text-gray-600 dark:text-gray-400"
      >
        <p>{{ activity.message }}</p>
        <p class="text-gray-500">
          {{ new Date(activity.timestamp).toLocaleString() }}
        </p>
      </div>
    </div>

    <div v-else class="text-center py-4">
      <p class="text-xs text-gray-500">No activity yet</p>
    </div>
  </div>
</template>
