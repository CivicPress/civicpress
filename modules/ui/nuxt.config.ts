// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // SSR mode - works better with Nuxt UI Pro
  ssr: false,

  // Development server configuration
  // Port can be overridden via PORT or NUXT_PORT environment variable
  devServer: {
    port: parseInt(process.env.PORT || process.env.NUXT_PORT || '3030'),
  },

  // Modules
  modules: ['@nuxt/ui-pro', '@pinia/nuxt', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  ui: {
    // Minimal theme configuration to prevent useHead issues
    theme: {
      colors: ['primary', 'error'],
    },
  },

  // Runtime configuration
  runtimeConfig: {
    public: {
      // API base URL
      civicApiUrl: process.env.API_BASE_URL || 'http://localhost:3000',
      // App configuration
      appName: 'CivicPress',
      appVersion: '0.1.3',
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
