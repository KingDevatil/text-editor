import React, { useMemo } from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import type { SearchMatch } from '../services/searchService';
import { formatMatchPreview } from '../services/searchService';

interface SearchResultsViewProps {
  query: string;
  directory: string;
  matches: SearchMatch[];
  truncated?: boolean;
  isLoading?: boolean;
  onOpenFile: (filePath: string, lineNumber: number) => void;
}

interface FileGroup {
  filePath: string;
  matches: SearchMatch[];
}

const SearchResultsView: React.FC<SearchResultsViewProps> = ({
  query,
  directory,
  matches,
  truncated = false,
  isLoading = false,
  onOpenFile,
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, SearchMatch[]>();
    for (const m of matches) {
      const arr = map.get(m.filePath) || [];
      arr.push(m);
      map.set(m.filePath, arr);
    }
    const result: FileGroup[] = [];
    for (const [filePath, fileMatches] of map) {
      result.push({ filePath, matches: fileMatches });
    }
    // Sort by file path for stable ordering
    result.sort((a, b) => a.filePath.localeCompare(b.filePath));
    return result;
  }, [matches]);

  const totalFiles = groups.length;
  const totalMatches = matches.length;

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[var(--te-text-secondary)] bg-[var(--te-bg-primary)]">
        <div className="w-6 h-6 border-2 border-[var(--te-primary)] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm">正在搜索…</p>
        <p className="text-xs mt-1 opacity-70">目录: {directory}</p>
      </div>
    );
  }

  if (totalMatches === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[var(--te-text-secondary)] bg-[var(--te-bg-primary)]">
        <AlertCircle size={32} className="mb-3 opacity-50" />
        <p className="text-sm">未找到匹配项</p>
        <p className="text-xs mt-1 opacity-70">
          目录: {directory}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--te-bg-primary)] text-[var(--te-text-primary)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-[var(--te-border)] bg-[var(--te-bg-secondary)] flex items-center gap-2 shrink-0">
        <span className="text-sm font-medium truncate">
          &ldquo;{query}&rdquo;
        </span>
        <span className="text-xs text-[var(--te-text-secondary)]">
          — 在 {directory} 中找到 {totalFiles} 个文件，{totalMatches} 处匹配
        </span>
        {truncated && (
          <span className="text-xs font-medium" style={{ color: 'var(--te-warning)' }}>
            仅显示前 {totalMatches} 条
          </span>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-auto py-1">
        {groups.map((group) => (
          <div
            key={group.filePath}
            className="mb-1"
            style={{ contentVisibility: 'auto', containIntrinsicSize: '80px' }}
          >
            {/* File header */}
            <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0 bg-[var(--te-bg-secondary)] border-b border-[var(--te-border)]">
              <FileText size={12} className="text-[var(--te-text-secondary)] shrink-0" />
              <span className="text-xs font-medium truncate" style={{ color: 'var(--te-primary)' }}>
                {group.filePath}
              </span>
              <span className="text-xs text-[var(--te-text-secondary)] shrink-0">
                ({group.matches.length} 处匹配)
              </span>
            </div>

            {/* Matches */}
            {group.matches.map((match, idx) => {
              const preview = formatMatchPreview(
                match.lineText,
                match.matchStart,
                match.matchEnd
              );
              return (
                <button
                  key={`${match.filePath}-${match.lineNumber}-${idx}`}
                  className="w-full text-left px-3 py-1 hover:bg-[color-mix(in_srgb,var(--te-bg-secondary)_60%,transparent)] transition-colors"
                  onClick={() => onOpenFile(match.filePath, match.lineNumber)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-[var(--te-text-secondary)] shrink-0 w-10 text-right select-none mt-0.5">
                      {match.lineNumber}
                    </span>
                    <code className="text-xs break-all font-mono leading-relaxed">
                      <span className="text-[var(--te-text-secondary)]">{preview.before}</span>
                      <span
                        className="font-bold"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--te-primary) 25%, transparent)',
                          color: 'var(--te-text-primary)',
                        }}
                      >
                        {preview.match}
                      </span>
                      <span className="text-[var(--te-text-secondary)]">{preview.after}</span>
                    </code>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(SearchResultsView);
