import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { EditorTab } from '../types';

interface TabBarProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  activeGroup1TabId: string | null;
  activeGroup2TabId: string | null;
  splitMode: boolean;
  sidebarVisible: boolean;
  sidebarWidth: number;
  onTabClick: (id: string, group: 1 | 2) => void;
  onTabClose: (id: string) => void;
  onNewFile?: () => void;
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  activeGroup1TabId,
  activeGroup2TabId,
  splitMode,
  sidebarVisible,
  sidebarWidth,
  onTabClick,
  onTabClose,
  onNewFile,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const group1Ref = useRef<HTMLDivElement>(null);
  const group2Ref = useRef<HTMLDivElement>(null);
  const [g1Overflow, setG1Overflow] = useState(false);
  const [g2Overflow, setG2Overflow] = useState(false);
  const [g1MenuOpen, setG1MenuOpen] = useState(false);
  const [g2MenuOpen, setG2MenuOpen] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect overflow per group by summing child widths (more reliable than scrollWidth)
  useEffect(() => {
    const check = () => {
      const g1El = group1Ref.current;
      const g2El = group2Ref.current;
      let g1Overflow = false;
      let g2Overflow = false;
      if (g1El) {
        let total = 0;
        for (const child of g1El.children) {
          total += (child as HTMLElement).offsetWidth;
        }
        g1Overflow = total > g1El.clientWidth;
      }
      if (g2El) {
        let total = 0;
        for (const child of g2El.children) {
          total += (child as HTMLElement).offsetWidth;
        }
        g2Overflow = total > g2El.clientWidth;
      }
      setG1Overflow(g1Overflow);
      setG2Overflow(g2Overflow);
    };
    const id = setTimeout(check, 0);
    window.addEventListener('resize', check);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', check);
    };
  }, [tabs, splitMode]);

  // Close menus on outside click
  useEffect(() => {
    if (!g1MenuOpen && !g2MenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setG1MenuOpen(false);
        setG2MenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [g1MenuOpen, g2MenuOpen]);

  const handleTabActivate = useCallback((tabId: string, group: 1 | 2) => {
    onTabClick(tabId, group);
  }, [onTabClick]);

  const handleTabDoubleClick = useCallback((tabId: string) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    onTabClose(tabId);
  }, [onTabClose]);

  const handleTabClick = useCallback((tabId: string, group: 1 | 2) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      handleTabActivate(tabId, group);
    }, 200);
  }, [handleTabActivate]);

  const handleBlankDoubleClick = useCallback(() => {
    onNewFile?.();
  }, [onNewFile]);

  const group1Tabs = tabs.filter((t) => t.group === 1 || !t.group);
  const group2Tabs = tabs.filter((t) => t.group === 2);

  const renderTab = (tab: EditorTab, group: 1 | 2) => {
    const isActive = tab.id === activeTabId;
    const isGroupActive = group === 1 ? tab.id === activeGroup1TabId : tab.id === activeGroup2TabId;
    const isDirty = tab.isDirty;

    return (
      <div
        key={tab.id}
        onClick={() => handleTabClick(tab.id, group)}
        onDoubleClick={() => handleTabDoubleClick(tab.id)}
        className={`
          group relative flex items-center gap-2 px-3.5 min-w-[120px] max-w-[220px] cursor-pointer select-none flex-shrink-0
          text-sm transition-all duration-100
          ${isActive && isGroupActive
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 z-10'
            : isGroupActive
            ? 'bg-gray-100/80 dark:bg-gray-800/60 text-gray-800 dark:text-gray-200'
            : 'bg-gray-100/40 dark:bg-gray-800/20 text-gray-500 dark:text-gray-400 hover:bg-gray-100/70 dark:hover:bg-gray-700/40 hover:text-gray-700 dark:hover:text-gray-300'
          }
        `}
        style={{
          borderRadius: '8px 8px 0 0',
          marginRight: '2px',
        }}
      >
        {/* Active top accent line */}
        {isActive && isGroupActive && (
          <div className="absolute top-0 left-2 right-2 h-[2px] bg-gradient-to-r from-blue-500 to-blue-400 rounded-full" />
        )}

        <span className={`truncate flex-1 ${isDirty ? 'italic' : ''}`}>
          {isDirty && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />
          )}
          {tab.title}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onTabClose(tab.id);
          }}
          className={`
            p-0.5 rounded-md transition-all duration-100
            ${isActive && isGroupActive
              ? 'text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
              : 'text-gray-300 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
            }
          `}
          title="关闭"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
    );
  };

  const renderDropdown = (
    groupTabs: EditorTab[],
    group: 1 | 2,
    menuOpen: boolean,
    setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>
  ) => (
    <div className="relative flex items-center flex-shrink-0">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="px-2.5 h-full hover:bg-gray-200/70 dark:hover:bg-gray-700/70 text-gray-500 dark:text-gray-400 transition-colors"
        title="更多标签"
      >
        <ChevronDown size={16} />
      </button>
      {menuOpen && (
        <div className="tab-dropdown-animate absolute top-full right-0 z-50 w-60 max-h-80 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-xl py-1">
          {groupTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => {
                  onTabClick(tab.id, group);
                  setMenuOpen(false);
                }}
                className={`
                  flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none mx-1 rounded-lg transition-colors
                  ${isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                `}
              >
                <span className="truncate flex-1">
                  {tab.isDirty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />}
                  {tab.title}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                    if (groupTabs.length <= 1) setMenuOpen(false);
                  }}
                  className="p-0.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  title="关闭"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (tabs.length === 0) {
    return (
      <div
        className="h-9 border-b border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900 flex items-center px-4 text-sm text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
        onDoubleClick={handleBlankDoubleClick}
      >
        <span className="flex-1">双击新建文件</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-9 border-b border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900"
    >
      {splitMode ? (
        <>
          {/* Sidebar spacer - mirrors the Sidebar width in App.tsx */}
          <div
            className="flex-shrink-0"
            style={{ width: sidebarVisible ? sidebarWidth : 0 }}
          />
          {/* Tabs area - mirrors the editor pane layout below */}
          <div className="flex flex-1">
            {/* Group 1 tabs */}
            <div className="w-1/2 flex flex-shrink-0 pt-[2px]">
              <div ref={group1Ref} className="flex overflow-hidden flex-1" onDoubleClick={handleBlankDoubleClick}>
                {group1Tabs.map((tab) => renderTab(tab, 1))}
              </div>
              {!g1Overflow && (
                <div className="min-w-[40px] flex-shrink-0" onDoubleClick={handleBlankDoubleClick} />
              )}
              {g1Overflow && renderDropdown(group1Tabs, 1, g1MenuOpen, setG1MenuOpen)}
            </div>
            {/* Split divider */}
            {group2Tabs.length > 0 && (
              <div className="flex-shrink-0 w-px bg-gray-200 dark:bg-gray-800 self-stretch" />
            )}
            {/* Group 2 tabs */}
            {group2Tabs.length > 0 && (
              <div className="w-1/2 flex flex-shrink-0 pt-[2px]">
                <div ref={group2Ref} className="flex overflow-hidden flex-1" onDoubleClick={handleBlankDoubleClick}>
                  {group2Tabs.map((tab) => renderTab(tab, 2))}
                </div>
                {!g2Overflow && (
                  <div className="min-w-[40px] flex-shrink-0" onDoubleClick={handleBlankDoubleClick} />
                )}
                {g2Overflow && renderDropdown(group2Tabs, 2, g2MenuOpen, setG2MenuOpen)}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Group 1 tabs */}
          <div className="flex-1 flex flex-shrink-0 pt-[2px]">
            <div ref={group1Ref} className="flex overflow-hidden flex-1" onDoubleClick={handleBlankDoubleClick}>
              {group1Tabs.map((tab) => renderTab(tab, 1))}
            </div>
            {!g1Overflow && (
              <div className="min-w-[40px] flex-shrink-0" onDoubleClick={handleBlankDoubleClick} />
            )}
            {g1Overflow && renderDropdown(group1Tabs, 1, g1MenuOpen, setG1MenuOpen)}
          </div>
        </>
      )}
    </div>
  );
};

export default TabBar;
