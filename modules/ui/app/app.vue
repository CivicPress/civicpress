<script setup lang="ts">
// Set up proper head management for SPA mode
// This provides the context that UI plugins need
useHead({
  title: 'CivicPress',
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    {
      name: 'description',
      content: 'Open-source infrastructure for modern civic life',
    },
    { property: 'og:title', content: 'CivicPress' },
    {
      property: 'og:description',
      content: 'Open-source infrastructure for modern civic life',
    },
    { property: 'og:image', content: '/og_image.png' },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: 'https://civicpress.io' },
    { property: 'og:site_name', content: 'CivicPress' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'CivicPress' },
    {
      name: 'twitter:description',
      content: 'Open-source infrastructure for modern civic life',
    },
    { name: 'twitter:image', content: '/og_image.png' },
  ],
  link: [
    // `sizes="any"` is to fix Chrome bug
    { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
    { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/manifest.webmanifest' },
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
      `,
    },
  ],
});

// Analytics injection - fetch and inject after mount
onMounted(() => {
  setTimeout(() => {
    const api = useNuxtApp().$civicApi;
    if (!api) return;

    api('/api/v1/info')
      .then((res: any) => {
        if (!res?.success || !res?.analytics) return;

        const { inject_head, inject_body_start, inject_body_end } =
          res.analytics;

        // Inject head
        if (inject_head?.trim()) {
          const div = document.createElement('div');
          div.innerHTML = inject_head;
          const scripts = div.querySelectorAll('script');
          scripts.forEach((s) => {
            const ns = document.createElement('script');
            Array.from(s.attributes).forEach((a) =>
              ns.setAttribute(a.name, a.value)
            );
            ns.textContent = s.textContent || '';
            document.head.appendChild(ns);
          });
          Array.from(div.children)
            .filter((c) => c.tagName !== 'SCRIPT')
            .forEach((el) => {
              document.head.appendChild(el.cloneNode(true));
            });
        }

        // Inject body start
        if (inject_body_start?.trim() && document.body) {
          const div = document.createElement('div');
          div.innerHTML = inject_body_start;
          while (div.firstChild) {
            const n = div.firstChild;
            if (n.nodeName === 'SCRIPT') {
              const s = document.createElement('script');
              Array.from((n as HTMLScriptElement).attributes).forEach((a) =>
                s.setAttribute(a.name, a.value)
              );
              s.textContent = (n as HTMLScriptElement).textContent || '';
              document.body.insertBefore(s, document.body.firstChild);
            } else {
              document.body.insertBefore(n, document.body.firstChild);
            }
          }
        }

        // Inject body end
        if (inject_body_end?.trim() && document.body) {
          const div = document.createElement('div');
          div.innerHTML = inject_body_end;
          while (div.firstChild) {
            const n = div.firstChild;
            if (n.nodeName === 'SCRIPT') {
              const s = document.createElement('script');
              Array.from((n as HTMLScriptElement).attributes).forEach((a) =>
                s.setAttribute(a.name, a.value)
              );
              s.textContent = (n as HTMLScriptElement).textContent || '';
              document.body.appendChild(s);
            } else {
              document.body.appendChild(n);
            }
          }
        }
      })
      .catch(() => {});
  }, 500);
});
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
