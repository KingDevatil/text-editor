import React from 'react';
import { X } from 'lucide-react';
import type { EditorTab } from '../types';

interface TabBarProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTabId, onTabClick, onTabClose }) => {
  if (tabs.length === 0) {
    return (
      <div className="h-9 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center px-4 text-sm text-gray-400 dark:text-gray-500">
        无打开的文件
      </div>
    );
  }

  return (
    <div className="flex h-9 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            className={`
              group flex items-center gap-2 px-3 min-w-[120px] max-w-[200px] cursor-pointer select-none
              border-r border-gray-200 dark:border-gray-700 text-sm
              transition-colors
              ${
                isActive
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-b-2 border-b-blue-500'
                  : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }
            `}
          >
            <span className="truncate flex-1">
              {tab.isDirty && <span className="text-blue-500 mr-1">●</span>}
              {tab.title}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-opacity"
              title="关闭"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default TabBar;
