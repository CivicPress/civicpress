<script setup lang="ts">
import { ref, watch, computed } from 'vue';

const props = defineProps<{ content: string; wrap?: boolean }>();
const { renderMarkdown } = useMarkdown();

const debouncedContent = ref(props.content || '');
watch(
  () => props.content,
  (v) => {
    const t = setTimeout(() => {
      debouncedContent.value = v || '';
    }, 200);
    return () => clearTimeout(t as any);
  },
  { immediate: true }
);

const html = computed(() =>
  renderMarkdown(debouncedContent.value, {
    preserveLineBreaks: true,
  })
);
</script>

<template>
  <div
    class="markdown-content"
    :class="wrap ? 'whitespace-pre-wrap break-words' : ''"
  >
    <div
      class="prose prose-sm max-w-none prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline"
      v-html="html"
    />
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
