import { marked, type MarkedOptions } from 'marked';

const EMPTY_LINE_MARKER = '[[CIVIC_EMPTY_LINE_MARKER]]';

export const useMarkdown = () => {
  // Configure marked to shift all headings up by 1 level
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }: { tokens: any[]; depth: number }) => {
    const text = tokens.map((token) => token.text).join('');
    const newLevel = Math.min(depth + 1, 6); // Shift up by 1, max h6
    return `<h${newLevel}>${text}</h${newLevel}>`;
  };

  marked.use({ renderer });

  const preprocessContent = (content: string): string => {
    const lines = content.split('\n');
    let insideFence = false;
    let currentFenceChar: '`' | '~' | '' = '';

    const processedLines = lines.map((line) => {
      const trimmed = line.trim();
      const fenceStarts =
        trimmed.startsWith('```') || trimmed.startsWith('~~~');

      if (fenceStarts) {
        const fenceChar = trimmed.startsWith('```') ? '`' : '~';
        if (!insideFence) {
          insideFence = true;
          currentFenceChar = fenceChar;
        } else if (currentFenceChar === fenceChar) {
          insideFence = false;
          currentFenceChar = '';
        }

        return line;
      }

      if (!insideFence && trimmed === '') {
        return EMPTY_LINE_MARKER;
      }

      return line;
    });

    return processedLines.join('\n');
  };

  const postprocessHtml = (html: string): string => {
    const markerPattern = EMPTY_LINE_MARKER.replace(
      /[-/\\^$*+?.()|[\]{}]/g,
      '\\$&'
    );

    const paragraphRegex = new RegExp(`<p>\\s*${markerPattern}\\s*</p>`, 'g');
    const inlineRegex = new RegExp(markerPattern, 'g');

    return html
      .replace(
        paragraphRegex,
        '<span class="markdown-empty-line" aria-hidden="true"></span>'
      )
      .replace(
        inlineRegex,
        '<span class="markdown-empty-line" aria-hidden="true"></span>'
      )
      .replace(
        /<span class="markdown-empty-line" aria-hidden="true"><\/span>\s*<br\s*\/?>/g,
        '<span class="markdown-empty-line" aria-hidden="true"></span>'
      );
  };

  const renderMarkdown = (
    content: string,
    options?: {
      preserveLineBreaks?: boolean;
      onTransformHtml?: (html: string) => string;
    }
  ): string => {
    const shouldPreserve = options?.preserveLineBreaks === true;

    const parseOptions: MarkedOptions | undefined = shouldPreserve
      ? { breaks: true }
      : undefined;

    const source = shouldPreserve ? preprocessContent(content) : content;
    const html = marked.parse(source, parseOptions) as string;

    const processed = shouldPreserve ? postprocessHtml(html) : html;

    if (typeof options?.onTransformHtml === 'function') {
      return options.onTransformHtml(processed);
    }

    return processed;
  };

  return {
    renderMarkdown,
  };
};
