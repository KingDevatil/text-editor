import React, { useState } from 'react';
import { FileText, Settings, FolderTree, ChevronRight, ChevronDown } from 'lucide-react';

interface SidebarProps {
  visible: boolean;
  width: number;
  unicodeHighlight: boolean;
  onToggleUnicodeHighlight: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ visible, width, unicodeHighlight, onToggleUnicodeHighlight, fontSize, onFontSizeChange }) => {
  const [activeSection, setActiveSection] = useState<'files' | 'settings'>('files');
  const [foldersOpen, setFoldersOpen] = useState<Record<string, boolean>>({
    root: true,
  });

  if (!visible) return null;

  const toggleFolder = (name: string) => {
    setFoldersOpen((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div
      className="flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
      style={{ width: `${width}px`, minWidth: `${width}px` }}
    >
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveSection('files')}
          className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
            activeSection === 'files'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <FolderTree size={14} />
          文件
        </button>
        <button
          onClick={() => setActiveSection('settings')}
          className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
            activeSection === 'settings'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Settings size={14} />
          设置
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {activeSection === 'files' && (
          <div className="text-sm">
            <div
              className="flex items-center gap-1 cursor-pointer text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 rounded px-1 py-0.5"
              onClick={() => toggleFolder('root')}
            >
              {foldersOpen.root ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="font-medium">项目</span>
            </div>
            {foldersOpen.root && (
              <div className="ml-4 mt-1 space-y-0.5">
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded px-1 py-0.5 cursor-pointer">
                  <FileText size={12} />
                  <span>index.html</span>
                </div>
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded px-1 py-0.5 cursor-pointer">
                  <FileText size={12} />
                  <span>main.ts</span>
                </div>
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded px-1 py-0.5 cursor-pointer">
                  <FileText size={12} />
                  <span>style.css</span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'settings' && (
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                编辑器设置
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>全角半角检测</span>
                  <input
                    type="checkbox"
                    checked={unicodeHighlight}
                    onChange={onToggleUnicodeHighlight}
                    className="rounded"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>显示行号</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </div>
                <div className="flex items-center justify-between">
                  <span>自动换行</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </div>
                <div className="flex items-center justify-between">
                  <span>迷你地图</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                字体大小: {fontSize}px
              </label>
              <input
                type="range"
                min="10"
                max="24"
                value={fontSize}
                onChange={(e) => onFontSizeChange(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
