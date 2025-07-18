// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // SPA mode - no SSR since we're API-driven
  ssr: false,

  // Development server configuration
  devServer: {
    port: 3030,
  },

  // Modules
  modules: ['@nuxt/ui'],

  // Runtime configuration
  runtimeConfig: {
    public: {
      // API base URL
      apiBase: process.env.API_BASE_URL || 'http://localhost:3000',
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
  build: {
    transpile: ['@nuxt/ui'],
  },

  // Nitro configuration (for API proxy if needed)
  nitro: {
    devProxy: {
      '/api': {
        target: process.env.API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
