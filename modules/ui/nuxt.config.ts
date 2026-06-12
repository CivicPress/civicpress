// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // SPA mode — historically chosen against Nuxt UI v3 + Pro v3; revisit for v4 + SSR
  // when public-read prerender lands (ui-003).
  ssr: false,

  // Development server configuration
  // Port can be overridden via PORT or NUXT_PORT environment variable
  devServer: {
    port: parseInt(process.env.PORT || process.env.NUXT_PORT || '3030'),
  },

  // Modules
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n', '@nuxt/eslint'],

  // ESLint module configuration
  // standalone: true (default) — generates full Vue + TypeScript config stack
  // so withNuxt() can accept our overrides cleanly on top
  eslint: {
    config: {
      standalone: true,
    },
  },
  css: ['~/assets/css/main.css'],

  // Runtime configuration
  runtimeConfig: {
    public: {
      // API base URL
      civicApiUrl: process.env.API_BASE_URL || 'http://localhost:3000',
      // App configuration
      appName: 'CivicPress',
      appVersion: '0.1.3',
      // Realtime collaborative editing (Phase 3). The WebSocket origin of the
      // in-process realtime server (it listens on its own port, default 3001).
      // useRealtimeEditor appends `/realtime/records/<recordId>`.
      realtimeWsUrl:
        process.env.NUXT_PUBLIC_REALTIME_WS_URL || 'ws://localhost:3001',
      // Feature flag — gates the collaborative editor path on the record edit
      // page. Off by default so editing does not require a running realtime
      // server; set NUXT_PUBLIC_REALTIME_ENABLED=true to opt in.
      realtimeEnabled: process.env.NUXT_PUBLIC_REALTIME_ENABLED === 'true',
    },
  },

  // TypeScript configuration
  typescript: {
    strict: true,
    typeCheck: true,
  },

  // Development tools
  devtools: {
    enabled: true,
  },

  // Build configuration
  // build: {
  //   transpile: ['@nuxt/ui'],
  // },

  // i18n configuration
  // Default locale can be overridden via NUXT_DEFAULT_LOCALE or DEFAULT_LOCALE environment variable
  i18n: {
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'fr', name: 'Français', file: 'fr.json' },
    ],
    defaultLocale:
      process.env.NUXT_DEFAULT_LOCALE || process.env.DEFAULT_LOCALE || 'en',
    strategy: 'no_prefix', // No URL prefix since we're only translating home page for now
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
      alwaysRedirect: false,
      fallbackLocale: 'en',
    },
    compilation: {
      strictMessage: false,
    },
  },

  // Nitro configuration (for API proxy if needed)
  nitro: {
    devProxy: {
      '/api': {
        target: process.env.API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
        // In Nuxt 4, we don't need rewrite if we want to keep the path as-is
        // The path is passed through by default
      },
    },
    // Note: Production preview server port is controlled via PORT env var
    // (set in package.json start:ui script)
  },
});
