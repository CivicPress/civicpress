import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mount } from '@vue/test-utils';
import { useMarkdown } from '~/composables/useMarkdown';
import RecordPreview from '~/components/RecordPreview.vue';

// RecordPreview uses `useMarkdown` as a Nuxt auto-import. In the vitest
// environment, no Nuxt runtime is wiring it up. We expose the real
// composable globally so the component can render the same sanitized
// markdown pipeline citizens see in production.
beforeAll(() => {
  (globalThis as any).useMarkdown = useMarkdown;
});

afterAll(() => {
  delete (globalThis as any).useMarkdown;
});

describe('RecordPreview', () => {
  it('renders rendered markdown headings prominently (h1 -> h2 via useMarkdown shift)', () => {
    const wrapper = mount(RecordPreview, {
      props: { content: '# Important Bylaw' },
    });

    const body = wrapper.find('[data-test="record-preview-body"]');
    expect(body.exists()).toBe(true);
    // useMarkdown shifts all headings up by one level (h1 -> h2).
    expect(body.html()).toContain('<h2');
    expect(body.text()).toContain('Important Bylaw');
  });

  it('pins the Phase 2a XSS-safety contract: <script> tags do NOT survive to the DOM', () => {
    // ui-001/ui-002 (Critical) — A malicious published record body must
    // not be able to execute scripts. DOMPurify in useMarkdown strips
    // <script> tags before v-html ever sees the string. This test
    // protects the contract at the component boundary so a future
    // refactor cannot silently reintroduce the XSS vector.
    const malicious =
      '# Hello\n\n<script>alert("xss")</script>\n\n<p>Safe paragraph</p>';
    const wrapper = mount(RecordPreview, {
      props: { content: malicious },
    });

    const fullHtml = wrapper.html();
    expect(fullHtml).not.toContain('<script>');
    expect(fullHtml).not.toContain('alert("xss")');
    // Safe markdown structure should still be present.
    expect(fullHtml).toContain('<h2');
    expect(wrapper.text()).toContain('Hello');
  });

  it('strips inline event handlers and javascript: URIs from rendered HTML', () => {
    const malicious =
      '<img src="x" onerror="alert(1)">\n\n<a href="javascript:alert(2)">evil</a>';
    const wrapper = mount(RecordPreview, {
      props: { content: malicious },
    });

    const html = wrapper.html().toLowerCase();
    // The XSS-safety contract is HTML-level: no event-handler attributes,
    // no javascript:-scheme URIs survive sanitization. The literal text
    // "alert(...)" is allowed to appear as ordinary content — what matters
    // is that it cannot execute.
    expect(html).not.toContain('onerror');
    expect(html).not.toMatch(/href=["']?javascript:/i);
  });

  it('falls back gracefully when content is an empty string', () => {
    const wrapper = mount(RecordPreview, {
      props: { content: '' },
    });

    // Component should mount without throwing.
    expect(wrapper.find('[data-test="record-preview"]').exists()).toBe(true);
    // Body container exists but renders no markdown content.
    const body = wrapper.find('[data-test="record-preview-body"]');
    expect(body.exists()).toBe(true);
    // No paragraph/heading elements — just an empty body.
    expect(body.html()).not.toContain('<h1');
    expect(body.html()).not.toContain('<h2');
  });

  it('applies wrap classes when wrap prop is true', () => {
    const wrapper = mount(RecordPreview, {
      props: { content: 'plain text', wrap: true },
    });

    const root = wrapper.find('[data-test="record-preview"]');
    expect(root.classes()).toContain('whitespace-pre-wrap');
    expect(root.classes()).toContain('break-words');
  });

  it('does not apply wrap classes when wrap prop is false', () => {
    const wrapper = mount(RecordPreview, {
      props: { content: 'plain text', wrap: false },
    });

    const root = wrapper.find('[data-test="record-preview"]');
    expect(root.classes()).not.toContain('whitespace-pre-wrap');
  });
});
