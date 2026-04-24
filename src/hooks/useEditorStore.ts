import { useState, useCallback } from 'react';
import type { EditorTab, Language, Encoding } from '../types';
import { EXT_TO_LANGUAGE } from '../types';

let tabCounter = 0;

function generateId(): string {
  return `tab-${++tabCounter}-${Date.now()}`;
}

function getLanguageFromFileName(fileName: string): Language {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

function getDefaultContent(language: Language): string {
  switch (language) {
    case 'html':
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Document</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>`;
    case 'javascript':
      return `// JavaScript
function greet(name) {
  console.log('Hello, ' + name + '!');
}

greet('World');
`;
    case 'typescript':
      return `// TypeScript
function greet(name: string): void {
  console.log('Hello, ' + name + '!');
}

greet('World');
`;
    case 'python':
      return `# Python
def greet(name):
    print(f"Hello, {name}!")

greet("World")
`;
    case 'rust':
      return `// Rust
fn main() {
    println!("Hello, world!");
}
`;
    default:
      return '';
  }
}

export function useEditorStore() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'vs' | 'vs-dark' | 'hc-black'>('vs-dark');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [findReplaceVisible, setFindReplaceVisible] = useState(false);
  const [unicodeHighlight, setUnicodeHighlight] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [splitMode, setSplitModeState] = useState(false);
  const [secondaryActiveTabId, setSecondaryActiveTabId] = useState<string | null>(null);

  const createTab = useCallback((title = 'Untitled', content = '', language?: Language, filePath?: string) => {
    const lang = language || getLanguageFromFileName(title);
    const actualContent = content || getDefaultContent(lang);
    const newTab: EditorTab = {
      id: generateId(),
      title,
      content: actualContent,
      language: lang,
      isDirty: false,
      filePath,
      encoding: 'UTF-8',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    return newTab.id;
  }, []);

  const updateTabContent = useCallback((tabId: string, content: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, content, isDirty: true } : tab
      )
    );
  }, []);

  const closeTab = useCallback((tabId: string) => {
    let newTabs: EditorTab[] = [];
    let closedIndex = 0;
    setTabs((prev) => {
      closedIndex = prev.findIndex((t) => t.id === tabId);
      newTabs = prev.filter((t) => t.id !== tabId);
      return newTabs;
    });
    setActiveTabId((current) => {
      if (current === tabId) {
        return newTabs[Math.min(closedIndex, newTabs.length - 1)]?.id || null;
      }
      return current;
    });
    setSecondaryActiveTabId((current) => {
      if (current === tabId) {
        const active = activeTabId === tabId ? null : activeTabId;
        const candidates = newTabs.filter((t) => t.id !== active);
        return candidates[0]?.id || null;
      }
      return current;
    });
  }, [activeTabId]);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    setSecondaryActiveTabId(null);
    setSplitModeState(false);
    setPreviewVisible(false);
  }, []);

  const markTabSaved = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, isDirty: false } : tab
      )
    );
  }, []);

  const renameTab = useCallback((tabId: string, newTitle: string, newFilePath?: string) => {
    const lang = getLanguageFromFileName(newTitle);
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? { ...tab, title: newTitle, language: lang, filePath: newFilePath || tab.filePath }
          : tab
      )
    );
  }, []);

  const setTabEncoding = useCallback((tabId: string, encoding: Encoding) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, encoding } : tab
      )
    );
  }, []);

  const setTabLanguage = useCallback((tabId: string, language: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, language } : tab
      )
    );
  }, []);

  const setSplitMode = useCallback((mode: boolean) => {
    setSplitModeState(mode);
    if (mode) {
      setPreviewVisible(false);
      setSecondaryActiveTabId((current) => {
        if (current) return current;
        const candidate = tabs.find((t) => t.id !== activeTabId);
        return candidate?.id || tabs[0]?.id || null;
      });
    } else {
      setSecondaryActiveTabId(null);
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;
  const secondaryActiveTab = tabs.find((t) => t.id === secondaryActiveTabId) || null;

  return {
    tabs,
    activeTabId,
    activeTab,
    theme,
    sidebarVisible,
    findReplaceVisible,
    unicodeHighlight,
    fontSize,
    setActiveTabId,
    setTheme,
    setSidebarVisible,
    setFindReplaceVisible,
    setUnicodeHighlight,
    setFontSize,
    setTabEncoding,
    setTabLanguage,
    previewVisible,
    setPreviewVisible,
    splitMode,
    setSplitMode,
    secondaryActiveTabId,
    setSecondaryActiveTabId,
    secondaryActiveTab,
    createTab,
    updateTabContent,
    closeTab,
    closeAllTabs,
    markTabSaved,
    renameTab,
  };
}
