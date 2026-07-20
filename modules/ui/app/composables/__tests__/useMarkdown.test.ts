import { describe, it, expect } from 'vitest';
import { useMarkdown } from '../useMarkdown';

// ui-001 (Critical) — XSS-via-published-record was the audit's
// highest-civic-impact finding. The fix sanitizes marked.parse()
// output with DOMPurify inside useMarkdown.renderMarkdown(). These
// tests pin the XSS-safe behaviour so a future refactor can't
// silently reintroduce the vector.
// The heading renderer shifts levels up by one. It used to build the heading
// body by concatenating each inline token's raw `.text`, which silently
// dropped every inline construct inside a heading (bold, links, code spans).
// These tests pin that the heading body is rendered through the inline parser.
describe('useMarkdown — heading inline formatting', () => {
  const { renderMarkdown } = useMarkdown();

  it('preserves bold inside a heading', () => {
    const result = renderMarkdown('## Budget **2026**');
    expect(result).toContain('<strong>2026</strong>');
  });

  it('preserves emphasis and code spans inside a heading', () => {
    const result = renderMarkdown('### The `civic init` *command*');
    expect(result).toContain('<code>civic init</code>');
    expect(result).toContain('<em>command</em>');
  });

  it('preserves links inside a heading', () => {
    const result = renderMarkdown('## See [the bylaw](https://example.com/b1)');
    expect(result).toContain('href="https://example.com/b1"');
    expect(result).toContain('the bylaw</a>');
  });

  it('still shifts heading levels up by one, capped at h6', () => {
    expect(renderMarkdown('# Title')).toContain('<h2>');
    expect(renderMarkdown('## Title')).toContain('<h3>');
    expect(renderMarkdown('###### Title')).toContain('<h6>');
  });

  it('does not emit the raw markdown source for a formatted heading', () => {
    const result = renderMarkdown('## Budget **2026**');
    expect(result).not.toContain('**2026**');
  });
});

describe('useMarkdown — XSS sanitization (ui-001)', () => {
  const { renderMarkdown } = useMarkdown();

  it('strips <script> tags from markdown content', () => {
    const malicious = 'Hello\n\n<script>alert("xss")</script>\n\nworld';
    const result = renderMarkdown(malicious);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(');
  });

  it('strips <iframe> tags', () => {
    const malicious = '<iframe src="https://evil.example"></iframe>';
    const result = renderMarkdown(malicious);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('evil.example');
  });

  it('strips inline event handlers (onerror, onclick, onload)', () => {
    const malicious =
      '<img src="x" onerror="alert(1)"> <a href="#" onclick="alert(2)">click</a> <body onload="alert(3)">';
    const result = renderMarkdown(malicious).toLowerCase();
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('alert(');
  });

  it('strips javascript: URIs from links', () => {
    const malicious = '[click me](javascript:alert(1))';
    const result = renderMarkdown(malicious);
    expect(result).not.toMatch(/href=["']?javascript:/i);
  });

  it('preserves safe markdown structure', () => {
    const safe =
      '# Title\n\nParagraph with **bold** and [link](https://example.org) text.';
    const result = renderMarkdown(safe);
    // marked is configured to shift headings up by 1 level → h1 becomes h2
    expect(result).toContain('<h2');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('href="https://example.org"');
  });

  it('preserves the empty-line marker span when preserveLineBreaks is true', () => {
    const content = 'Line one\n\nLine two';
    const result = renderMarkdown(content, { preserveLineBreaks: true });
    // The postprocess adds <span class="markdown-empty-line" aria-hidden="true">
    // which must survive DOMPurify (we allow aria-hidden via ADD_ATTR).
    expect(result).toContain('markdown-empty-line');
    expect(result).toContain('aria-hidden');
  });

  it('blocks <object> and <embed> tags', () => {
    const malicious =
      '<object data="evil.swf"></object><embed src="evil.swf">';
    const result = renderMarkdown(malicious);
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
    expect(result).not.toContain('evil.swf');
  });

  it('strips data: URIs in script-execution contexts', () => {
    // base64 of "alert(1)"
    const malicious = '[bad](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)';
    const result = renderMarkdown(malicious);
    // DOMPurify blocks data:text/html in href by default
    expect(result).not.toMatch(/href=["']?data:text\/html/i);
  });
});
