<script setup lang="ts">
// Set up proper head management for SPA mode
// This provides the context that UI plugins need
useHead({
  title: 'CivicPress',
  meta: [
    { charset: 'utf-8' },
    {
      name: 'viewport',
      content:
        'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes',
    },
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
            {
              name: 'viewport',
              content:
                'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes',
            }
          ]
        };
      `,
    },
  ],
});

// Analytics injection - fetch and inject after mount.
// FA-UI-001: config-supplied HTML is never materialized verbatim — inline
// <script> bodies are refused, external scripts must be https/same-origin
// with an attribute allowlist, and everything else passes DOMPurify. See
// composables/useAnalyticsInjection.ts.
onMounted(() => {
  setTimeout(() => {
    const api = useNuxtApp().$civicApi;
    if (!api) return;

    api('/api/v1/info')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => {
        // /info now returns the canonical envelope: fields under `data`.
        if (!res?.success || !res?.data?.analytics) return;

        const { inject_head, inject_body_start, inject_body_end } =
          res.data.analytics;

        injectAnalyticsFragment(inject_head, (node) =>
          document.head.appendChild(node)
        );
        if (document.body) {
          const anchor = document.body.firstChild;
          injectAnalyticsFragment(inject_body_start, (node) =>
            document.body.insertBefore(node, anchor)
          );
          injectAnalyticsFragment(inject_body_end, (node) =>
            document.body.appendChild(node)
          );
        }
      })
      .catch(() => {});
  }, 500);
});
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <!--
      ui-003 (partial fix) — CivicPress currently renders as a JS-only
      SPA (ssr: false). Citizens without JavaScript get a blank shell.
      This <noscript> fallback at least tells them what the site is
      and how to read records directly. Full SSR / prerender for the
      public read paths is planned for Phase 2d of the base refactor
      (docs/plans/2026-05-17-base-refactor-master-plan.md).
    -->
    <noscript>
      <div
        style="
          padding: 2rem;
          max-width: 680px;
          margin: 2rem auto;
          font-family: system-ui, -apple-system, sans-serif;
          line-height: 1.6;
        "
      >
        <h1>CivicPress requires JavaScript</h1>
        <p>
          You're seeing this message because JavaScript is disabled or your
          browser hasn't loaded it yet.
        </p>
        <p>
          CivicPress stores civic records as plain Markdown so they remain
          readable forever, with or without this web interface. In the
          meantime:
        </p>
        <ul>
          <li>
            Records live as plain text in the project's
            <code>data/records/</code> directory and can be read with any
            text viewer.
          </li>
          <li>
            Your municipality can provide raw record access via
            <code>git</code>, file download, or printed export.
          </li>
          <li>
            Track the no-JavaScript / server-rendered version on the
            <a href="https://github.com/CivicPress/civicpress">project repository</a>.
          </li>
        </ul>
        <p>
          <strong>Public infrastructure must stay public.</strong> If you
          can't reach civic records because of a software requirement,
          that's a bug — please tell your municipality.
        </p>
      </div>
    </noscript>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <!-- <UNotification /> -->
  </UApp>
</template>
