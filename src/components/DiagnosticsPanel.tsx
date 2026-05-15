import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorSelection } from '@codemirror/state';
import { getActiveView } from '../hooks/useEditorStatePool';
import { getPollInterval, shouldSkipDiagnostics, hasDiagnosticEngine } from '../utils/diagnostics';
import type { Diagnostic } from '@codemirror/lint';

interface DiagnosticItem {
  from: number;
  to: number;
  severity: 'error' | 'warning';
  message: string;
  line: number;
  col: number;
}

interface DiagnosticsPanelProps {
  tabId: string | null;
  visible: boolean;
  language: string | null;
}

function severityOrder(a: DiagnosticItem, b: DiagnosticItem): number {
  if (a.severity === 'error' && b.severity !== 'error') return -1;
  if (a.severity !== 'error' && b.severity === 'error') return 1;
  return a.line - b.line || a.col - b.col;
}

const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = React.memo(({ tabId, visible, language }) => {
  const [items, setItems] = useState<DiagnosticItem[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(() => {
    if (!tabId || !visible) return;

    const view = getActiveView(tabId);
    if (!view) {
      setItems([]);
      return;
    }

    const docLength = view.state.doc.length;

    if (shouldSkipDiagnostics(docLength)) {
      setItems([]);
      setInfo('文件过大，已跳过检测');
      return;
    }

    if (language && !hasDiagnosticEngine(language)) {
      setItems([]);
      setInfo('当前语言不支持检测');
      return;
    }

    setInfo(null);

    const newItems: DiagnosticItem[] = [];
    forEachDiagnostic(view.state, (d: Diagnostic) => {
      const line = view.state.doc.lineAt(d.from);
      newItems.push({
        from: d.from,
        to: d.to,
        severity: d.severity === 'error' ? 'error' : 'warning',
        message: d.message,
        line: line.number,
        col: d.from - line.from + 1,
      });
    });

    newItems.sort(severityOrder);
    setItems(newItems);
  }, [tabId, visible, language]);

  useEffect(() => {
    if (!visible || !tabId) {
      setItems([]);
      setInfo(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    poll();

    const view = getActiveView(tabId);
    const docLength = view?.state.doc.length ?? 0;
    const interval = getPollInterval(docLength);

    if (interval > 0) {
      intervalRef.current = setInterval(poll, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible, tabId, poll]);

  const handleJump = useCallback(
    (item: DiagnosticItem) => {
      if (!tabId) return;
      const view = getActiveView(tabId);
      if (!view) return;
      view.dispatch({
        selection: EditorSelection.cursor(item.from),
        scrollIntoView: true,
      });
      view.focus();
    },
    [tabId]
  );

  if (!visible) return null;

  const errorCount = items.filter((i) => i.severity === 'error').length;
  const warningCount = items.filter((i) => i.severity === 'warning').length;

  return (
    <div
      className="flex flex-col border-t"
      style={{
        height: 192,
        backgroundColor: 'var(--te-bg-secondary)',
        borderColor: 'var(--te-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 border-b" style={{ borderColor: 'var(--te-border)' }}>
        <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--te-text-primary)' }}>
          {errorCount > 0 && (
            <span className="flex items-center gap-1" style={{ color: 'var(--te-error, #ef4444)' }}>
              <AlertCircle size={12} />
              {errorCount} 个错误
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1" style={{ color: 'var(--te-warning, #f59e0b)' }}>
              <AlertTriangle size={12} />
              {warningCount} 个警告
            </span>
          )}
          {errorCount === 0 && warningCount === 0 && !info && (
            <span style={{ color: 'var(--te-success, #22c55e)' }}>无问题</span>
          )}
          {info && <span style={{ color: 'var(--te-text-secondary)' }}>{info}</span>}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--te-text-secondary)' }}>
            {info || '暂无检测到问题'}
          </div>
        ) : (
          <div className="py-1">
            {items.map((item, idx) => (
              <div
                key={`${item.from}-${item.to}-${idx}`}
                className="w-full flex items-start gap-2 px-3 py-1.5 text-left text-xs hover:opacity-80 transition-opacity select-text cursor-pointer"
                style={{
                  color: 'var(--te-text-primary)',
                  backgroundColor: 'transparent',
                }}
                onClick={() => {
                  const sel = window.getSelection()?.toString();
                  if (sel) return;
                  handleJump(item);
                }}
              >
                {item.severity === 'error' ? (
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--te-error, #ef4444)' }} />
                ) : (
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--te-warning, #f59e0b)' }} />
                )}
                <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--te-text-secondary)', minWidth: 48 }}>
                  第 {item.line} 行
                </span>
                <span className="flex-1 truncate" title={item.message}>
                  {item.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

DiagnosticsPanel.displayName = 'DiagnosticsPanel';

export default DiagnosticsPanel;
