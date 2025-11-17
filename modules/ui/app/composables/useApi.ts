export function useCivicApi<T>(
  url: string | (() => string),
  options?: Parameters<typeof useFetch<T>>[1]
) {
  return useFetch(url, {
    ...options,
    $fetch: useNuxtApp().$civicApi,
  });
}
