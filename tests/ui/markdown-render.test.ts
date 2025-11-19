import { describe, it, expect } from 'vitest';
import { useMarkdown } from '../../modules/ui/app/composables/useMarkdown';

describe('useMarkdown', () => {
  it('shifts headings by one level', () => {
    const { renderMarkdown } = useMarkdown();
    const html = renderMarkdown('# Title');
    expect(html).toContain('<h2>Title</h2>');
  });
});
