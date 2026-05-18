import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorSelection } from '@codemirror/state';
import { getActiveView } from '../hooks/useEditorStatePool';
import { getPollInterval, shouldSkipDiagnostics, hasDiagnosticEngine } from '../utils/diagnostics';
import type { Diagnostic } from '@codemirror/lint';

interface DiagnosticItem {
  from: number;
  to: number;
  severity: 'error' | 'warning' | 'info';
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
  const rank = { error: 0, warning: 1, info: 2 };
  if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
  return a.line - b.line || a.col - b.col;
}

const severityConfig = {
  error: {
    label: '错误',
    color: 'var(--te-error, #ef4444)',
    bgActive: 'color-mix(in srgb, var(--te-error, #ef4444) 15%, transparent)',
    Icon: AlertCircle,
  },
  warning: {
    label: '警告',
    color: 'var(--te-warning, #f59e0b)',
    bgActive: 'color-mix(in srgb, var(--te-warning, #f59e0b) 15%, transparent)',
    Icon: AlertTriangle,
  },
  info: {
    label: '提示',
    color: 'var(--te-info, #3b82f6)',
    bgActive: 'color-mix(in srgb, var(--te-info, #3b82f6) 15%, transparent)',
    Icon: Info,
  },
};

const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = React.memo(({ tabId, visible, language }) => {
  const [items, setItems] = useState<DiagnosticItem[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [showError, setShowError] = useState(true);
  const [showWarning, setShowWarning] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
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
      const sev = d.severity === 'error' || d.severity === 'warning' || d.severity === 'info'
        ? d.severity
        : 'warning';
      newItems.push({
        from: d.from,
        to: d.to,
        severity: sev,
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

  const counts = {
    error: items.filter((i) => i.severity === 'error').length,
    warning: items.filter((i) => i.severity === 'warning').length,
    info: items.filter((i) => i.severity === 'info').length,
  };

  const filteredItems = items.filter((i) => {
    if (i.severity === 'error') return showError;
    if (i.severity === 'warning') return showWarning;
    if (i.severity === 'info') return showInfo;
    return true;
  });

  const toggles = [
    { key: 'error' as const, show: showError, set: setShowError },
    { key: 'warning' as const, show: showWarning, set: setShowWarning },
    { key: 'info' as const, show: showInfo, set: setShowInfo },
  ];

  const hasAny = counts.error > 0 || counts.warning > 0 || counts.info > 0;

  return (
    <div
      className="flex flex-col border-t"
      style={{
        height: 192,
        backgroundColor: 'var(--te-bg-secondary)',
        borderColor: 'var(--te-border)',
      }}
    >
      {/* Header with toggle buttons */}
      <div className="flex items-center justify-between px-3 h-8 border-b" style={{ borderColor: 'var(--te-border)' }}>
        <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--te-text-primary)' }}>
          {hasAny ? (
            toggles.map(({ key, show, set }) => {
              const cfg = severityConfig[key];
              const count = counts[key];
              if (count === 0) return null;
              const Icon = cfg.Icon;
              return (
                <button
                  key={key}
                  onClick={() => set(!show)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                  style={
                    show
                      ? { backgroundColor: cfg.bgActive, color: cfg.color }
                      : { color: 'var(--te-text-secondary)', opacity: 0.5 }
                  }
                  title={`点击${show ? '隐藏' : '显示'}${cfg.label}`}
                >
                  <Icon size={12} />
                  {count} 个{cfg.label}
                </button>
              );
            })
          ) : !info ? (
            <span style={{ color: 'var(--te-success, #22c55e)' }}>无问题</span>
          ) : null}
          {info && <span style={{ color: 'var(--te-text-secondary)' }}>{info}</span>}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {filteredItems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--te-text-secondary)' }}>
            {info || '暂无检测到问题'}
          </div>
        ) : (
          <div className="py-1">
            {filteredItems.map((item, idx) => {
              const cfg = severityConfig[item.severity];
              const Icon = cfg.Icon;
              return (
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
                  <Icon size={13} className="mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />
                  <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--te-text-secondary)', minWidth: 48 }}>
                    第 {item.line} 行
                  </span>
                  <span className="flex-1 truncate" title={item.message}>
                    {item.message}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

DiagnosticsPanel.displayName = 'DiagnosticsPanel';

export default DiagnosticsPanel;
