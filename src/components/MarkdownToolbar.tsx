import React from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Quote,
  Code,
  Terminal,
  Link,
  Image as ImageIcon,
  List,
  ListOrdered,
  ListChecks,
  Table,
  Minus,
} from 'lucide-react';
import type { MarkdownAction } from '../utils/markdownActions';

interface MarkdownToolbarProps {
  onAction: (action: MarkdownAction) => void;
}

interface ToolbarItem {
  action: MarkdownAction;
  label: string;
  icon?: React.ReactNode;
  text?: string;
}

const HEADING_ITEMS: ToolbarItem[] = [
  { action: 'h1', label: '标题 1', text: 'H1' },
  { action: 'h2', label: '标题 2', text: 'H2' },
  { action: 'h3', label: '标题 3', text: 'H3' },
  { action: 'h4', label: '标题 4', text: 'H4' },
  { action: 'h5', label: '标题 5', text: 'H5' },
  { action: 'h6', label: '标题 6', text: 'H6' },
];

const FORMAT_ITEMS: ToolbarItem[] = [
  { action: 'bold', label: '粗体', icon: <Bold size={14} /> },
  { action: 'italic', label: '斜体', icon: <Italic size={14} /> },
  { action: 'strikethrough', label: '删除线', icon: <Strikethrough size={14} /> },
];

const BLOCK_ITEMS: ToolbarItem[] = [
  { action: 'quote', label: '引用', icon: <Quote size={14} /> },
  { action: 'inlineCode', label: '行内代码', icon: <Code size={14} /> },
  { action: 'codeBlock', label: '代码块', icon: <Terminal size={14} /> },
];

const INSERT_ITEMS: ToolbarItem[] = [
  { action: 'link', label: '链接', icon: <Link size={14} /> },
  { action: 'image', label: '图片', icon: <ImageIcon size={14} /> },
  { action: 'table', label: '表格', icon: <Table size={14} /> },
  { action: 'horizontalRule', label: '分割线', icon: <Minus size={14} /> },
];

const LIST_ITEMS: ToolbarItem[] = [
  { action: 'unorderedList', label: '无序列表', icon: <List size={14} /> },
  { action: 'orderedList', label: '有序列表', icon: <ListOrdered size={14} /> },
  { action: 'taskList', label: '任务列表', icon: <ListChecks size={14} /> },
];

const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({ onAction }) => {
  const textBtn =
    'flex items-center justify-center h-7 px-1.5 rounded transition-all duration-100 active:scale-95 hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]';
  const iconBtn =
    'flex items-center justify-center w-7 h-7 rounded transition-all duration-100 active:scale-95 hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]';
  const textStyle: React.CSSProperties = { color: 'var(--te-text-primary)' };
  const dividerStyle: React.CSSProperties = { backgroundColor: 'var(--te-border)' };

  const renderItem = (item: ToolbarItem) => (
    <button
      key={item.action}
      className={item.text ? textBtn : iconBtn}
      style={textStyle}
      onClick={() => onAction(item.action)}
      title={item.label}
      type="button"
    >
      {item.text ? (
        <span className="font-semibold text-[11px]">{item.text}</span>
      ) : (
        item.icon
      )}
    </button>
  );

  return (
    <div
      className="flex items-center gap-0.5 px-2 h-9 border-b overflow-x-auto"
      style={{ backgroundColor: 'var(--te-bg-secondary)', borderColor: 'var(--te-border)' }}
    >
      <div className="flex items-center gap-0.5">{HEADING_ITEMS.map(renderItem)}</div>
      <div className="w-px h-4 mx-1 shrink-0" style={dividerStyle} />
      <div className="flex items-center gap-0.5">{FORMAT_ITEMS.map(renderItem)}</div>
      <div className="w-px h-4 mx-1 shrink-0" style={dividerStyle} />
      <div className="flex items-center gap-0.5">{BLOCK_ITEMS.map(renderItem)}</div>
      <div className="w-px h-4 mx-1 shrink-0" style={dividerStyle} />
      <div className="flex items-center gap-0.5">{INSERT_ITEMS.map(renderItem)}</div>
      <div className="w-px h-4 mx-1 shrink-0" style={dividerStyle} />
      <div className="flex items-center gap-0.5">{LIST_ITEMS.map(renderItem)}</div>
    </div>
  );
};

export default React.memo(MarkdownToolbar);
MarkdownToolbar.displayName = 'MarkdownToolbar';
