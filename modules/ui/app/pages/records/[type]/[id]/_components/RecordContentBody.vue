<script setup lang="ts">
interface Props {
  content?: string;
  renderedContent: string;
}

defineProps<Props>();

defineEmits<{
  contentClick: [event: MouseEvent];
}>();

const { t } = useI18n();
const markdownContainer = ref<HTMLElement | null>(null);

defineExpose({ markdownContainer });
</script>

<template>
  <div class="rounded-lg border border-gray-200 dark:border-gray-800">
    <div class="p-6 leading-relaxed">
      <div
        v-if="content"
        class="markdown-content"
        @click="$emit('contentClick', $event)"
      >
        <!-- Render markdown content -->
        <div
          ref="markdownContainer"
          class="prose prose-sm max-w-none prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline"
          v-html="renderedContent"
        />
      </div>
      <div v-else class="text-gray-500 dark:text-gray-400 italic">
        {{ t('records.noContentAvailable') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.markdown-empty-line) {
  display: block;
  height: 0.75rem;
  margin: 0;
  content: '';
}

:deep(.markdown-content p) {
  margin: 0;
  line-height: 1.4rem;
}

:deep(.markdown-content h2:first-of-type) {
  margin-top: 0;
  padding-top: 0;
}
</style>
