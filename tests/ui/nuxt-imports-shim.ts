// Shim for Nuxt's `#imports` virtual module used by SFCs under vitest.
// Components import auto-imported helpers (e.g. `useToast`) from `#imports`
// when running inside Nuxt; under vitest there is no Nuxt runtime, so we
// proxy to whichever globals tests/ui/setup.ts has stubbed.
//
// Tests can still `vi.mock('#imports', ...)` to override per-suite if needed.

export const useToast = () => {
  const g: any = globalThis as any;
  if (typeof g.useToast === 'function') return g.useToast();
  return { add: () => {} };
};

export const useNuxtApp = () => {
  const g: any = globalThis as any;
  if (typeof g.useNuxtApp === 'function') return g.useNuxtApp();
  return { $civicApi: async () => ({ success: true, data: {} }) };
};

export const useRouter = () => {
  const g: any = globalThis as any;
  if (typeof g.useRouter === 'function') return g.useRouter();
  return { push: () => {}, replace: () => {}, back: () => {} };
};

export const useRoute = () => {
  const g: any = globalThis as any;
  if (typeof g.useRoute === 'function') return g.useRoute();
  return { path: '/', params: {}, query: {} };
};

export const useI18n = () => {
  const g: any = globalThis as any;
  if (typeof g.useI18n === 'function') return g.useI18n();
  return {
    t: (k: string) => k,
    locale: { value: 'en' },
    locales: [{ code: 'en' }],
  };
};

export const navigateTo = (to: any) => {
  const g: any = globalThis as any;
  if (typeof g.navigateTo === 'function') return g.navigateTo(to);
  return undefined;
};
