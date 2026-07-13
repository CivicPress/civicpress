/**
 * FA-UI-001 — safe materialization of operator-configured analytics snippets.
 *
 * `/api/v1/info` returns `analytics.inject_head/body_*` from server config.
 * The old code re-created every `<script>` verbatim (inline bodies included),
 * so anyone able to influence that config — or the API response — got stored
 * XSS on every visitor, with JWT+CSRF sitting in localStorage.
 *
 * Rules now enforced client-side (defense in depth; the server config stays
 * operator-gated):
 *  - inline `<script>` bodies are NEVER executed;
 *  - external scripts survive only with an https (or same-origin) `src`, and
 *    only an attribute allowlist is copied (no event handlers);
 *  - every non-script node is run through DOMPurify before insertion
 *    (keeps `<noscript>` pixels/meta, strips handlers and javascript: URLs).
 */

import DOMPurify from 'isomorphic-dompurify';

/** Attributes an analytics `<script src>` may carry — nothing executable. */
const SCRIPT_ATTRIBUTE_ALLOWLIST = new Set([
  'src',
  'async',
  'defer',
  'crossorigin',
  'referrerpolicy',
  'integrity',
  'type',
  'id',
]);

function safeScript(source: HTMLScriptElement): HTMLScriptElement | null {
  const src = source.getAttribute('src');
  // No src, or an inline body alongside one → refuse (inline execution).
  if (!src || (source.textContent ?? '').trim().length > 0) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(src, window.location.origin);
  } catch {
    return null;
  }
  const sameOrigin = url.origin === window.location.origin;
  if (url.protocol !== 'https:' && !sameOrigin) {
    return null;
  }

  const script = document.createElement('script');
  for (const attribute of Array.from(source.attributes)) {
    const name = attribute.name.toLowerCase();
    if (
      SCRIPT_ATTRIBUTE_ALLOWLIST.has(name) ||
      (name.startsWith('data-') && !name.startsWith('data-on'))
    ) {
      script.setAttribute(attribute.name, attribute.value);
    }
  }
  script.src = url.toString();
  return script;
}

/**
 * Parse an analytics HTML fragment WITHOUT executing it, and return only the
 * nodes that are safe to attach to the live document.
 */
export function buildSafeAnalyticsNodes(html: string): Node[] {
  // <template> content is inert — nothing runs while we inspect it.
  const template = document.createElement('template');
  template.innerHTML = html;

  const out: Node[] = [];
  for (const node of Array.from(template.content.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.cloneNode());
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue; // comments etc. carry nothing analytics needs
    }
    const element = node as Element;
    if (element.tagName === 'SCRIPT') {
      const script = safeScript(element as HTMLScriptElement);
      if (script) {
        out.push(script);
      } else {
        console.warn(
          '[analytics] dropped unsafe <script> from injected config (inline body or non-https src)'
        );
      }
      continue;
    }
    // DOMPurify may strip scripts NESTED inside the element too.
    const clean = DOMPurify.sanitize(element.outerHTML);
    if (!clean.trim()) continue;
    const holder = document.createElement('template');
    holder.innerHTML = clean;
    out.push(...Array.from(holder.content.childNodes));
  }
  return out;
}

/** Materialize a fragment via `place` (append/insert), safely. */
export function injectAnalyticsFragment(
  html: string | undefined | null,
  place: (node: Node) => void
): void {
  if (!html?.trim()) return;
  buildSafeAnalyticsNodes(html).forEach(place);
}
