import React, { useRef, useEffect, useState, useCallback } from 'react';
import { MergeView } from '@codemirror/merge';
import { history, historyKeymap } from '@codemirror/commands';
import { lineNumbers, keymap, EditorView } from '@codemirror/view';
import { buildDynamicTheme, syntaxHighlightExtension } from '../utils/themes';
import { isSyntaxHighlightDark, resolveThemeColors } from '../utils/themeResolver';
import type { ThemeMode } from '../types';
import { useSettingsStore } from '../hooks/useSettingsStore';
import { useEditorStore } from '../hooks/useEditorStore';
import { X } from 'lucide-react';

interface DiffEditorProps {
  leftContent: string;
  rightContent: string;
  theme: ThemeMode;
}

const DiffEditor: React.FC<DiffEditorProps> = ({ leftContent, rightContent, theme }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mergeViewRef = useRef<MergeView | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const lightCustomColors = useSettingsStore((s) => s.lightCustomColors);
  const darkCustomColors = useSettingsStore((s) => s.darkCustomColors);
  const customColors = useSettingsStore((s) => s.customColors);
  const customSyntaxHighlight = useSettingsStore((s) => s.customSyntaxHighlight);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Destroy previous merge view if any
    if (mergeViewRef.current) {
      mergeViewRef.current.destroy();
      mergeViewRef.current = null;
    }

    const colors = resolveThemeColors(theme, lightCustomColors, darkCustomColors, customColors);

    const baseExtensions = [
      history(),
      keymap.of(historyKeymap),
      lineNumbers(),
      syntaxHighlightExtension,
      buildDynamicTheme(colors, isSyntaxHighlightDark(theme, colors, customSyntaxHighlight)),
      EditorView.editable.of(false),
    ];

    const mergeView = new MergeView({
      a: {
        doc: leftContent,
        extensions: baseExtensions,
      },
      b: {
        doc: rightContent,
        extensions: baseExtensions,
      },
      parent: container,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 4 },
    });

    mergeViewRef.current = mergeView;

    return () => {
      mergeView.destroy();
      mergeViewRef.current = null;
    };
  }, [leftContent, rightContent, theme, lightCustomColors, darkCustomColors, customColors, customSyntaxHighlight]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleExitDiff = useCallback(() => {
    useEditorStore.getState().setDiffMode(false);
    useEditorStore.getState().setDiffPair(null, null);
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [contextMenu]);

  return (
    <div
      className="relative w-full h-full"
      onContextMenu={handleContextMenu}
    >
      <div
        ref={containerRef}
        className="w-full h-full overflow-auto"
        style={{
          fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", monospace',
        }}
      />
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl bg-white dark:bg-gray-800 py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors flex items-center gap-2"
            onClick={handleExitDiff}
          >
            <X size={14} />
            退出对比
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(DiffEditor);
