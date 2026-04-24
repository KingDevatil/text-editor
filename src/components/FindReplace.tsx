import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, Replace, ReplaceAll } from 'lucide-react';

interface FindReplaceProps {
  visible: boolean;
  onClose: () => void;
  editorRef?: React.MutableRefObject<any>;
}

const FindReplace: React.FC<FindReplaceProps> = ({ visible, onClose }) => {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(true);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible && findInputRef.current) {
      findInputRef.current.focus();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2">
          <input
            ref={findInputRef}
            type="text"
            placeholder="查找"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          />
          {showReplace && (
            <input
              type="text"
              placeholder="替换为"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          {showReplace && (
            <>
              <button
                title="替换"
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              >
                <Replace size={14} />
              </button>
              <button
                title="全部替换"
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              >
                <ReplaceAll size={14} />
              </button>
            </>
          )}
          <button
            onClick={() => setShowReplace(!showReplace)}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            title={showReplace ? '隐藏替换' : '显示替换'}
          >
            {showReplace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="rounded"
          />
          区分大小写
        </label>
        <span>提示: 使用编辑器内置的 Ctrl+H 可进行高级查找替换</span>
      </div>
    </div>
  );
};

export default FindReplace;
