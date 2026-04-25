import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { FileText, Settings, ChevronRight, ChevronDown, Folder, FolderOpen, RotateCcw, FolderOpenIcon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { DirEntry, EditorTab } from '../types';

interface SidebarProps {
  visible: boolean;
  width: number;
  unicodeHighlight: boolean;
  onToggleUnicodeHighlight: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
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
          className="flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer transition-colors hover:bg-gray-200/60 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300"
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => onToggleDir(entry.path)}
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-gray-400 shrink-0" />
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
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer transition-colors text-gray-700 dark:text-gray-300 ${
        isOpen
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
          : 'hover:bg-gray-200/60 dark:hover:bg-gray-800/60'
      }`}
      style={{ paddingLeft: `${paddingLeft + 18}px` }}
      onClick={() => onOpenFile(entry.path)}
      title={entry.path}
    >
      <FileText size={13} className="text-gray-400 shrink-0" />
      <span className="text-sm truncate select-none">{entry.name}</span>
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({
  visible,
  width,
  unicodeHighlight,
  onToggleUnicodeHighlight,
  fontSize,
  onFontSizeChange,
  largeFileOptimize,
  projectPath,
  onProjectChange,
  onOpenFolder,
  openTabs,
  onOpenFile,
}) => {
  const [activeSection, setActiveSection] = useState<'files' | 'settings'>('files');
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
      // Load children if not cached
      if (!dirCache.has(path)) {
        await loadDirectory(path);
      }
    },
    [dirCache, loadDirectory]
  );

  // Auto-load root directory when project changes
  useEffect(() => {
    if (projectPath) {
      setExpandedDirs(new Set([projectPath]));
      setDirCache(new Map());
      loadDirectory(projectPath);
    }
  }, [projectPath]);

  const handleCloseFolder = useCallback(() => {
    onProjectChange(null);
    setExpandedDirs(new Set());
    setDirCache(new Map());
  }, [onProjectChange]);

  const handleRefresh = useCallback(async () => {
    if (!projectPath) return;
    // Refresh all expanded directories
    const toRefresh = [projectPath, ...Array.from(expandedDirs)];
    for (const path of toRefresh) {
      await loadDirectory(path);
    }
  }, [projectPath, expandedDirs, loadDirectory]);

  if (!visible) return null;

  const sectionBtnClass = (active: boolean) =>
    `relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
      active
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`;

  const rootEntries = projectPath ? dirCache.get(projectPath) || [] : [];

  return (
    <div
      className="flex flex-col border-r border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900"
      style={{ width: `${width}px`, minWidth: `${width}px` }}
    >
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700/80 relative">
        <button
          onClick={() => setActiveSection('files')}
          className={sectionBtnClass(activeSection === 'files')}
        >
          <FolderOpen size={14} />
          文件
        </button>
        <button
          onClick={() => setActiveSection('settings')}
          className={sectionBtnClass(activeSection === 'settings')}
        >
          <Settings size={14} />
          设置
        </button>
        <div
          className="absolute bottom-0 h-0.5 bg-blue-500 rounded-full transition-all duration-200"
          style={{
            width: '50%',
            left: activeSection === 'files' ? '0%' : '50%',
          }}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {activeSection === 'files' && (
          <div className="text-sm">
            {/* Project header */}
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700/80">
              {projectPath ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <FolderOpenIcon size={14} className="text-amber-500 shrink-0" />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate" title={projectPath}>
                      {projectPath.split(/[\\/]/).pop() || projectPath}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={onOpenFolder}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      title="打开其他文件夹"
                    >
                      <FolderOpenIcon size={10} />
                      打开
                    </button>
                    <button
                      onClick={handleRefresh}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <RotateCcw size={10} />
                      刷新
                    </button>
                    <button
                      onClick={handleCloseFolder}
                      className="flex-1 px-2 py-1 text-[10px] rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onOpenFolder}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors font-medium"
                >
                  <FolderOpenIcon size={14} />
                  打开文件夹
                </button>
              )}
            </div>

            {/* File tree */}
            <div className="p-1.5">
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
                  <div className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">
                    空文件夹
                  </div>
                )
              ) : (
                <div className="text-center py-8 px-3">
                  <Folder size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    打开一个文件夹<br />开始浏览项目文件
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'settings' && (
          <div className="space-y-4 text-sm text-gray-700 dark:text-gray-200 p-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                编辑器设置
              </label>
              <div className="space-y-2.5 bg-white dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700/50">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">全角半角检测</span>
                  <input
                    type="checkbox"
                    checked={unicodeHighlight}
                    onChange={onToggleUnicodeHighlight}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">显示行号</span>
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">自动换行</span>
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">迷你地图</span>
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                </label>
                <label className="flex items-center justify-between cursor-pointer group" title="打开大文件时自动禁用高亮、折叠等功能以提升性能">
                  <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">大文件性能优化</span>
                  <input
                    type="checkbox"
                    checked={largeFileOptimize}
                    onChange={onToggleLargeFileOptimize}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                字体大小
              </label>
              <div className="bg-white dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="24"
                  value={fontSize}
                  onChange={(e) => onFontSizeChange(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
