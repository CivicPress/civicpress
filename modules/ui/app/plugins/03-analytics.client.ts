/**
 * Analytics & Custom Content Injection Plugin
 *
 * Simple, safe injection of analytics scripts and HTML
 */

let executed = false;

export default defineNuxtPlugin(() => {
  if (!process.client || executed) return;
  executed = true;

  // Single execution after a delay
  setTimeout(() => {
    try {
      const app = useNuxtApp();
      const api = app?.$civicApi;
      if (!api) return;

      api('/info')
        .then((res: any) => {
          if (!res?.success || !res?.analytics) return;

          const { inject_head, inject_body_start, inject_body_end } =
            res.analytics;

          // Inject head content
          if (inject_head?.trim() && document.head) {
            const div = document.createElement('div');
            div.innerHTML = inject_head;
            const scripts = div.querySelectorAll('script');
            const others = Array.from(div.children).filter(
              (c) => c.tagName !== 'SCRIPT'
            );

            scripts.forEach((s) => {
              const newScript = document.createElement('script');
              Array.from(s.attributes).forEach((a) =>
                newScript.setAttribute(a.name, a.value)
              );
              newScript.textContent = s.textContent || s.innerHTML || '';
              document.head.appendChild(newScript);
            });

            others.forEach((el) =>
              document.head.appendChild(el.cloneNode(true))
            );
          }

          // Inject body start
          if (inject_body_start?.trim() && document.body) {
            const div = document.createElement('div');
            div.innerHTML = inject_body_start;
            while (div.firstChild) {
              const node = div.firstChild;
              if (node.nodeName === 'SCRIPT') {
                const s = document.createElement('script');
                Array.from((node as HTMLScriptElement).attributes).forEach(
                  (a) => s.setAttribute(a.name, a.value)
                );
                s.textContent = (node as HTMLScriptElement).textContent || '';
                document.body.insertBefore(s, document.body.firstChild);
              } else {
                document.body.insertBefore(node, document.body.firstChild);
              }
            }
          }

          // Inject body end
          if (inject_body_end?.trim() && document.body) {
            const div = document.createElement('div');
            div.innerHTML = inject_body_end;
            while (div.firstChild) {
              const node = div.firstChild;
              if (node.nodeName === 'SCRIPT') {
                const s = document.createElement('script');
                Array.from((node as HTMLScriptElement).attributes).forEach(
                  (a) => s.setAttribute(a.name, a.value)
                );
                s.textContent = (node as HTMLScriptElement).textContent || '';
                document.body.appendChild(s);
              } else {
                document.body.appendChild(node);
              }
            }
          }
        })
        .catch(() => {});
    } catch (e) {}
  }, 1500);
});
