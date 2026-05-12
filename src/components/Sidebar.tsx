import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { FileText, ChevronRight, ChevronDown, Folder, FolderOpen, RotateCcw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { DirEntry, EditorTab } from '../types';

interface SidebarProps {
  visible: boolean;
  width: number;
  projectPath: string | null;
  onProjectChange: (path: string | null) => void;
  onOpenFolder: () => void;
  openTabs: EditorTab[];
  onOpenFile: (filePath: string) => void;
}

interface TreeNodeProps {
  entry: DirEntry;
  depth: number;
  expandedDirs: Set<string>;
  dirCache: Map<string, DirEntry[]>;
  openFilePaths: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (filePath: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  entry,
  depth,
  expandedDirs,
  dirCache,
  openFilePaths,
  onToggleDir,
  onOpenFile,
}) => {
  const isExpanded = expandedDirs.has(entry.path);
  const children = dirCache.get(entry.path) || [];
  const paddingLeft = 8 + depth * 14;

  if (entry.is_dir) {
    return (
      <div>
        <div
          className="flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer transition-colors hover:bg-[var(--te-bg-tertiary)] text-[var(--te-text-primary)]"
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => onToggleDir(entry.path)}
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-[var(--te-text-secondary)] shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-[var(--te-text-secondary)] shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen size={14} className="text-amber-500 shrink-0" />
          ) : (
            <Folder size={14} className="text-amber-500 shrink-0" />
          )}
          <span className="text-sm truncate select-none">{entry.name}</span>
        </div>
        {isExpanded && (
          <div>
            {children.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                dirCache={dirCache}
                openFilePaths={openFilePaths}
                onToggleDir={onToggleDir}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isOpen = openFilePaths.has(entry.path);

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors text-[var(--te-text-primary)] ${
        isOpen
          ? 'bg-[color-mix(in_srgb,var(--te-primary)_10%,transparent)] text-[var(--te-primary)]'
          : 'hover:bg-[var(--te-bg-tertiary)]'
      }`}
      style={{ paddingLeft: `${paddingLeft + 18}px` }}
      onClick={() => onOpenFile(entry.path)}
      title={entry.path}
    >
      <FileText size={13} className="text-[var(--te-text-secondary)] shrink-0" />
      <span className="text-sm truncate select-none">{entry.name}</span>
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = React.memo(({
  visible,
  width,
  projectPath,
  onProjectChange,
  onOpenFolder,
  openTabs,
  onOpenFile,
}) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirCache, setDirCache] = useState<Map<string, DirEntry[]>>(new Map());

  const openFilePaths = useMemo(() => {
    return new Set(openTabs.map((t) => t.filePath).filter(Boolean) as string[]);
  }, [openTabs]);

  const loadDirectory = useCallback(async (path: string) => {
    try {
      const entries = await invoke<DirEntry[]>('list_directory', { path });
      setDirCache((prev) => {
        const next = new Map(prev);
        next.set(path, entries);
        return next;
      });
    } catch (err) {
      console.error('Failed to list directory:', path, err);
    }
  }, []);

  const handleToggleDir = useCallback(
    async (path: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
      if (!dirCache.has(path)) {
        await loadDirectory(path);
      }
    },
    [dirCache, loadDirectory]
  );

  useEffect(() => {
    if (projectPath) {
      queueMicrotask(() => {
        setExpandedDirs(new Set([projectPath]));
        setDirCache(new Map());
        loadDirectory(projectPath);
      });
    }
  }, [projectPath, loadDirectory]);

  const handleCloseFolder = useCallback(() => {
    onProjectChange(null);
    setExpandedDirs(new Set());
    setDirCache(new Map());
  }, [onProjectChange]);

  const handleRefresh = useCallback(async () => {
    if (!projectPath) return;
    const toRefresh = [projectPath, ...Array.from(expandedDirs)];
    for (const path of toRefresh) {
      await loadDirectory(path);
    }
  }, [projectPath, expandedDirs, loadDirectory]);

  if (!visible) return null;

  const rootEntries = projectPath ? dirCache.get(projectPath) || [] : [];

  return (
    <div
      className="flex flex-col border-r"
      style={{ width: `${width}px`, minWidth: `${width}px`, backgroundColor: 'var(--te-bg-secondary)', borderColor: 'var(--te-border)' }}
    >
      {/* Project header */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--te-border)' }}>
        {projectPath ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <FolderOpen size={14} className="text-amber-500 shrink-0" />
              <span className="text-xs font-medium truncate" style={{ color: 'var(--te-text-secondary)' }} title={projectPath}>
                {projectPath.split(/[\\/]/).pop() || projectPath}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenFolder}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors hover:bg-[var(--te-bg-secondary)]"
                style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)', color: 'var(--te-text-primary)' }}
                title="打开其他文件夹"
              >
                <FolderOpen size={10} />
                打开
              </button>
              <button
                onClick={handleRefresh}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors hover:bg-[var(--te-bg-secondary)]"
                style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)', color: 'var(--te-text-primary)' }}
              >
                <RotateCcw size={10} />
                刷新
              </button>
              <button
                onClick={handleCloseFolder}
                className="flex-1 px-2 py-1 text-[10px] rounded border transition-colors hover:bg-[var(--te-bg-secondary)]"
                style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)', color: 'var(--te-text-primary)' }}
              >
                关闭
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onOpenFolder}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg transition-colors font-medium"
            style={{ backgroundColor: 'color-mix(in srgb, var(--te-primary) 10%, transparent)', color: 'var(--te-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--te-primary) 15%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--te-primary) 10%, transparent)'; }}
          >
            <FolderOpen size={14} />
            打开文件夹
          </button>
        )}
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-auto p-1.5">
        {projectPath ? (
          rootEntries.length > 0 ? (
            rootEntries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                expandedDirs={expandedDirs}
                dirCache={dirCache}
                openFilePaths={openFilePaths}
                onToggleDir={handleToggleDir}
                onOpenFile={onOpenFile}
              />
            ))
          ) : (
            <div className="text-center py-4 text-xs" style={{ color: 'var(--te-text-secondary)' }}>
              空文件夹
            </div>
          )
        ) : (
          <div className="text-center py-8 px-3">
            <Folder size={32} className="mx-auto mb-2" style={{ color: 'color-mix(in srgb, var(--te-text-secondary) 50%, transparent)' }} />
            <p className="text-xs" style={{ color: 'var(--te-text-secondary)' }}>
              打开一个文件夹<br />开始浏览项目文件
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

export default Sidebar;
Sidebar.displayName = 'Sidebar';
