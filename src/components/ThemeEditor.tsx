import React, { useState, useCallback, useMemo } from 'react';
import { X, RotateCcw, Download, Upload, Check } from 'lucide-react';
import type { ThemeColors, ThemeMode, PartialThemeColors } from '../types';
import { defaultLightColors, defaultDarkColors } from '../utils/themeDefaults';
import { useSettingsStore } from '../hooks/useSettingsStore';

interface ThemeEditorProps {
  onClose: () => void;
}

interface ColorItemMeta {
  key: keyof ThemeColors;
  title: string;
  area: string;
}

const COLOR_ITEMS: ColorItemMeta[] = [
  // UI Core
  { key: 'bgPrimary', title: '主背景色', area: '编辑器、预览、阅读模式' },
  { key: 'bgSecondary', title: '次背景色', area: '标题栏、工具栏、侧边栏、标签栏、状态栏' },
  { key: 'bgTertiary', title: '三级背景色', area: '下拉菜单、卡片、按钮、上下文菜单' },
  { key: 'textPrimary', title: '主文字色', area: '标签名、内容文字' },
  { key: 'textSecondary', title: '次文字色', area: '图标、提示文字' },
  { key: 'border', title: '边框色', area: '所有分割线、边框' },
  { key: 'primary', title: '强调色', area: '选中态、按钮激活、标签指示器' },
  { key: 'primaryText', title: '强调文字色', area: '激活态文字' },
  // Editor
  { key: 'editorGutterBg', title: '行号区背景', area: 'CodeMirror 左侧行号栏' },
  { key: 'editorGutterText', title: '行号文字色', area: '行号数字' },
  { key: 'editorBracketMatch', title: '括号配对颜色', area: '括号配对下划线与 ◆ 标记' },
  { key: 'editorNonmatchingBracket', title: '括号不匹配颜色', area: '不匹配的括号下划线与背景' },
  { key: 'editorCursor', title: '光标颜色', area: '编辑器插入光标' },
  { key: 'editorSelection', title: '选中高亮色', area: '文字选中背景' },
  { key: 'editorActiveLine', title: '当前行高亮', area: '光标所在行背景' },
  { key: 'editorMatchHighlight', title: '搜索匹配高亮', area: '查找其他匹配项背景' },
  { key: 'editorSelectionMatch', title: '选中词匹配高亮', area: '当前选中单词在其他位置的高亮' },
  { key: 'editorSearchMatchActiveBg', title: '当前搜索匹配背景', area: '查找时光标所在匹配项背景' },
  { key: 'editorSearchMatchActiveText', title: '当前搜索匹配文字', area: '查找时光标所在匹配项文字' },
  { key: 'tabActiveBg', title: '激活标签背景', area: '当前激活标签页的背景色' },
  // Status
  { key: 'success', title: '成功色', area: '已保存提示' },
  { key: 'warning', title: '警告色', area: '未保存提示' },
  { key: 'error', title: '错误色', area: '关闭按钮悬停' },
  // Scrollbar
  { key: 'scrollbarThumb', title: '滚动条滑块', area: '全局滚动条' },
  { key: 'scrollbarThumbHover', title: '滚动条滑块悬停', area: '全局滚动条悬停态' },
];

function toHex(color: string): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return color;
  ctx.fillStyle = color;
  const computed = ctx.fillStyle;
  if (computed.startsWith('#')) return computed;
  // Parse rgb/rgba
  const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) {
    const r = parseInt(m[1]).toString(16).padStart(2, '0');
    const g = parseInt(m[2]).toString(16).padStart(2, '0');
    const b = parseInt(m[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return color;
}

const ColorInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const hexValue = useMemo(() => {
    try { return toHex(value); } catch { return value; }
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8 rounded overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--te-border)' }}>
        <input
          type="color"
          value={hexValue}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 p-0 border-0 cursor-pointer"
        />
      </div>
      <input
        type="text"
        value={hexValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 px-1.5 py-0.5 text-xs font-mono rounded border bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--te-primary)]"
        style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-primary)' }}
      />
    </div>
  );
};

