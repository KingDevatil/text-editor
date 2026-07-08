import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { EditorTab } from '../types';
import { desktopApi } from '../platform/desktop';

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
  onReorderTab?: (tabId: string, group: 1 | 2, targetGroupIndex: number) => void;
  onCloseTabs?: (tabIds: string[]) => void;
  onRenameTab?: (tabId: string, newTitle: string) => void;
}

interface ScrollState {
  canLeft: boolean;
  canRight: boolean;
}

const arrowBtnClass =
  'absolute top-0 bottom-0 z-10 flex items-center justify-center w-7 h-9 backdrop-blur-sm transition-colors cursor-pointer bg-[color-mix(in_srgb,var(--te-bg-secondary)_90%,transparent)] text-[var(--te-text-secondary)] hover:text-[var(--te-text-primary)]';

const TabBar: React.FC<TabBarProps> = React.memo(({
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
  onReorderTab,
  onCloseTabs,
  onRenameTab,
}) => {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const g1ScrollRef = useRef<HTMLDivElement>(null);
  const g2ScrollRef = useRef<HTMLDivElement>(null);
  const [g1Scroll, setG1Scroll] = useState<ScrollState>({ canLeft: false, canRight: false });
  const [g2Scroll, setG2Scroll] = useState<ScrollState>({ canLeft: false, canRight: false });
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    tabId: string;
    group: 1 | 2;
  } | null>(null);
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Mouse-based drag state; native HTML5 drag/drop is inconsistent in desktop WebViews.
  const dragStateRef = useRef<{
    tabId: string;
    group: 1 | 2;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const dragInfoRef = useRef<{
    group: 1 | 2;
    index: number;
    x: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState<{
    group: 1 | 2;
    index: number;
    x: number;
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
    if (!tab) return;
    setRenamingTab(tabId);
    setRenameValue(tab.title);
    setTimeout(() => renameInputRef.current?.focus(), 10);
  }, [tabs]);

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
    }, 250);
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

  // ---- Mouse-based drag & drop (replaces HTML5 drag/drop) ----
  const getInsertInfo = useCallback((clientX: number) => {
    // Determine which group container the pointer is inside by checking rects directly.
    // This avoids relying on elementFromPoint which can behave oddly in some WebViews.
    let targetGroup: 1 | 2 | null = null;
    let container: HTMLElement | null = null;

    const g1 = g1ScrollRef.current;
    const g2 = g2ScrollRef.current;
    if (g1) {
      const r = g1.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) {
        targetGroup = 1;
        container = g1;
      }
    }
    if (!container && g2) {
      const r = g2.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) {
        targetGroup = 2;
        container = g2;
      }
    }

    if (!targetGroup || !container) return null;

    // Collect tab elements from container.children directly.
    const tabEls = Array.from(container.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-tab-id')
    );
    let targetIndex = 0;
    let indicatorX = container.getBoundingClientRect().left + 4;

    if (tabEls.length > 0) {
      let found = false;
      for (let i = 0; i < tabEls.length; i++) {
        const rect = tabEls[i].getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        if (clientX < mid) {
          targetIndex = i;
          indicatorX = rect.left;
          found = true;
          break;
        }
      }
      if (!found) {
        const last = tabEls[tabEls.length - 1];
        const rect = last.getBoundingClientRect();
        targetIndex = tabEls.length;
        indicatorX = rect.right;
      }
    }
    return { group: targetGroup, index: targetIndex, x: indicatorX };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, tabId: string, group: 1 | 2) => {
    if (e.button !== 0) return;
    dragStateRef.current = {
      tabId,
      group,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      if (!ds.active) {
        const dx = ev.clientX - ds.startX;
        const dy = ev.clientY - ds.startY;
        if (Math.sqrt(dx * dx + dy * dy) < 5) return;
        ds.active = true;
      }
      const info = getInsertInfo(ev.clientX);
      dragInfoRef.current = info;
      if (!info) {
        setDragOver(null);
        return;
      }
      // Same group: hide indicator when hovering over current position or immediate neighbour
      if (info.group === ds.group) {
        const groupTabs = info.group === 1
          ? tabs.filter((t) => t.group === 1 || !t.group)
          : tabs.filter((t) => t.group === 2);
        const currentIndex = groupTabs.findIndex((t) => t.id === ds.tabId);
        if (info.index === currentIndex || info.index === currentIndex + 1) {
          setDragOver(null);
          return;
        }
      }
      setDragOver(info);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      const ds = dragStateRef.current;
      dragStateRef.current = null;
      const info = dragInfoRef.current;
      dragInfoRef.current = null;
      setDragOver(null);
      if (!ds || !ds.active) return;
      if (!info) return;

      if (info.group === ds.group) {
        const groupTabsOrdered = info.group === 1
          ? tabs.filter((t) => t.group === 1 || !t.group)
          : tabs.filter((t) => t.group === 2);
        const currentIndex = groupTabsOrdered.findIndex((t) => t.id === ds.tabId);
        if (info.index === currentIndex || info.index === currentIndex + 1) return;

        onReorderTab?.(ds.tabId, ds.group, info.index);
      } else {
        onMoveTabToGroup?.(ds.tabId, info.group);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [tabs, onReorderTab, onMoveTabToGroup, getInsertInfo]);

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
        desktopApi.confirm(`"${tab.title}" 有未保存的更改，确定要关闭吗？`, { title: '未保存的更改' }).then((ok) => {
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
      desktopApi.confirm('要关闭的页签中有未保存的更改，确定关闭吗？', { title: '未保存的更改' }).then((ok) => {
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
        desktopApi.confirm('要关闭的页签中有未保存的更改，确定关闭吗？', { title: '未保存的更改' }).then((ok) => {
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
        desktopApi.confirm('要关闭的页签中有未保存的更改，确定关闭吗？', { title: '未保存的更改' }).then((ok) => {
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
        data-tab-id={tab.id}
        data-group={group}
        data-group-active={isGroupActive}
        data-focused={isActive}
        onMouseDown={(e) => handleMouseDown(e, tab.id, group)}
        onClick={() => handleTabClick(tab.id, group)}
        onContextMenu={(e) => handleContextMenu(e, tab.id, group)}
        className={`
          group relative flex items-center gap-2 px-3.5 min-w-[120px] max-w-[220px] cursor-pointer select-none flex-shrink-0
          text-sm transition-all duration-100
          ${isGroupActive
            ? 'bg-[var(--te-tab-active-bg)] text-[var(--te-text-primary)] z-10'
            : 'bg-[var(--te-tab-inactive-bg)] text-[var(--te-text-secondary)] hover:bg-[color-mix(in_srgb,var(--te-tab-inactive-bg)_75%,var(--te-tab-active-bg))] hover:text-[var(--te-text-primary)]'
          }
        `}
        style={{
          borderRadius: '8px 8px 0 0',
          marginRight: '2px',
        }}
      >
        {isGroupActive && (
          <div className="absolute top-0 left-2 right-2 h-[2px] rounded-full" style={{ background: 'linear-gradient(to right, var(--te-primary), color-mix(in srgb, var(--te-primary) 70%, transparent))' }} />
        )}
        {renamingTab === tab.id ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                if (renameValue.trim() && onRenameTab) {
                  onRenameTab(tab.id, renameValue.trim());
                }
                setRenamingTab(null);
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                setRenamingTab(null);
              }
            }}
            onBlur={() => {
              if (renameValue.trim() && onRenameTab) {
                onRenameTab(tab.id, renameValue.trim());
              }
              setRenamingTab(null);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-sm bg-transparent outline-none border-b border-[var(--te-primary)] text-[var(--te-text-primary)]"
          />
        ) : (
          <span className={`truncate flex-1 ${isDirty ? 'italic' : ''}`}>
            {isDirty && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--te-primary)] mr-1.5 align-middle" />
            )}
            {tab.title}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isDirty) {
              desktopApi.confirm(`"${tab.title}" 有未保存的更改，确定要关闭吗？`, { title: '未保存的更改' }).then((ok) => {
                if (ok) onTabClose(tab.id);
              }).catch(() => onTabClose(tab.id));
              return;
            }
            onTabClose(tab.id);
          }}
          className="p-0.5 rounded-md transition-all duration-100 text-[var(--te-text-secondary)] hover:text-[var(--te-error)] hover:bg-[color-mix(in_srgb,var(--te-error)_10%,transparent)]"
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
        data-group={group}
        className={`flex overflow-x-auto scrollbar-hide flex-1 pt-[2px] transition-colors duration-150 ${
          dragOver?.group === group ? 'bg-[color-mix(in_srgb,var(--te-primary)_10%,transparent)]' : ''
        }`}
        onScroll={(e) => checkScroll(e.currentTarget, setter)}
        onDoubleClick={() => handleBlankDoubleClick(group)}
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
        className="h-9 border-b flex items-center px-4 text-sm cursor-pointer transition-colors hover:text-[var(--te-text-primary)]"
        style={{ backgroundColor: 'var(--te-bg-secondary)', borderColor: 'var(--te-border)', color: 'var(--te-text-secondary)' }}
        onDoubleClick={() => onNewFile?.()}
      >
        <span className="flex-1">双击新建文件</span>
      </div>
    );
  }

  return (
    <div className="relative flex h-9 border-b overflow-hidden" style={{ backgroundColor: 'var(--te-bg-secondary)', borderColor: 'var(--te-border)' }}>
      {splitMode ? (
        <div className="flex flex-1 overflow-hidden">
            <div className="w-1/2 flex flex-shrink-0 overflow-hidden">
              {renderScrollArea(group1Tabs, 1, g1ScrollRef, g1Scroll, setG1Scroll)}
            </div>
            <div className="flex-shrink-0 w-px bg-[var(--te-border)] self-stretch" />
            <div className="w-1/2 flex flex-shrink-0 overflow-hidden">
              {renderScrollArea(group2Tabs, 2, g2ScrollRef, g2Scroll, setG2Scroll)}
            </div>
          </div>
        ) : (
        <>
          {renderScrollArea(group1Tabs, 1, g1ScrollRef, g1Scroll, setG1Scroll)}
        </>
      )}

      {/* Drag drop indicator */}
      {dragOver && (
        <div
          className="fixed top-0 bottom-0 w-[2px] z-50 pointer-events-none bg-[var(--te-primary)]"
          style={{ left: dragOver.x }}
        />
      )}

      {contextMenu?.visible && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg shadow-xl py-1 text-sm"
          style={{ backgroundColor: 'var(--te-bg-tertiary)', border: '1px solid var(--te-border)', left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 transition-colors text-[var(--te-text-primary)] hover:bg-[var(--te-bg-secondary)]"
            onClick={handleMenuClose}
          >
            关闭
          </button>
          <button
            className="w-full text-left px-3 py-1.5 transition-colors text-[var(--te-text-primary)] hover:bg-[var(--te-bg-secondary)]"
            onClick={handleMenuCloseOthers}
          >
            关闭其他页签
          </button>
          <div className="my-1 border-t" style={{ borderColor: 'var(--te-border)' }} />
          <button
            className="w-full text-left px-3 py-1.5 transition-colors text-[var(--te-text-primary)] hover:bg-[var(--te-bg-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="w-full text-left px-3 py-1.5 transition-colors text-[var(--te-text-primary)] hover:bg-[var(--te-bg-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
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
});

export default TabBar;
TabBar.displayName = 'TabBar';
