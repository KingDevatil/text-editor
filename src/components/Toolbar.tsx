import React from 'react';
import { isTauri } from '@tauri-apps/api/core';
import {
  FilePlus,
  FolderOpen,
  FolderTree,
  Save,
  Search,
  Sun,
  Moon,
  Contrast,
  PanelLeft,
  Braces,
  BookOpen,
  Columns2,
} from 'lucide-react';

interface ToolbarProps {
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onSaveFile: () => void;
  onToggleFindReplace: () => void;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onFormat: () => void;
  onTogglePreview: () => void;
  onToggleSplit: () => void;
  canFormat: boolean;
  canPreview: boolean;
  previewActive: boolean;
  canSplit: boolean;
  splitActive: boolean;
  theme: string;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onNewFile,
  onOpenFile,
  onOpenFolder,
  onSaveFile,
  onToggleFindReplace,
  onToggleTheme,
  onToggleSidebar,
  onFormat,
  onTogglePreview,
  onToggleSplit,
  canFormat,
  canPreview,
  previewActive,
  canSplit,
  splitActive,
  theme,
}) => {
  const btnClass =
    'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-100 hover:bg-gray-200/80 dark:hover:bg-gray-700/80 text-gray-700 dark:text-gray-200 active:scale-95';

  const activeBtnClass =
    'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]';

  const dividerClass = 'w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1';

  // Show icon of the NEXT theme that clicking will switch to
  const nextThemeIcon = (() => {
    if (theme === 'vs') return <Moon size={16} />;           // next: dark
    if (theme === 'vs-dark') return <Contrast size={16} />;  // next: high contrast
    return <Sun size={16} />;                                 // next: light (hc-black)
  })();

  const nextThemeLabel = (() => {
    if (theme === 'vs') return '切换暗色主题';
    if (theme === 'vs-dark') return '切换高对比主题';
    return '切换亮色主题';
  })();

  return (
    <div className="flex items-center gap-1 px-3 h-11 border-b border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900">
      {/* 最左侧：切换侧边栏 */}
      <div className="flex items-center gap-1">
        <button className={btnClass} onClick={onToggleSidebar} title="切换侧边栏">
          <PanelLeft size={16} />
        </button>
      </div>

      <div className={dividerClass} />

      {/* 文件操作 */}
      <div className="flex items-center gap-1">
        <button className={btnClass} onClick={onNewFile} title="新建文件 (Ctrl+N)">
          <FilePlus size={16} />
          <span className="hidden sm:inline font-medium">新建</span>
        </button>
        <button className={btnClass} onClick={onOpenFile} title="打开文件 (Ctrl+O)">
          <FolderOpen size={16} />
          <span className="hidden sm:inline font-medium">打开</span>
        </button>
        {isTauri() && (
          <button className={btnClass} onClick={onOpenFolder} title="打开文件夹">
            <FolderTree size={16} />
            <span className="hidden sm:inline font-medium">文件夹</span>
          </button>
        )}
        <button className={btnClass} onClick={onSaveFile} title="保存文件 (Ctrl+S)">
          <Save size={16} />
          <span className="hidden sm:inline font-medium">保存</span>
        </button>
      </div>

      <div className={dividerClass} />

      {/* 编辑操作 */}
      <div className="flex items-center gap-1">
        <button className={btnClass} onClick={onToggleFindReplace} title="查找替换 (Ctrl+F)">
          <Search size={16} />
        </button>
        <button
          className={`${btnClass} ${!canFormat ? 'opacity-40 cursor-not-allowed active:scale-100' : ''}`}
          onClick={onFormat}
          disabled={!canFormat}
          title="格式化文档 (Shift+Alt+F)"
        >
          <Braces size={16} />
          <span className="hidden sm:inline font-medium">格式化</span>
        </button>
      </div>

      <div className="flex-1" />

      {/* 右侧：预览 + 分屏 + 主题切换 */}
      <div className="flex items-center gap-1">
        <button
          className={`${btnClass} ${!canPreview || splitActive ? 'opacity-40 cursor-not-allowed active:scale-100' : ''} ${previewActive ? activeBtnClass : ''}`}
          onClick={onTogglePreview}
          disabled={!canPreview || splitActive}
          title="Markdown 预览"
        >
          <BookOpen size={16} />
          <span className="hidden sm:inline font-medium">预览</span>
        </button>
        <button
          className={`${btnClass} ${!canSplit || previewActive ? 'opacity-40 cursor-not-allowed active:scale-100' : ''} ${splitActive ? activeBtnClass : ''}`}
          onClick={onToggleSplit}
          disabled={!canSplit || previewActive}
          title="分屏编辑"
        >
          <Columns2 size={16} />
          <span className="hidden sm:inline font-medium">分屏</span>
        </button>
        <button className={btnClass} onClick={onToggleTheme} title={nextThemeLabel}>
          {nextThemeIcon}
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
