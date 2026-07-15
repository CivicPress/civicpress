<script setup lang="ts">
interface Props {
  recordId?: string;
  rawYaml: string;
  yamlLoading: boolean;
  yamlError: string | null;
}

defineProps<Props>();

const { t } = useI18n();
</script>

<template>
  <div class="space-y-2">
    <div v-if="yamlLoading" class="text-center py-4">
      <UIcon
        name="i-lucide-loader-2"
        class="w-5 h-5 animate-spin text-gray-500 mx-auto mb-2"
      />
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ t('records.editor.loadingYaml') }}
      </p>
    </div>
    <div
      v-else
      class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
    >
      <pre
        class="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-words"
        :class="{
          'text-red-600 dark:text-red-400': yamlError,
        }"
        >{{
          rawYaml ||
          (recordId
            ? t('common.noData')
            : t('records.editor.saveToSeeYaml'))
        }}
      </pre>
    </div>
    <p class="text-xs text-gray-500 dark:text-gray-400">
      {{ t('records.editor.rawYamlDescription') }}
    </p>
  </div>
</template>