const ThemeEditor: React.FC<ThemeEditorProps> = ({ onClose }) => {
  const [tab, setTab] = useState<ThemeMode>('light');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const lightCustom = useSettingsStore((s) => s.lightCustomColors);
  const darkCustom = useSettingsStore((s) => s.darkCustomColors);
  const custom = useSettingsStore((s) => s.customColors);
  const setLightColor = useSettingsStore((s) => s.setLightCustomColor);
  const setDarkColor = useSettingsStore((s) => s.setDarkCustomColor);
  const setCustomColor = useSettingsStore((s) => s.setCustomColor);
  const resetLight = useSettingsStore((s) => s.resetLightCustomColors);
  const resetDark = useSettingsStore((s) => s.resetDarkCustomColors);
  const resetCustom = useSettingsStore((s) => s.resetCustomColors);

  const defaults = tab === 'light' ? defaultLightColors : tab === 'dark' ? defaultDarkColors : defaultLightColors;
  const customColors = tab === 'light' ? lightCustom : tab === 'dark' ? darkCustom : custom;
  const setColor = tab === 'light' ? setLightColor : tab === 'dark' ? setDarkColor : setCustomColor;
  const reset = tab === 'light' ? resetLight : tab === 'dark' ? resetDark : resetCustom;

  const handleResetOne = useCallback((key: keyof ThemeColors) => {
    const next: PartialThemeColors = { ...customColors };
    delete next[key];
    // 逐个设置剩余的颜色来"删除"一个键
    reset();
    Object.entries(next).forEach(([k, v]) => setColor(k as keyof ThemeColors, v));
  }, [customColors, reset, setColor]);

  const handleResetAll = useCallback(() => {
    reset();
  }, [reset]);

  const handleExport = useCallback(() => {
    const exported: Record<string, string> = {};
    Object.entries(customColors).forEach(([k, v]) => {
      if (v && v !== defaults[k as keyof ThemeColors]) {
        exported[k] = v;
      }
    });
    const json = JSON.stringify(exported, null, 2);
    navigator.clipboard.writeText(json).catch(() => {});
    // Brief feedback
    const btn = document.getElementById('export-btn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '已复制!';
      setTimeout(() => { btn.textContent = orig; }, 1200);
    }
  }, [customColors, defaults]);

  const handleImport = useCallback(() => {
    try {
      const parsed = JSON.parse(importText);
      reset();
      Object.entries(parsed).forEach(([k, v]) => {
        if (typeof v === 'string' && k in defaults) {
          setColor(k as keyof ThemeColors, v);
        }
      });
      setImportOpen(false);
      setImportText('');
    } catch {
      alert('JSON 格式错误，请检查输入');
    }
  }, [importText, reset, setColor, defaults]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        className="w-[720px] max-w-[95vw] max-h-[90vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden"
        style={{ backgroundColor: 'var(--te-bg-secondary)', borderColor: 'var(--te-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--te-border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--te-text-primary)' }}>主题外观</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:opacity-70 transition-opacity" style={{ color: 'var(--te-text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--te-border)' }}>
          {(['light', 'dark', 'custom'] as ThemeMode[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-sm font-medium transition-colors relative"
              style={{
                color: tab === t ? 'var(--te-primary)' : 'var(--te-text-secondary)',
                backgroundColor: tab === t ? 'color-mix(in srgb, var(--te-primary) 8%, transparent)' : 'transparent',
              }}
            >
              {t === 'light' ? '亮色' : t === 'dark' ? '暗色' : '自定义'}
              {Object.keys(t === 'light' ? lightCustom : t === 'dark' ? darkCustom : custom).length > 0 && (
                <span className="ml-1 text-[10px] opacity-70">(已编辑)</span>
              )}
              {tab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--te-primary)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Color list */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {COLOR_ITEMS.map((item) => {
            const defaultValue = defaults[item.key];
            const customValue = customColors[item.key];
            const currentValue = customValue ?? defaultValue;
            const isOverridden = customValue !== undefined && customValue !== defaultValue;

            return (
              <div
                key={item.key}
                className="flex items-center gap-3 p-3 rounded-lg border"
                style={{ borderColor: 'var(--te-border)', backgroundColor: 'var(--te-bg-tertiary)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium" style={{ color: 'var(--te-text-primary)' }}>{item.title}</span>
                    <span className="text-[10px] font-mono opacity-50" style={{ color: 'var(--te-text-secondary)' }}>({item.key})</span>
                    {isOverridden && <Check size={12} style={{ color: 'var(--te-success)' }} />}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--te-text-secondary)' }}>影响区域：{item.area}</div>
                </div>

                {/* Default color (read-only) */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <span className="text-[10px]" style={{ color: 'var(--te-text-secondary)' }}>默认</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded border flex-shrink-0" style={{ backgroundColor: defaultValue, borderColor: 'var(--te-border)' }} />
                    <span className="text-[10px] font-mono w-16 truncate" style={{ color: 'var(--te-text-secondary)' }}>{defaultValue}</span>
                  </div>
                </div>

                <div className="text-lg" style={{ color: 'var(--te-text-secondary)' }}>→</div>

                {/* Custom color (editable) */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <span className="text-[10px]" style={{ color: 'var(--te-text-secondary)' }}>自定义</span>
                  <ColorInput
                    value={currentValue}
                    onChange={(v) => setColor(item.key, v)}
                  />
                </div>

                {/* Reset single */}
                {isOverridden && (
                  <button
                    onClick={() => handleResetOne(item.key)}
                    className="p-1.5 rounded-md hover:opacity-70 transition-opacity flex-shrink-0"
                    title="恢复默认"
                    style={{ color: 'var(--te-text-secondary)' }}
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t gap-2" style={{ borderColor: 'var(--te-border)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetAll}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors border"
              style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-primary)' }}
            >
              <RotateCcw size={12} />
              全部重置为默认
            </button>
          </div>
          <div className="flex items-center gap-2">
            {importOpen ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder='粘贴 JSON，如 {"bgPrimary":"#ff0000"}'
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-48 px-2 py-1 text-xs rounded border bg-transparent focus:outline-none"
                  style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-primary)' }}
                />
                <button
                  onClick={handleImport}
                  className="px-2 py-1 text-xs rounded-lg font-medium"
                  style={{ backgroundColor: 'var(--te-primary)', color: '#fff' }}
                >
                  导入
                </button>
                <button
                  onClick={() => { setImportOpen(false); setImportText(''); }}
                  className="px-2 py-1 text-xs rounded-lg"
                  style={{ color: 'var(--te-text-secondary)' }}
                >
                  取消
                </button>
              </div>
            ) : (
              <>
                <button
                  id="export-btn"
                  onClick={handleExport}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors border"
                  style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-primary)' }}
                >
                  <Download size={12} />
                  导出 JSON
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors border"
                  style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-primary)' }}
                >
                  <Upload size={12} />
                  导入 JSON
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ThemeEditor);
