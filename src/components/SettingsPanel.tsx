import React, { useState, useCallback, useEffect } from 'react';
import { X, Pencil, Palette, Star, Sun, Moon, Sparkles, HelpCircle, Puzzle } from 'lucide-react';
import { useSettingsStore } from '../hooks/useSettingsStore';
import ThemeEditor from './ThemeEditor';
import EditorHelp from './EditorHelp';
import type { ThemeMode } from '../types';
import { desktopApi } from '../platform/desktop';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
}

type SettingsCategory = 'editor' | 'appearance' | 'application' | 'extension';

const CATEGORIES: { key: SettingsCategory; label: string; icon: React.ReactNode }[] = [
  { key: 'editor', label: '编辑器', icon: <Pencil size={16} /> },
  { key: 'appearance', label: '外观', icon: <Palette size={16} /> },
  { key: 'extension', label: '扩展', icon: <Puzzle size={16} /> },
  { key: 'application', label: '应用', icon: <Star size={16} /> },
];

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}> = ({ label, checked, onChange, title }) => (
  <label className="flex items-center justify-between cursor-pointer group py-2" title={title}>
    <span className="text-sm" style={{ color: 'var(--te-text-primary)' }}>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="rounded cursor-pointer"
      style={{
        accentColor: 'var(--te-primary)',
        width: '16px',
        height: '16px',
      }}
    />
  </label>
);

