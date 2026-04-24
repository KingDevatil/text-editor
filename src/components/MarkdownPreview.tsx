import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownPreviewProps {
  content: string;
  theme: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, theme }) => {
  const html = useMemo(() => {
    return marked.parse(content, { async: false }) as string;
  }, [content]);

  const isDark = theme === 'vs-dark' || theme === 'hc-black';

  return (
    <div
      className="w-full h-full overflow-auto px-6 py-6"
      style={{
        backgroundColor: isDark ? '#0d1117' : '#ffffff',
      }}
    >
      <div
        className={`prose max-w-none ${isDark ? 'prose-invert' : ''}`}
        style={{ color: isDark ? '#c9d1d9' : '#24292f' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

export default MarkdownPreview;
