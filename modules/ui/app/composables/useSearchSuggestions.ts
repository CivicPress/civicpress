import { useDebounceFn } from '@vueuse/core';

export interface SuggestionItem {
  text: string;
  type: 'word' | 'title';
}

export const useSearchSuggestions = () => {
  const { $civicApi } = useNuxtApp();

  const suggestions = ref<string[]>([]);
  const words = ref<string[]>([]);
  const titles = ref<string[]>([]);
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
      const response = (await $civicApi('/api/v1/search/suggestions', {
        method: 'GET',
        params: {
          q: query.trim(),
          limit: 8,
        },
      })) as {
        data: {
          suggestions: string[];
          words?: string[];
          titles?: string[];
        };
      };

      // Only update suggestions if this is still the current query
      if (currentQuery.value === query.trim()) {
        // Use new structure if available (words + titles), otherwise fall back to flat array
        if (response.data?.words || response.data?.titles) {
          words.value = response.data.words || [];
          titles.value = response.data.titles || [];
          // Combine words and titles, maintaining order
          const combined = [
            ...(response.data.words || []),
            ...(response.data.titles || []),
          ];
          suggestions.value = combined;
        } else {
          // Fallback: parse flat array (assume all are titles)
          suggestions.value = response.data?.suggestions || [];
          words.value = [];
          titles.value = response.data?.suggestions || [];
        }
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
    suggestions.value = [];
    words.value = [];
    titles.value = [];
    error.value = null;
    currentQuery.value = '';
    isLoading.value = false;
  };

  return {
    suggestions: readonly(suggestions),
    words: readonly(words),
    titles: readonly(titles),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchSuggestions,
    clearSuggestions,
  };
};
