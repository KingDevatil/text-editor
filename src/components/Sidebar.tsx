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

  const sectionBtnClass = (active: boolean) =>
    `relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
      active
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`;

  return (
    <div
      className="flex flex-col border-r border-gray-200 dark:border-gray-700/80 bg-gray-50/60 dark:bg-gray-900/60"
      style={{ width: `${width}px`, minWidth: `${width}px` }}
    >
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700/80 relative">
        <button
          onClick={() => setActiveSection('files')}
          className={sectionBtnClass(activeSection === 'files')}
        >
          <FolderTree size={14} />
          文件
        </button>
        <button
          onClick={() => setActiveSection('settings')}
          className={sectionBtnClass(activeSection === 'settings')}
        >
          <Settings size={14} />
          设置
        </button>
        {/* Animated indicator */}
        <div
          className="absolute bottom-0 h-0.5 bg-blue-500 rounded-full transition-all duration-200"
          style={{
            width: '50%',
            left: activeSection === 'files' ? '0%' : '50%',
          }}
        />
      </div>

      <div className="flex-1 overflow-auto p-3">
        {activeSection === 'files' && (
          <div className="text-sm">
            <div
              className="flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-800/60 rounded-md px-2 py-1 transition-colors"
              onClick={() => toggleFolder('root')}
            >
              {foldersOpen.root ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
              <span className="font-medium text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">项目</span>
            </div>
            {foldersOpen.root && (
              <div className="ml-5 mt-1 space-y-0.5">
                {['index.html', 'main.ts', 'style.css'].map((file) => (
                  <div
                    key={file}
                    className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800/60 rounded-md px-2 py-1 cursor-pointer transition-colors text-sm"
                  >
                    <FileText size={13} className="text-gray-400" />
                    <span>{file}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'settings' && (
          <div className="space-y-4 text-sm text-gray-700 dark:text-gray-200">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                编辑器设置
              </label>
              <div className="space-y-2.5 bg-white dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700/50">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">全角半角检测</span>
                  <input
                    type="checkbox"
                    checked={unicodeHighlight}
                    onChange={onToggleUnicodeHighlight}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">显示行号</span>
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">自动换行</span>
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">迷你地图</span>
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                字体大小
              </label>
              <div className="bg-white dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{fontSize}px</span>
                </div>
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
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
