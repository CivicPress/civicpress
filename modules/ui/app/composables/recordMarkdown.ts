// Pure helpers for separating an H1 title from a Markdown body.
//
// Extracted from RecordForm.vue during Phase 2d (ui-008 decomposition).
// No reactivity — these are intentionally pure string transforms so they can
// be reused from composables, components, and tests without a Vue instance.

export const extractTitleFromMarkdown = (content: string): string | null => {
  if (!content) return null;
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim();
  // Check if first line is an H1 heading (# Title)
  if (firstLine?.startsWith('# ')) {
    return firstLine.substring(2).trim();
  }
  return null;
};

export const stripFirstLineFromMarkdown = (content: string): string => {
  if (!content) return '';
  const lines = content.split('\n');
  const firstLine = lines[0]?.trim();
  // If first line is an H1, remove it and any following blank lines
  if (firstLine?.startsWith('# ')) {
    // Remove first line and any immediately following blank lines
    let startIndex = 1;
    while (startIndex < lines.length && lines[startIndex]?.trim() === '') {
      startIndex++;
    }
    return lines.slice(startIndex).join('\n');
  }
  return content;
};

export const prependTitleToMarkdown = (
  title: string,
  content: string
): string => {
  const titleLine = `# ${title}`;
  // If content is empty, just return title
  if (!content.trim()) {
    return titleLine;
  }
  // Ensure there's a blank line between title and content
  return `${titleLine}\n\n${content}`;
};
