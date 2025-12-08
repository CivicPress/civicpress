<script setup lang="ts">
import { computed } from 'vue';
import RecordPreview from '~/components/RecordPreview.vue';

interface Props {
  content: string;
  show?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  show: true,
});
</script>

<template>
  <div v-if="show" class="preview-panel h-full overflow-y-auto">
    <div class="max-w-4xl mx-auto px-6 py-8">
      <RecordPreview :content="content" :wrap="true" />
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  min-height: 100%;
  /* Smooth scrolling */
  scroll-behavior: smooth;
}

/* Custom scrollbar for preview */
.preview-panel::-webkit-scrollbar {
  width: 8px;
}

.preview-panel::-webkit-scrollbar-track {
  background: transparent;
}

.preview-panel::-webkit-scrollbar-thumb {
  background: rgb(203, 213, 225);
  border-radius: 4px;
}

.dark .preview-panel::-webkit-scrollbar-thumb {
  background: rgb(51, 65, 85);
}

.preview-panel::-webkit-scrollbar-thumb:hover {
  background: rgb(148, 163, 184);
}

.dark .preview-panel::-webkit-scrollbar-thumb:hover {
  background: rgb(71, 85, 105);
}
</style>
