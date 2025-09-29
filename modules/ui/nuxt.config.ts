// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // SSR mode - works better with Nuxt UI Pro
  ssr: false,

  // Development server configuration
  devServer: {
    port: 3030,
  },

  // Modules
  modules: ['@nuxt/ui-pro', '@pinia/nuxt'],
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
      appVersion: '1.0.0',
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

  // Nitro configuration (for API proxy if needed)
  nitro: {
    devProxy: {
      '/api': {
        target: process.env.API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path, // Don't rewrite the path, keep /api prefix
      },
    },
  },
});
