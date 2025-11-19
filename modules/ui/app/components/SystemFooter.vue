<template>
  <div
    class="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-800 pt-4 text-center"
  >
    <span>{{ t('footer.storedAsMarkdownYaml') }}</span>
    <span>·</span>
    <span>{{ t('footer.gitBacked') }}</span>
    <span>·</span>
    <span>
      {{ t('footer.poweredBy') }}
      <UButton
        to="https://civicpress.io"
        target="_blank"
        color="primary"
        variant="link"
        size="xs"
        class="text-xs inline p-0 ml-1"
      >
        CivicPress
      </UButton>
    </span>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
</script>
