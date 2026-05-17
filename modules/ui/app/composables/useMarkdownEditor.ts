/**
 * useMarkdownEditor Composable
 *
 * Provides utilities for working with markdown content in the editor,
 * particularly for handling title extraction and content manipulation.
 *
 * The TipTap Markdown extension handles import/export automatically,
 * but these utilities help with common record-specific operations.
 */

export function useMarkdownEditor() {
  /**
   * Extract the title from markdown content if the first line is an H1 heading.
   * @param content The markdown content
   * @returns The extracted title or null if no H1 heading found
   */
  const extractTitleFromMarkdown = (content: string): string | null => {
    if (!content) return null;
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim();
    // Check if first line is an H1 heading (# Title)
    if (firstLine?.startsWith('# ')) {
      return firstLine.substring(2).trim();
    }
    return null;
  };

  /**
   * Remove the first line from markdown content if it's an H1 heading.
   * Also strips any immediately following blank lines.
   * @param content The markdown content
   * @returns The content without the H1 title line
   */
  const stripTitleFromMarkdown = (content: string): string => {
    if (!content) return '';
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim();
    // If first line is an H1, remove it and any following blank lines
    if (firstLine?.startsWith('# ')) {
      let startIndex = 1;
      while (startIndex < lines.length && lines[startIndex]?.trim() === '') {
        startIndex++;
      }
      return lines.slice(startIndex).join('\n');
    }
    return content;
  };

  /**
   * Prepend a title as an H1 heading to markdown content.
   * @param title The title to prepend
   * @param content The markdown content
   * @returns The content with the title prepended
   */
  const prependTitleToMarkdown = (title: string, content: string): string => {
    const titleLine = `# ${title}`;
    // If content is empty, just return title
    if (!content.trim()) {
      return titleLine;
    }
    // Ensure there's a blank line between title and content
    return `${titleLine}\n\n${content}`;
  };

  /**
   * Parse markdown content into separate title and body parts.
   * Useful for records that store title separately from content.
   * @param content The full markdown content
   * @returns Object with title (or null) and body
   */
  const parseMarkdownWithTitle = (
    content: string
  ): { title: string | null; body: string } => {
    const title = extractTitleFromMarkdown(content);
    const body = title ? stripTitleFromMarkdown(content) : content;
    return { title, body };
  };

  /**
   * Combine a separate title and body into full markdown content.
   * @param title The title (optional)
   * @param body The body content
   * @returns Full markdown content with title as H1 if provided
   */
  const combineMarkdownWithTitle = (
    title: string | null | undefined,
    body: string
  ): string => {
    if (title?.trim()) {
      return prependTitleToMarkdown(title, body);
    }
    return body;
  };

  return {
    extractTitleFromMarkdown,
    stripTitleFromMarkdown,
    prependTitleToMarkdown,
    parseMarkdownWithTitle,
    combineMarkdownWithTitle,
  };
}
