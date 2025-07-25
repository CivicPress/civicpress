import { marked } from 'marked';

export const useMarkdown = () => {
  // Configure marked to shift all headings up by 1 level
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }: { tokens: any[]; depth: number }) => {
    const text = tokens.map((token) => token.text).join('');
    const newLevel = Math.min(depth + 1, 6); // Shift up by 1, max h6
    return `<h${newLevel}>${text}</h${newLevel}>`;
  };

  marked.use({ renderer });

  const renderMarkdown = (content: string): string => {
    return marked.parse(content) as string;
  };

  return {
    renderMarkdown,
  };
};
