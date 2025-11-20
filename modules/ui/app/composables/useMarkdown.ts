import { marked, type MarkedOptions } from 'marked';

// In Nuxt, useRuntimeConfig is globally available at runtime.
// We declare it here for TypeScript without importing '#imports',
// so that plain Vitest tests can import this module without Nuxt aliases.
declare function useRuntimeConfig(): any;

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

  const getApiBaseUrl = (): string => {
    try {
      // useRuntimeConfig will be available in a Nuxt runtime environment
      if (typeof useRuntimeConfig === 'function') {
        const runtimeConfig = useRuntimeConfig();
        const url = (runtimeConfig?.public as any)?.civicApiUrl;
        if (typeof url === 'string' && url.length > 0) {
          return url;
        }
      }
    } catch {
      // Ignore errors and fall back to relative URLs
    }
    return '';
  };

  /**
   * Normalize internal storage image URLs:
   * - If the image URL is a bare UUID, rewrite to /api/v1/storage/files/<uuid>
   * - External/absolute URLs (http/https) are left untouched
   *
   * This allows markdown content to store only the UUID for internal storage images.
   */
  const normalizeInternalImageUrls = (content: string): string => {
    const apiBaseUrl = getApiBaseUrl();

    // Matches markdown image syntax where the URL is a bare UUID:
    // ![alt](123e4567-e89b-12d3-a456-426614174000)
    const uuidImageRegex =
      /(!\[[^\]]*]\()([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\))/gi;

    return content.replace(uuidImageRegex, (_match, prefix, uuid, suffix) => {
      // If we have an explicit API base URL, use it (for dev/prod).
      // Otherwise, fall back to a relative path.
      if (apiBaseUrl) {
        const base = apiBaseUrl.replace(/\/+$/, '');
        return `${prefix}${base}/api/v1/storage/files/${uuid}${suffix}`;
      }

      return `${prefix}/api/v1/storage/files/${uuid}${suffix}`;
    });
  };

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

    // First, normalize any internal image URLs that use bare UUIDs
    const normalizedContent = normalizeInternalImageUrls(content);

    const parseOptions: MarkedOptions | undefined = shouldPreserve
      ? { breaks: true }
      : undefined;

    const source = shouldPreserve
      ? preprocessContent(normalizedContent)
      : normalizedContent;
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
