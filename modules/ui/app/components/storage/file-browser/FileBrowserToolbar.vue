<template>
  <div class="filters mb-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <UInput
        :model-value="searchQuery"
        :placeholder="t('settings.storage.searchFiles')"
        icon="i-lucide-search"
        @update:model-value="$emit('update:search-query', $event)"
        @input="$emit('search-input')"
        clearable
      />

      <USelectMenu
        :model-value="selectedType"
        :items="fileTypeOptions"
        multiple
        :placeholder="t('settings.storage.allTypes')"
        icon="i-lucide-filter"
        @update:model-value="$emit('update:selected-type', $event)"
      />

      <USelectMenu
        :model-value="sortBy"
        :items="sortOptions"
        :placeholder="t('settings.storage.sortBy')"
        icon="i-lucide-sort-asc"
        @update:model-value="$emit('update:sort-by', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface TypeOption {
  label: string;
  id: string;
}

interface Props {
  searchQuery: string;
  selectedType: TypeOption[];
  sortBy: TypeOption | undefined;
  fileTypeOptions: TypeOption[];
  sortOptions: TypeOption[];
}

defineProps<Props>();

defineEmits<{
  'update:search-query': [value: string];
  'update:selected-type': [value: TypeOption[]];
  'update:sort-by': [value: TypeOption | undefined];
  'search-input': [];
}>();

const { t } = useI18n();
</script>

<style scoped>
/* Filters Section */
.filters {
  background-color: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  padding: 1.5rem;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  margin-bottom: 1.5rem;
}

@media (max-width: 640px) {
  .filters {
    padding: 1rem;
  }
}

@media (max-width: 768px) {
  .filters .grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.75rem;
  }
}
</style>
