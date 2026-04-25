import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, Replace, ReplaceAll } from 'lucide-react';
import * as monaco from 'monaco-editor';

interface FindReplaceProps {
  visible: boolean;
  onClose: () => void;
  editorRef?: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
}

const FindReplace: React.FC<FindReplaceProps> = ({ visible, onClose, editorRef }) => {
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

  const handleReplace = () => {
    const editor = editorRef?.current;
    if (!editor || !findText) return;
    const model = editor.getModel();
    if (!model) return;
    const matches = model.findMatches(findText, false, false, caseSensitive, null, true);
    if (matches.length === 0) return;
    // Replace first match
    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: matches[0].range,
      text: replaceText,
    };
    editor.executeEdits('find-replace', [edit]);
    editor.focus();
  };

  const handleReplaceAll = () => {
    const editor = editorRef?.current;
    if (!editor || !findText) return;
    const model = editor.getModel();
    if (!model) return;
    const matches = model.findMatches(findText, false, false, caseSensitive, null, true);
    if (matches.length === 0) return;
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = matches.map((m) => ({
      range: m.range,
      text: replaceText,
    }));
    editor.executeEdits('find-replace-all', edits);
    editor.focus();
  };

  if (!visible) return null;

  const inputClass =
    'px-3 py-1.5 text-sm rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all';

  const iconBtnClass =
    'p-1.5 rounded-lg hover:bg-gray-200/80 dark:hover:bg-gray-700/80 text-gray-500 dark:text-gray-400 transition-colors active:scale-95';

  const disabledBtnClass = 'opacity-40 cursor-not-allowed active:scale-100';

  const canReplace = !!findText;

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 border-b border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={findInputRef}
              type="text"
              placeholder="查找"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              className={`${inputClass} w-full border-gray-300 dark:border-gray-600`}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
              }}
            />
          </div>
          {showReplace && (
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="替换为"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                className={`${inputClass} w-full border-gray-300 dark:border-gray-600`}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {showReplace && (
            <>
              <button
                title="替换"
                className={`${iconBtnClass} ${!canReplace ? disabledBtnClass : ''}`}
                onClick={handleReplace}
                disabled={!canReplace}
              >
                <Replace size={14} />
              </button>
              <button
                title="全部替换"
                className={`${iconBtnClass} ${!canReplace ? disabledBtnClass : ''}`}
                onClick={handleReplaceAll}
                disabled={!canReplace}
              >
                <ReplaceAll size={14} />
              </button>
            </>
          )}
          <button
            onClick={() => setShowReplace(!showReplace)}
            className={iconBtnClass}
            title={showReplace ? '隐藏替换' : '显示替换'}
          >
            {showReplace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={onClose} className={iconBtnClass} title="关闭">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          <span>区分大小写</span>
        </label>
        <span className="text-gray-400 dark:text-gray-500">提示: 使用编辑器内置的 Ctrl+H 可进行高级查找替换</span>
      </div>
    </div>
  );
};

export default FindReplace;
