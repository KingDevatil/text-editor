import React from 'react';
import {
  FilePlus,
  FolderOpen,
  FolderTree,
  Save,
  Search,
  Sun,
  Moon,
  Palette,
  PanelLeft,
  Braces,
  BookOpen,
  Columns2,
  Eye,
  Settings,
  ListTree,
} from 'lucide-react';
import type { ThemeMode } from '../types';
import { desktopApi } from '../platform/desktop';

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
  onToggleReadMode: () => void;
  onToggleSettings: () => void;
  onToggleJsonForm: () => void;
  canFormat: boolean;
  canPreview: boolean;
  previewActive: boolean;
  canSplit: boolean;
  splitActive: boolean;
  canReadMode: boolean;
  readModeActive: boolean;
  canJsonForm: boolean;
  jsonFormActive: boolean;
  theme: ThemeMode;
}

const Toolbar: React.FC<ToolbarProps> = React.memo(({
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
  onToggleReadMode,
  onToggleSettings,
  onToggleJsonForm,
  canFormat,
  canPreview,
  previewActive,
  canSplit,
  splitActive,
  canReadMode,
  readModeActive,
  canJsonForm,
  jsonFormActive,
  theme,
}) => {
  const btnBase =
    'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-100 active:scale-95 hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]';

  const nextThemeIcon = theme === 'light' ? <Moon size={16} /> : theme === 'dark' ? <Palette size={16} /> : <Sun size={16} />;
  const nextThemeLabel = theme === 'light' ? '切换暗色主题' : theme === 'dark' ? '切换自定义主题' : '切换亮色主题';

  const btnStyle: React.CSSProperties = { color: 'var(--te-toolbar-button-text)' };
  const activeStyle: React.CSSProperties = {
    backgroundColor: 'color-mix(in srgb, var(--te-primary) 15%, transparent)',
    color: 'var(--te-primary)',
  };
  const dividerStyle: React.CSSProperties = { backgroundColor: 'var(--te-border)' };

  return (
    <div className="flex items-center gap-1 px-3 h-11 border-b" style={{ backgroundColor: 'var(--te-bg-secondary)', borderColor: 'var(--te-border)' }}>
      {/* 最左侧：切换侧边栏 */}
      <div className="flex items-center gap-1">
        <button className={btnBase} style={btnStyle} onClick={onToggleSidebar} title="切换侧边栏">
          <PanelLeft size={16} />
        </button>
      </div>

      <div className="w-px h-5 mx-1" style={dividerStyle} />

      {/* 文件操作 */}
      <div className="flex items-center gap-1">
        <button className={btnBase} style={btnStyle} onClick={onNewFile} title="新建文件 (Ctrl+N)">
          <FilePlus size={16} />
          <span className="hidden sm:inline font-medium">新建</span>
        </button>
        <button className={btnBase} style={btnStyle} onClick={onOpenFile} title="打开文件 (Ctrl+O)">
          <FolderOpen size={16} />
          <span className="hidden sm:inline font-medium">打开</span>
        </button>
        {desktopApi.isDesktop() && (
          <button className={btnBase} style={btnStyle} onClick={onOpenFolder} title="打开文件夹">
            <FolderTree size={16} />
            <span className="hidden sm:inline font-medium">文件夹</span>
          </button>
        )}
        <button className={btnBase} style={btnStyle} onClick={onSaveFile} title="保存文件 (Ctrl+S)">
          <Save size={16} />
          <span className="hidden sm:inline font-medium">保存</span>
        </button>
      </div>

      <div className="w-px h-5 mx-1" style={dividerStyle} />

      {/* 编辑操作 */}
      <div className="flex items-center gap-1">
        <button className={btnBase} style={btnStyle} onClick={onToggleFindReplace} title="查找替换 (Ctrl+F)">
          <Search size={16} />
        </button>
        <button
          className={`${btnBase} ${!canFormat ? 'opacity-40 cursor-not-allowed active:scale-100' : ''}`}
          style={btnStyle}
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
          className={`${btnBase} ${!canPreview || splitActive ? 'opacity-40 cursor-not-allowed active:scale-100' : ''}`}
          style={previewActive ? activeStyle : btnStyle}
          onClick={onTogglePreview}
          disabled={!canPreview || splitActive}
          title="预览"
        >
          <BookOpen size={16} />
          <span className="hidden sm:inline font-medium">预览</span>
        </button>
        <button
          className={`${btnBase} ${!canJsonForm ? 'opacity-40 cursor-not-allowed active:scale-100' : ''}`}
          style={jsonFormActive ? activeStyle : btnStyle}
          onClick={onToggleJsonForm}
          disabled={!canJsonForm}
          title="JSON 表单 (Ctrl+Shift+J)"
        >
          <ListTree size={16} />
          <span className="hidden sm:inline font-medium">表单</span>
        </button>
        <button
          className={`${btnBase} ${!canReadMode ? 'opacity-40 cursor-not-allowed active:scale-100' : ''}`}
          style={readModeActive ? activeStyle : btnStyle}
          onClick={onToggleReadMode}
          disabled={!canReadMode}
          title="阅读模式 (Ctrl+Shift+V)"
        >
          <Eye size={16} />
          <span className="hidden sm:inline font-medium">阅读</span>
        </button>
        <button
          className={`${btnBase} ${!canSplit ? 'opacity-40 cursor-not-allowed active:scale-100' : ''}`}
          style={splitActive ? activeStyle : btnStyle}
          onClick={onToggleSplit}
          disabled={!canSplit}
          aria-label="split-editor"
          title={
            !canSplit
              ? '分屏编辑（需要至少 2 个标签页）'
              : previewActive
                ? '分屏编辑（将自动关闭预览）'
                : '分屏编辑'
          }
        >
          <Columns2 size={16} />
          <span className="hidden sm:inline font-medium">分屏</span>
        </button>
        <button className={btnBase} style={btnStyle} onClick={onToggleTheme} title={nextThemeLabel}>
          {nextThemeIcon}
        </button>
        <div className="w-px h-5 mx-1" style={dividerStyle} />
        <button className={btnBase} style={btnStyle} onClick={onToggleSettings} title="设置">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
});

export default Toolbar;
Toolbar.displayName = 'Toolbar';
