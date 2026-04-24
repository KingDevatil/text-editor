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
  const [activeGroup1TabId, setActiveGroup1TabId] = useState<string | null>(null);
  const [activeGroup2TabId, setActiveGroup2TabId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'vs' | 'vs-dark' | 'hc-black'>('vs-dark');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [findReplaceVisible, setFindReplaceVisible] = useState(false);
  const [unicodeHighlight, setUnicodeHighlight] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [splitMode, setSplitModeState] = useState(false);

  const createTab = useCallback((title = 'Untitled', content = '', language?: Language, filePath?: string, group: 1 | 2 = 1) => {
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
      group,
    };
    setTabs((prev) => [...prev, newTab]);
    if (group === 1) {
      setActiveGroup1TabId(newTab.id);
    } else {
      setActiveGroup2TabId(newTab.id);
    }
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
    let closedGroup: 1 | 2 = 1;
    let newTabs: EditorTab[] = [];
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId);
      closedGroup = tab?.group || 1;
      newTabs = prev.filter((t) => t.id !== tabId);
      return newTabs;
    });

    setActiveGroup1TabId((current) => {
      if (current === tabId) {
        const group1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
        return group1Tabs[group1Tabs.length - 1]?.id || null;
      }
      return current;
    });

    setActiveGroup2TabId((current) => {
      if (current === tabId) {
        const group2Tabs = newTabs.filter((t) => t.group === 2);
        return group2Tabs[group2Tabs.length - 1]?.id || null;
      }
      return current;
    });

    setActiveTabId((current) => {
      if (current === tabId) {
        if (closedGroup === 1) {
          const group1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
          if (group1Tabs.length > 0) return group1Tabs[group1Tabs.length - 1].id;
        }
        const group2Tabs = newTabs.filter((t) => t.group === 2);
        if (group2Tabs.length > 0) return group2Tabs[group2Tabs.length - 1].id;
        const group1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
        return group1Tabs[group1Tabs.length - 1]?.id || null;
      }
      return current;
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    setActiveGroup1TabId(null);
    setActiveGroup2TabId(null);
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

  const moveTabToGroup = useCallback((tabId: string, group: 1 | 2) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, group } : tab
      )
    );
    if (group === 1) {
      setActiveGroup1TabId(tabId);
    } else {
      setActiveGroup2TabId(tabId);
    }
    setActiveTabId(tabId);
  }, []);

  const setSplitMode = useCallback((mode: boolean) => {
    if (mode && tabs.length < 2) return;
    setSplitModeState(mode);
    if (mode) {
      setPreviewVisible(false);
      setTabs((prev) => {
        const hasGroup2 = prev.some((t) => t.group === 2);
        if (!hasGroup2 && prev.length >= 2 && activeTabId) {
          // 把当前激活的页签移到 group2
          return prev.map((t) => (t.id === activeTabId ? { ...t, group: 2 as 2 } : t));
        }
        return prev;
      });
      setActiveGroup2TabId((current) => {
        if (current) return current;
        return activeTabId;
      });
      setActiveGroup1TabId((current) => {
        if (current === activeTabId) {
          // 当前 group1 激活页签被移走了，找 group1 中剩下的第一个
          const remainingG1 = tabs.filter((t) => t.id !== activeTabId && (t.group === 1 || !t.group));
          return remainingG1[0]?.id || null;
        }
        return current;
      });
    } else {
      setTabs((prev) => prev.map((t) => ({ ...t, group: 1 as 1 })));
      setActiveGroup2TabId(null);
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  return {
    tabs,
    activeTabId,
    activeTab,
    activeGroup1TabId,
    activeGroup2TabId,
    theme,
    sidebarVisible,
    findReplaceVisible,
    unicodeHighlight,
    fontSize,
    setActiveTabId,
    setActiveGroup1TabId,
    setActiveGroup2TabId,
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
    moveTabToGroup,
    createTab,
    updateTabContent,
    closeTab,
    closeAllTabs,
    markTabSaved,
    renameTab,
  };
}
