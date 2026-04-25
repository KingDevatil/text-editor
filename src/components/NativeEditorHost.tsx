import React, { useRef, useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

interface NativeEditorHostProps {
  tabId: string;
  content?: string;
  theme?: 'vs' | 'vs-dark' | 'hc-black';
  fontSize?: number;
}

const NativeEditorHost: React.FC<NativeEditorHostProps> = ({
  tabId,
  content,
  theme = 'vs-dark',
  fontSize = 14,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef(theme);
  const fontSizeRef = useRef(fontSize);

  // Report editor area position/size to Rust backend
  useEffect(() => {
    if (!isTauri() || !containerRef.current) return;

    const el = containerRef.current;

    const reportRect = () => {
      const rect = el.getBoundingClientRect();
      invoke('native_editor_resize', {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }).catch(() => {});
    };

    // Initial report
    reportRect();

    // Observe size changes
    const resizeObserver = new ResizeObserver(() => {
      reportRect();
    });
    resizeObserver.observe(el);

    // Report on window resize
    window.addEventListener('resize', reportRect);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', reportRect);
    };
  }, [tabId]);

  // Load text into native editor when content changes
  useEffect(() => {
    if (!isTauri()) return;
    if (content !== undefined) {
      invoke('native_editor_load_text', { text: content }).catch(() => {});
    }
  }, [content, tabId]);

  // Update theme
  useEffect(() => {
    if (theme === themeRef.current) return;
    themeRef.current = theme;
    // TODO: invoke native_editor_apply_theme
  }, [theme]);

  // Update font size
  useEffect(() => {
    if (fontSize === fontSizeRef.current) return;
    fontSizeRef.current = fontSize;
    // TODO: invoke native_editor_set_font
  }, [fontSize]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ background: 'transparent' }}
      data-native-editor-host
    >
      {/* Native editor window will be positioned over this div by the Rust backend */}
      <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-600 pointer-events-none">
        <p className="text-sm">Native Editor</p>
      </div>
    </div>
  );
};

export default NativeEditorHost;
