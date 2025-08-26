<script setup lang="ts">
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

const html = computed(() => renderMarkdown(debouncedContent.value));
</script>

<template>
  <div
    class="prose prose-sm max-w-none prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline"
    :class="wrap ? 'whitespace-pre-wrap break-words' : ''"
    v-html="html"
  />
</template>
