<script setup lang="ts">
// Set up proper head management for SPA mode
// This provides the context that UI plugins need
useHead({
  title: 'CivicPress',
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'description', content: 'Civic Records Management System' },
    { property: 'og:title', content: 'CivicPress' },
    { property: 'og:description', content: 'Civic Records Management System' },
    { property: 'og:image', content: '/logo-large.svg' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'CivicPress' },
    { name: 'twitter:description', content: 'Civic Records Management System' },
    { name: 'twitter:image', content: '/logo-large.svg' },
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
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

    api('/info')
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
