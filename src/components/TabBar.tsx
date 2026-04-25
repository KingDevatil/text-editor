import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { EditorTab } from '../types';

interface TabBarProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  activeGroup1TabId: string | null;
  activeGroup2TabId: string | null;
  splitMode: boolean;
  onTabClick: (id: string, group: 1 | 2) => void;
  onTabClose: (id: string) => void;
  onNewFile?: () => void;
  onNewFileInGroup?: (group: 1 | 2) => void;
  onMoveTabToGroup?: (tabId: string, group: 1 | 2) => void;
  onCloseTabs?: (tabIds: string[]) => void;
}

interface ScrollState {
  canLeft: boolean;
  canRight: boolean;
}

const arrowBtnClass =
  'absolute top-0 bottom-0 z-10 flex items-center justify-center w-7 h-9 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer';

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  activeGroup1TabId,
  activeGroup2TabId,
  splitMode,
  onTabClick,
  onTabClose,
  onNewFile,
  onNewFileInGroup,
  onMoveTabToGroup,
  onCloseTabs,
}) => {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const g1ScrollRef = useRef<HTMLDivElement>(null);
  const g2ScrollRef = useRef<HTMLDivElement>(null);
  const [g1Scroll, setG1Scroll] = useState<ScrollState>({ canLeft: false, canRight: false });
  const [g2Scroll, setG2Scroll] = useState<ScrollState>({ canLeft: false, canRight: false });
  const [dragOverGroup, setDragOverGroup] = useState<1 | 2 | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    tabId: string;
    group: 1 | 2;
  } | null>(null);

  const checkScroll = useCallback((el: HTMLDivElement | null, setter: React.Dispatch<React.SetStateAction<ScrollState>>) => {
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setter({
      canLeft: scrollLeft > 1,
      canRight: scrollLeft + clientWidth < scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const handle = () => {
      checkScroll(g1ScrollRef.current, setG1Scroll);
      checkScroll(g2ScrollRef.current, setG2Scroll);
    };
    handle();
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, [tabs, splitMode, checkScroll]);

  const scrollBy = (el: HTMLDivElement | null, delta: number) => {
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleTabActivate = useCallback((tabId: string, group: 1 | 2) => {
    onTabClick(tabId, group);
  }, [onTabClick]);

  const handleTabDoubleClick = useCallback((tabId: string) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.isDirty) {
      if (!window.confirm(`"${tab.title}" 有未保存的更改，确定要关闭吗？`)) {
        return;
      }
    }
    onTabClose(tabId);
  }, [onTabClose, tabs]);

  const handleTabClick = useCallback((tabId: string, group: 1 | 2) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      handleTabDoubleClick(tabId);
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      handleTabActivate(tabId, group);
    }, 200);
  }, [handleTabActivate, handleTabDoubleClick]);

  useEffect(() => {
    return () => {
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
    };
  }, []);

  const handleBlankDoubleClick = useCallback((group: 1 | 2) => {
    onNewFileInGroup?.(group);
  }, [onNewFileInGroup]);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('text/tab-id', tabId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, group: 1 | 2) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroup(group);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverGroup(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, group: 1 | 2) => {
    e.preventDefault();
    setDragOverGroup(null);
    const tabId = e.dataTransfer.getData('text/tab-id');
    if (tabId && onMoveTabToGroup) {
      onMoveTabToGroup(tabId, group);
    }
  }, [onMoveTabToGroup]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string, group: 1 | 2) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, tabId, group });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleMenuClose = useCallback(() => {
    if (contextMenu) {
      const tab = tabs.find((t) => t.id === contextMenu.tabId);
      if (tab?.isDirty) {
        confirm(`"${tab.title}" 有未保存的更改，确定要关闭吗？`, { title: '未保存的更改' }).then((ok) => {
          if (ok) {
            onTabClose(contextMenu.tabId);
          }
          closeContextMenu();
        }).catch(() => {
          onTabClose(contextMenu.tabId);
          closeContextMenu();
        });
        return;
      }
      onTabClose(contextMenu.tabId);
      closeContextMenu();
    }
  }, [contextMenu, onTabClose, closeContextMenu, tabs]);

  const handleMenuCloseOthers = useCallback(() => {
    if (!contextMenu || !onCloseTabs) return;
    const groupTabs = contextMenu.group === 1
      ? tabs.filter((t) => t.group === 1 || !t.group)
      : tabs.filter((t) => t.group === 2);
    const idsToClose = groupTabs.filter((t) => t.id !== contextMenu.tabId).map((t) => t.id);
    const hasDirty = idsToClose.some((id) => tabs.find((t) => t.id === id)?.isDirty);
    if (hasDirty) {
      confirm('要关闭的页签中有未保存的更改，确定关闭吗？', { title: '未保存的更改' }).then((ok) => {
        if (ok && idsToClose.length > 0) onCloseTabs(idsToClose);
        closeContextMenu();
      }).catch(() => {
        if (idsToClose.length > 0) onCloseTabs(idsToClose);
        closeContextMenu();
      });
      return;
    }
    if (idsToClose.length > 0) {
      onCloseTabs(idsToClose);
    }
    closeContextMenu();
  }, [contextMenu, tabs, onCloseTabs, closeContextMenu]);

  const handleMenuCloseLeft = useCallback(() => {
    if (!contextMenu || !onCloseTabs) return;
    const groupTabs = contextMenu.group === 1
      ? tabs.filter((t) => t.group === 1 || !t.group)
      : tabs.filter((t) => t.group === 2);
    const index = groupTabs.findIndex((t) => t.id === contextMenu.tabId);
    if (index > 0) {
      const idsToClose = groupTabs.slice(0, index).map((t) => t.id);
      const hasDirty = idsToClose.some((id) => tabs.find((t) => t.id === id)?.isDirty);
      if (hasDirty) {
        confirm('要关闭的页签中有未保存的更改，确定关闭吗？', { title: '未保存的更改' }).then((ok) => {
          if (ok) onCloseTabs(idsToClose);
          closeContextMenu();
        }).catch(() => {
          onCloseTabs(idsToClose);
          closeContextMenu();
        });
        return;
      }
      onCloseTabs(idsToClose);
    }
    closeContextMenu();
  }, [contextMenu, tabs, onCloseTabs, closeContextMenu]);

  const handleMenuCloseRight = useCallback(() => {
    if (!contextMenu || !onCloseTabs) return;
    const groupTabs = contextMenu.group === 1
      ? tabs.filter((t) => t.group === 1 || !t.group)
      : tabs.filter((t) => t.group === 2);
    const index = groupTabs.findIndex((t) => t.id === contextMenu.tabId);
    if (index >= 0 && index < groupTabs.length - 1) {
      const idsToClose = groupTabs.slice(index + 1).map((t) => t.id);
      const hasDirty = idsToClose.some((id) => tabs.find((t) => t.id === id)?.isDirty);
      if (hasDirty) {
        confirm('要关闭的页签中有未保存的更改，确定关闭吗？', { title: '未保存的更改' }).then((ok) => {
          if (ok) onCloseTabs(idsToClose);
          closeContextMenu();
        }).catch(() => {
          onCloseTabs(idsToClose);
          closeContextMenu();
        });
        return;
      }
      onCloseTabs(idsToClose);
    }
    closeContextMenu();
  }, [contextMenu, tabs, onCloseTabs, closeContextMenu]);

  useEffect(() => {
    if (!contextMenu?.visible) return;
    const handleClick = () => closeContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu?.visible, closeContextMenu]);

  const group1Tabs = tabs.filter((t) => t.group === 1 || !t.group);
  const group2Tabs = tabs.filter((t) => t.group === 2);

  const renderTab = (tab: EditorTab, group: 1 | 2) => {
    const isActive = tab.id === activeTabId;
    const isGroupActive = group === 1 ? tab.id === activeGroup1TabId : tab.id === activeGroup2TabId;
    const isDirty = tab.isDirty;

    return (
      <div
        key={tab.id}
        draggable
        onDragStart={(e) => handleDragStart(e, tab.id)}
        onClick={() => handleTabClick(tab.id, group)}
        onContextMenu={(e) => handleContextMenu(e, tab.id, group)}
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
            if (isDirty) {
              confirm(`"${tab.title}" 有未保存的更改，确定要关闭吗？`, { title: '未保存的更改' }).then((ok) => {
                if (ok) onTabClose(tab.id);
              }).catch(() => onTabClose(tab.id));
              return;
            }
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

  const renderScrollArea = (
    groupTabs: EditorTab[],
    group: 1 | 2,
    scrollRef: React.RefObject<HTMLDivElement | null>,
    scrollState: ScrollState,
    setter: React.Dispatch<React.SetStateAction<ScrollState>>
  ) => (
    <div className="relative flex-1 flex flex-shrink-0 overflow-hidden">
      {scrollState.canLeft && (
        <button
          className={`${arrowBtnClass} left-0`}
          onClick={() => scrollBy(scrollRef.current, -200)}
          title="向左滚动"
        >
          <ChevronLeft size={16} />
        </button>
      )}
      <div
        ref={scrollRef}
        className={`flex overflow-x-auto scrollbar-hide flex-1 pt-[2px] transition-colors duration-150 ${
          dragOverGroup === group ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
        }`}
        onScroll={(e) => checkScroll(e.currentTarget, setter)}
        onDoubleClick={() => handleBlankDoubleClick(group)}
        onDragOver={(e) => handleDragOver(e, group)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, group)}
      >
        {groupTabs.map((tab) => renderTab(tab, group))}
      </div>
      {scrollState.canRight && (
        <button
          className={`${arrowBtnClass} right-0`}
          onClick={() => scrollBy(scrollRef.current, 200)}
          title="向右滚动"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );

  if (tabs.length === 0) {
    return (
      <div
        className="h-9 border-b border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900 flex items-center px-4 text-sm text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
        onDoubleClick={() => onNewFile?.()}
      >
        <span className="flex-1">双击新建文件</span>
      </div>
    );
  }

  return (
    <div className="relative flex h-9 border-b border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {splitMode ? (
        <div className="flex flex-1 overflow-hidden">
            <div className="w-1/2 flex flex-shrink-0 overflow-hidden">
              {renderScrollArea(group1Tabs, 1, g1ScrollRef, g1Scroll, setG1Scroll)}
            </div>
            <div className="flex-shrink-0 w-px bg-gray-200 dark:bg-gray-800 self-stretch" />
            <div className="w-1/2 flex flex-shrink-0 overflow-hidden">
              {renderScrollArea(group2Tabs, 2, g2ScrollRef, g2Scroll, setG2Scroll)}
            </div>
          </div>
        ) : (
        <>
          {renderScrollArea(group1Tabs, 1, g1ScrollRef, g1Scroll, setG1Scroll)}
        </>
      )}

      {contextMenu?.visible && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl bg-white dark:bg-gray-800 py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
            onClick={handleMenuClose}
          >
            关闭
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
            onClick={handleMenuCloseOthers}
          >
            关闭其他页签
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleMenuCloseLeft}
            disabled={(() => {
              const groupTabs = contextMenu.group === 1
                ? tabs.filter((t) => t.group === 1 || !t.group)
                : tabs.filter((t) => t.group === 2);
              const index = groupTabs.findIndex((t) => t.id === contextMenu.tabId);
              return index <= 0;
            })()}
          >
            关闭左侧页签
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleMenuCloseRight}
            disabled={(() => {
              const groupTabs = contextMenu.group === 1
                ? tabs.filter((t) => t.group === 1 || !t.group)
                : tabs.filter((t) => t.group === 2);
              const index = groupTabs.findIndex((t) => t.id === contextMenu.tabId);
              return index < 0 || index >= groupTabs.length - 1;
            })()}
          >
            关闭右侧页签
          </button>
        </div>
      )}
    </div>
  );
};

export default TabBar;
