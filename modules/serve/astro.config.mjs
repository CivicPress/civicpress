// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind()],
  site: 'http://localhost:4321',
  base: '/',
  build: {
    assets: 'assets'
  },
  server: {
    port: 4321,
    host: true
  },
  vite: {
    ssr: {
      external: ['@civicpress/core']
    }
  }
});