const SettingsPanel: React.FC<SettingsPanelProps> = React.memo(({ visible, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('editor');
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const unicodeHighlight = useSettingsStore((s) => s.unicodeHighlight);
  const setUnicodeHighlight = useSettingsStore((s) => s.setUnicodeHighlight);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const largeFileOptimize = useSettingsStore((s) => s.largeFileOptimize);
  const setLargeFileOptimize = useSettingsStore((s) => s.setLargeFileOptimize);
  const minimapVisible = useSettingsStore((s) => s.minimapVisible);
  const setMinimapVisible = useSettingsStore((s) => s.setMinimapVisible);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const setWordWrap = useSettingsStore((s) => s.setWordWrap);
  const showWhitespace = useSettingsStore((s) => s.showWhitespace);
  const setShowWhitespace = useSettingsStore((s) => s.setShowWhitespace);
  const scrollPastEnd = useSettingsStore((s) => s.scrollPastEnd);
  const setScrollPastEnd = useSettingsStore((s) => s.setScrollPastEnd);
  const columnAlignSupported = useSettingsStore((s) => s.columnAlignSupported);
  const setColumnAlignSupported = useSettingsStore((s) => s.setColumnAlignSupported);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible) {
      queueMicrotask(() => {
        setShowThemeEditor(false);
        setShowHelp(false);
      });
    }
  }, [visible]);

  // ESC to close
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showThemeEditor) {
          setShowThemeEditor(false);
        } else if (showHelp) {
          setShowHelp(false);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, showThemeEditor, showHelp, handleClose]);

  const handleRegisterDefaultApp = useCallback(async () => {
    if (!desktopApi.isDesktop()) return;
    try {
      const result = await desktopApi.registerDefaultApp();
      console.log('[RegisterDefault]', result);
    } catch (err) {
      console.error('[RegisterDefault]', err);
    }
  }, []);

  const handleCycleTheme = useCallback(() => {
    setTheme((prev: ThemeMode) => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'custom';
      return 'light';
    });
  }, [setTheme]);

  const themeLabel = theme === 'light' ? '亮色' : theme === 'dark' ? '暗色' : '自定义';
  const themeIcon = theme === 'light' ? <Sun size={14} /> : theme === 'dark' ? <Moon size={14} /> : <Sparkles size={14} />;

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={handleClose}
    >
      <div
        className="w-[640px] max-w-[92vw] h-[520px] max-h-[85vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden"
        style={{ backgroundColor: 'var(--te-bg-secondary)', borderColor: 'var(--te-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--te-border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--te-text-primary)' }}>设置</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:opacity-70 transition-opacity"
            style={{ color: 'var(--te-text-secondary)' }}
            title="关闭 (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: left nav + right content */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left navigation */}
          <div
            className="w-[164px] shrink-0 border-r flex flex-col py-3 gap-0.5 overflow-auto"
            style={{ borderColor: 'var(--te-border)', backgroundColor: 'var(--te-bg-secondary)' }}
          >
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className="flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left"
                  style={{
                    color: active ? 'var(--te-primary)' : 'var(--te-text-secondary)',
                    backgroundColor: active ? 'color-mix(in srgb, var(--te-primary) 10%, transparent)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--te-text-primary) 5%, transparent)';
                      e.currentTarget.style.color = 'var(--te-text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--te-text-secondary)';
                    }
                  }}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-auto p-5 min-w-0">
            {activeCategory === 'editor' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--te-text-secondary)' }}>
                    编辑器设置
                  </label>
                  <div className="rounded-lg p-4 border space-y-1" style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)' }}>
                    <div className="pb-3 border-b mb-2" style={{ borderColor: 'var(--te-border)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm" style={{ color: 'var(--te-text-primary)' }}>字体大小</span>
                        <span className="text-sm font-mono" style={{ color: 'var(--te-primary)' }}>{fontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={24}
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        className="w-full cursor-pointer"
                        style={{ accentColor: 'var(--te-primary)' }}
                      />
                    </div>
                    <ToggleRow label="自动换行" checked={wordWrap} onChange={setWordWrap} />
                    <ToggleRow label="显示空白字符" checked={showWhitespace} onChange={setShowWhitespace} />
                    <ToggleRow label="迷你地图" checked={minimapVisible} onChange={setMinimapVisible} />
                    <ToggleRow label="滚动超出末尾" checked={scrollPastEnd} onChange={setScrollPastEnd} />
                    <ToggleRow label="大文件性能优化" checked={largeFileOptimize} onChange={setLargeFileOptimize} title="打开大文件时自动禁用高亮、折叠等功能以提升性能" />
                    <ToggleRow label="全角半角检测" checked={unicodeHighlight} onChange={setUnicodeHighlight} />
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'appearance' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--te-text-secondary)' }}>
                    外观
                  </label>
                  <div className="rounded-lg p-4 border space-y-4" style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--te-text-primary)' }}>当前主题</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--te-text-secondary)' }}>
                          点击切换亮色 / 暗色 / 自定义
                        </div>
                      </div>
                      <button
                        onClick={handleCycleTheme}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium"
                        style={{
                          borderColor: 'var(--te-border)',
                          color: 'var(--te-primary)',
                          backgroundColor: 'color-mix(in srgb, var(--te-primary) 10%, transparent)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--te-primary) 15%, transparent)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--te-primary) 10%, transparent)';
                        }}
                      >
                        {themeIcon}
                        {themeLabel}
                      </button>
                    </div>

                    <div className="pt-3 border-t" style={{ borderColor: 'var(--te-border)' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--te-text-primary)' }}>编辑主题颜色</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--te-text-secondary)' }}>
                            自定义亮色、暗色和独立主题的颜色配置
                          </div>
                        </div>
                        <button
                          onClick={() => setShowThemeEditor(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium"
                          style={{
                            borderColor: 'var(--te-border)',
                            color: 'var(--te-text-primary)',
                            backgroundColor: 'var(--te-bg-secondary)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--te-bg-tertiary)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--te-bg-secondary)';
                          }}
                        >
                          <Palette size={14} />
                          编辑颜色
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'extension' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--te-text-secondary)' }}>
                    扩展
                  </label>
                  <div className="rounded-lg p-4 border space-y-1" style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)' }}>
                    <ToggleRow
                      label="支持列对齐"
                      checked={columnAlignSupported}
                      onChange={setColumnAlignSupported}
                      title="勾选后显示列对齐状态栏按钮，可开启列对齐"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'application' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--te-text-secondary)' }}>
                    应用
                  </label>
                  <div className="rounded-lg p-4 border space-y-4" style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)' }}>
                    {desktopApi.isDesktop() && (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--te-text-primary)' }}>设为默认文本编辑器</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--te-text-secondary)' }}>
                            注册为 .txt、.md、.js 等文件类型的默认打开方式
                          </div>
                        </div>
                        <button
                          onClick={handleRegisterDefaultApp}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium"
                          style={{
                            borderColor: 'var(--te-border)',
                            color: 'var(--te-primary)',
                            backgroundColor: 'color-mix(in srgb, var(--te-primary) 10%, transparent)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--te-primary) 15%, transparent)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--te-primary) 10%, transparent)';
                          }}
                        >
                          <Star size={14} />
                          注册
                        </button>
                      </div>
                    )}

                    <div className={desktopApi.isDesktop() ? 'pt-3 border-t' : ''} style={{ borderColor: 'var(--te-border)' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--te-text-primary)' }}>使用说明</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--te-text-secondary)' }}>
                            查看编辑器快捷键与功能说明
                          </div>
                        </div>
                        <button
                          onClick={() => setShowHelp(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium"
                          style={{
                            borderColor: 'var(--te-border)',
                            color: 'var(--te-text-primary)',
                            backgroundColor: 'var(--te-bg-secondary)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--te-bg-tertiary)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--te-bg-secondary)';
                          }}
                        >
                          <HelpCircle size={14} />
                          打开
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showThemeEditor && <ThemeEditor onClose={() => setShowThemeEditor(false)} />}
      {showHelp && <EditorHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
});

SettingsPanel.displayName = 'SettingsPanel';
export default SettingsPanel;
