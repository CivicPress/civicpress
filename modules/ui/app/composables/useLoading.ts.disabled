import { ref, computed } from 'vue';

export const useLoading = () => {
  const loadingStates = ref<Record<string, boolean>>({});
  const globalLoading = ref(false);

  const setLoading = (key: string, isLoading: boolean) => {
    loadingStates.value[key] = isLoading;
  };

  const isLoading = (key: string) => {
    return loadingStates.value[key] || false;
  };

  const setGlobalLoading = (isLoading: boolean) => {
    globalLoading.value = isLoading;
  };

  const isGlobalLoading = computed(() => globalLoading.value);

  const withLoading = async <T>(
    key: string,
    asyncFn: () => Promise<T>
  ): Promise<T> => {
    setLoading(key, true);
    try {
      const result = await asyncFn();
      return result;
    } finally {
      setLoading(key, false);
    }
  };

  const withGlobalLoading = async <T>(
    asyncFn: () => Promise<T>
  ): Promise<T> => {
    setGlobalLoading(true);
    try {
      const result = await asyncFn();
      return result;
    } finally {
      setGlobalLoading(false);
    }
  };

  const clearLoading = (key?: string) => {
    if (key) {
      delete loadingStates.value[key];
    } else {
      loadingStates.value = {};
    }
  };

  return {
    loadingStates: computed(() => loadingStates.value),
    globalLoading: isGlobalLoading,
    setLoading,
    isLoading,
    setGlobalLoading,
    withLoading,
    withGlobalLoading,
    clearLoading,
  };
};
