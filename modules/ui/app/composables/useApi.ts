import type { UseFetchOptions } from 'nuxt/app';

// `Parameters<typeof useFetch<T>>[1]` picked whichever overload Nuxt listed
// last; 4.5 added a factory overload there and the spread stopped typechecking.
// `UseFetchOptions<T>` is the public type Nuxt's own custom-useFetch recipe uses.
export function useCivicApi<T>(
  url: string | (() => string),
  options?: UseFetchOptions<T>
) {
  return useFetch(url, {
    ...options,
    $fetch: useNuxtApp().$civicApi,
  });
}
