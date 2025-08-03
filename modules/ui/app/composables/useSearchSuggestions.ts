import { useDebounceFn } from '@vueuse/core';

export const useSearchSuggestions = () => {
  const { $civicApi } = useNuxtApp();

  const suggestions = ref<string[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const currentQuery = ref('');

  // Debounced function to fetch suggestions
  const fetchSuggestions = useDebounceFn(async (query: string) => {
    if (!query || query.trim().length < 2) {
      suggestions.value = [];
      currentQuery.value = '';
      return;
    }

    currentQuery.value = query.trim();
    isLoading.value = true;
    error.value = null;

    try {
      const response = (await $civicApi('/api/search/suggestions', {
        method: 'GET',
        params: {
          q: query.trim(),
          limit: 8,
        },
      })) as { data: { suggestions: string[] } };

      // Only update suggestions if this is still the current query
      if (currentQuery.value === query.trim()) {
        suggestions.value = response.data?.suggestions || [];
      }
    } catch (err: any) {
      console.error('Failed to fetch search suggestions:', err);
      error.value = err.message || 'Failed to fetch suggestions';
      // Only clear if this is still the current query
      if (currentQuery.value === query.trim()) {
        suggestions.value = [];
      }
    } finally {
      if (currentQuery.value === query.trim()) {
        isLoading.value = false;
      }
    }
  }, 300);

  // Clear suggestions only when query is actually empty
  const clearSuggestions = () => {
    console.log('🗑️ Clearing suggestions');
    suggestions.value = [];
    error.value = null;
    currentQuery.value = '';
    isLoading.value = false;
  };

  return {
    suggestions: readonly(suggestions),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchSuggestions,
    clearSuggestions,
  };
};
