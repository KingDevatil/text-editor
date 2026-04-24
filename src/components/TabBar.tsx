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
  const [overflow, setOverflow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect overflow
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [tabs, splitMode]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

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
          group relative flex items-center gap-2 px-3.5 min-w-[120px] max-w-[220px] cursor-pointer select-none
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
      className="relative flex h-9 border-b border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900 overflow-hidden"
    >
      {/* Sidebar spacer to align with editor layout below (only in split mode) */}
      {splitMode && (
        <div
          className="flex-shrink-0"
          style={{ width: sidebarVisible ? sidebarWidth : 0 }}
        />
      )}

      {/* Group 1 tabs */}
      <div className={`flex overflow-hidden flex-shrink-0 pt-[2px] ${splitMode ? 'w-1/2' : 'flex-1'}`}>
        {group1Tabs.map((tab) => renderTab(tab, 1))}
        {!splitMode && (
          <div className="flex-1 min-w-[40px]" onDoubleClick={handleBlankDoubleClick} />
        )}
      </div>

      {/* Split divider */}
      {splitMode && group2Tabs.length > 0 && (
        <div className="flex-shrink-0 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-600 to-transparent self-stretch mx-0.5" />
      )}

      {/* Group 2 tabs */}
      {splitMode && group2Tabs.length > 0 && (
        <div className="w-1/2 flex overflow-hidden flex-shrink-0 pt-[2px]">
          {group2Tabs.map((tab) => renderTab(tab, 2))}
        </div>
      )}

      {/* Overflow dropdown button */}
      {overflow && (
        <div className="relative flex items-center flex-shrink-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="px-2.5 h-full hover:bg-gray-200/70 dark:hover:bg-gray-700/70 text-gray-500 dark:text-gray-400 transition-colors"
            title="更多标签"
          >
            <ChevronDown size={16} />
          </button>
          {menuOpen && (
            <div className="tab-dropdown-animate absolute top-full right-0 z-50 w-60 max-h-80 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-xl py-1">
              {tabs.map((tab) => {
                const group = tab.group || 1;
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    onClick={() => {
                      onTabClick(tab.id, group as 1 | 2);
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
                        if (tabs.length <= 1) setMenuOpen(false);
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
      )}
    </div>
  );
};

export default TabBar;
