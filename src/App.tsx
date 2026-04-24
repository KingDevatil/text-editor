import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { editor } from 'monaco-editor';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from './hooks/useEditorStore';
import type { Encoding } from './types';
import Toolbar from './components/Toolbar';
import TabBar from './components/TabBar';
import MonacoEditor from './components/MonacoEditor';
import FindReplace from './components/FindReplace';
import StatusBar from './components/StatusBar';
import Sidebar from './components/Sidebar';
import MarkdownPreview from './components/MarkdownPreview';

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

function App() {
  const store = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorInstanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const secondaryEditorInstanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [sidebarWidth] = useState(220);

  // Auto-disable split when less than 2 tabs
  useEffect(() => {
    if (store.splitMode && store.tabs.length < 2) {
      store.setSplitMode(false);
    }
  }, [store.tabs.length, store.splitMode]);

  // Initialize with a default tab
  useEffect(() => {
    if (store.tabs.length === 0) {
      store.createTab('welcome.md', '# 欢迎使用多功能文本编辑器\n\n这是一个基于 **Tauri + React + Monaco Editor** 构建的桌面文本编辑器。\n\n## 功能特性\n\n- 📝 多标签页编辑\n- 🎨 语法高亮与主题切换\n- 🔍 查找替换\n- 📂 文件打开与保存\n- ⚡ 高性能代码编辑\n\n## 快捷键\n\n| 快捷键 | 功能 |\n|--------|------|\n| Ctrl+N | 新建文件 |\n| Ctrl+O | 打开文件 |\n| Ctrl+S | 保存文件 |\n| Ctrl+F | 查找替换 |\n', 'markdown');
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            handleNewFile();
            break;
          case 'o':
            e.preventDefault();
            handleOpenFile();
            break;
          case 's':
            e.preventDefault();
            handleSaveFile();
            break;
          case 'f':
            e.preventDefault();
            store.setFindReplaceVisible(!store.findReplaceVisible);
            break;
        }
      }
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleFormat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.activeTab, store.findReplaceVisible]);

  const handleNewFile = useCallback(() => {
    store.createTab();
  }, [store.createTab]);

  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const readFile = useCallback(async (file: File, filePath?: string): Promise<string> => {
    if (isTauri && filePath) {
      try {
        const encoding = store.tabs.find((t) => t.filePath === filePath)?.encoding || 'UTF-8';
        return await invoke<string>('read_file_with_encoding', { path: filePath, encoding });
      } catch {
        // fallback to browser API
      }
    }
    return file.text();
  }, [store.tabs]);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = isTauri ? (file as any).path as string | undefined : undefined;
        const fileName = file.name;

        try {
          const text = await readFile(file, filePath);
          const existing = store.tabs.find((t) => {
            if (filePath) return t.filePath === filePath;
            return t.title === fileName;
          });
          if (existing) {
            store.setActiveTabId(existing.id);
            store.updateTabContent(existing.id, text);
            if (filePath) store.renameTab(existing.id, fileName, filePath);
          } else {
            store.createTab(fileName, text, undefined, filePath || fileName);
          }
        } catch (err) {
          console.error('Failed to read file:', fileName, err);
        }
      }
      e.target.value = '';
    },
    [store, readFile]
  );

  const handleSaveFile = useCallback(async () => {
    if (!store.activeTab) return;

    try {
      if (isTauri && store.activeTab.filePath) {
        await invoke('write_file_with_encoding', {
          path: store.activeTab.filePath,
          content: store.activeTab.content,
          encoding: store.activeTab.encoding,
        });
        store.markTabSaved(store.activeTab.id);
        return;
      }

      if ('showSaveFilePicker' in window) {
        const pickerOpts = {
          suggestedName: store.activeTab.title,
          types: [
            {
              description: 'Text Files',
              accept: { 'text/plain': ['.txt', '.md', '.js', '.ts', '.html', '.css', '.json', '.py', '.rs'] },
            },
          ],
        };
        // @ts-ignore
        const handle = await window.showSaveFilePicker(pickerOpts);
        const writable = await handle.createWritable();
        await writable.write(store.activeTab.content);
        await writable.close();
        store.markTabSaved(store.activeTab.id);
        store.renameTab(store.activeTab.id, handle.name);
      } else {
        const blob = new Blob([store.activeTab.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = store.activeTab.title;
        a.click();
        URL.revokeObjectURL(url);
        store.markTabSaved(store.activeTab.id);
      }
    } catch (err) {
      console.log('Save cancelled or failed', err);
    }
  }, [store.activeTab]);

  const handleFormat = useCallback(() => {
    const group = store.activeTab?.group || 1;
    const editor = group === 1 ? editorInstanceRef.current : secondaryEditorInstanceRef.current;
    if (!editor) return;
    const action = editor.getAction('editor.action.formatDocument');
    if (action) {
      action.run();
    }
  }, [store.activeTab]);

  const canFormat = store.activeTab
    ? ['json', 'xml', 'html', 'css', 'javascript', 'typescript', 'markdown', 'sql', 'yaml', 'ini'].includes(store.activeTab.language)
    : false;

  const group1Tab = store.tabs.find((t) => t.id === store.activeGroup1TabId);
  const canPreview = group1Tab?.language === 'markdown';
  const canSplit = store.tabs.length >= 2;

  const handleToggleSplit = useCallback(() => {
    store.setSplitMode(!store.splitMode);
  }, [store.splitMode, store.setSplitMode]);

  const handleTabClick = useCallback((id: string, group: 1 | 2) => {
    if (group === 1) {
      store.setActiveGroup1TabId(id);
    } else {
      store.setActiveGroup2TabId(id);
    }
    store.setActiveTabId(id);
  }, [store]);

  const handleToggleTheme = useCallback(() => {
    store.setTheme((prev) => {
      if (prev === 'vs') return 'vs-dark';
      if (prev === 'vs-dark') return 'hc-black';
      return 'vs';
    });
  }, [store.setTheme]);

  const handleEditorChange = useCallback(
    (tabId: string) => (value: string) => {
      store.updateTabContent(tabId, value);
    },
    [store.updateTabContent]
  );

  const handleEncodingChange = useCallback(
    async (enc: Encoding) => {
      if (!store.activeTab) return;
      store.setTabEncoding(store.activeTab.id, enc);

      // If in Tauri and file has a path, re-read with new encoding
      if (isTauri && store.activeTab.filePath) {
        try {
          const text = await invoke<string>('read_file_with_encoding', {
            path: store.activeTab.filePath,
            encoding: enc,
          });
          store.updateTabContent(store.activeTab.id, text);
        } catch (err) {
          console.error('Failed to re-read file with encoding:', enc, err);
        }
      }
    },
    [store]
  );

  const isDark = store.theme === 'vs-dark' || store.theme === 'hc-black';

  // Handle file drop (HTML5 Drag and Drop)
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = isTauri ? (file as any).path as string | undefined : undefined;
        const fileName = file.name;

        try {
          const text = await readFile(file, filePath);
          const existing = store.tabs.find((t) => {
            if (filePath) return t.filePath === filePath;
            return t.title === fileName;
          });
          if (existing) {
            store.setActiveTabId(existing.id);
            store.updateTabContent(existing.id, text);
            if (filePath) store.renameTab(existing.id, fileName, filePath);
          } else {
            store.createTab(fileName, text, undefined, filePath || fileName);
          }
        } catch (err) {
          console.error('Failed to read dropped file:', fileName, err);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [store, readFile]);

  return (
    <div className={`flex flex-col h-screen ${isDark ? 'dark' : ''}`}>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
        accept=".txt,.md,.js,.jsx,.mjs,.cjs,.ts,.tsx,.mts,.cts,.html,.htm,.xhtml,.css,.scss,.sass,.less,.json,.jsonc,.json5,.py,.pyw,.java,.cpp,.cc,.cxx,.c,.h,.hpp,.cs,.rs,.go,.mdx,.yml,.yaml,.xml,.svg,.wsdl,.xsd,.xsl,.xslt,.sql,.mysql,.pgsql,.sqlite,.ini,.cfg,.inf,.csv,.tsv,.env,.properties,.log,.sh,.bash,.zsh"
      />

      <Toolbar
        onNewFile={handleNewFile}
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
        onToggleFindReplace={() => store.setFindReplaceVisible(!store.findReplaceVisible)}
        onToggleTheme={handleToggleTheme}
        onToggleSidebar={() => store.setSidebarVisible(!store.sidebarVisible)}
        onFormat={handleFormat}
        onTogglePreview={() => store.setPreviewVisible(!store.previewVisible)}
        onToggleSplit={handleToggleSplit}
        canFormat={canFormat}
        canPreview={canPreview}
        previewActive={store.previewVisible}
        canSplit={canSplit}
        splitActive={store.splitMode}
        theme={store.theme}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          visible={store.sidebarVisible}
          width={sidebarWidth}
          unicodeHighlight={store.unicodeHighlight}
          onToggleUnicodeHighlight={() => store.setUnicodeHighlight(!store.unicodeHighlight)}
          fontSize={store.fontSize}
          onFontSizeChange={store.setFontSize}
        />

        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar
            tabs={store.tabs}
            activeTabId={store.activeTabId}
            activeGroup1TabId={store.activeGroup1TabId}
            activeGroup2TabId={store.activeGroup2TabId}
            splitMode={store.splitMode}
            onTabClick={handleTabClick}
            onTabClose={store.closeTab}
            onNewFile={handleNewFile}
          />

          <FindReplace
            visible={store.findReplaceVisible}
            onClose={() => store.setFindReplaceVisible(false)}
          />

          <div className="flex flex-1 overflow-hidden">
            {group1Tab ? (
              <>
                <div className={`h-full ${store.splitMode || (store.previewVisible && canPreview) ? 'w-1/2' : 'w-full'}`}>
                  <MonacoEditor
                    content={group1Tab.content}
                    language={group1Tab.language}
                    theme={store.theme}
                    onChange={handleEditorChange(group1Tab.id)}
                    editorRef={editorInstanceRef}
                    unicodeHighlight={store.unicodeHighlight}
                    fontSize={store.fontSize}
                  />
                </div>
                {store.splitMode && (
                  <>
                    <div className="w-px bg-gray-200 dark:bg-gray-800 self-stretch" />
                    <div className="w-1/2 h-full">
                      {store.activeGroup2TabId ? (
                        <MonacoEditor
                          content={store.tabs.find((t) => t.id === store.activeGroup2TabId)?.content || ''}
                          language={store.tabs.find((t) => t.id === store.activeGroup2TabId)?.language || 'plaintext'}
                          theme={store.theme}
                          onChange={handleEditorChange(store.activeGroup2TabId)}
                          editorRef={secondaryEditorInstanceRef}
                          unicodeHighlight={store.unicodeHighlight}
                          fontSize={store.fontSize}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600 bg-white dark:bg-gray-900">
                          <p className="text-sm">选择标签页开始编辑</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {store.previewVisible && canPreview && (
                  <>
                    <div className="w-px bg-gray-200 dark:bg-gray-800 self-stretch" />
                    <div className="w-1/2 h-full">
                      <MarkdownPreview content={group1Tab.content} theme={store.theme} />
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600 bg-white dark:bg-gray-900">
                <div className="text-center">
                  <p className="text-lg mb-2">没有打开的文件</p>
                  <p className="text-sm">点击"新建"或"打开"开始编辑</p>
                </div>
              </div>
            )}
          </div>

          <StatusBar
            activeTab={store.activeTab}
            theme={store.theme}
            onEncodingChange={handleEncodingChange}
            onLanguageChange={(lang) => {
              if (store.activeTab) {
                store.setTabLanguage(store.activeTab.id, lang);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
