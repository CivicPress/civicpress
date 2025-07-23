<script setup lang="ts">
// Set up proper head management for SPA mode
// This provides the context that UI plugins need
useHead({
  title: 'CivicPress',
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  // Ensure head is available globally
  script: [
    {
      innerHTML: `
        window.__NUXT_HEAD__ = {
          title: 'CivicPress',
          meta: [
            { charset: 'utf-8' },
            { name: 'viewport', content: 'width=device-width, initial-scale=1' }
          ]
        };
      `
    }
  ]
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <!-- <UNotification /> -->
  </UApp>
</template>