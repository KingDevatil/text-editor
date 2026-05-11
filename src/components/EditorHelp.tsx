import React from 'react';
import { X, Keyboard, MousePointer, Eye, Columns, FileText } from 'lucide-react';

interface EditorHelpProps {
  onClose: () => void;
}

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <div className="mb-6">
    <h3 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: 'var(--te-text-primary)' }}>
      {icon}
      {title}
    </h3>
    <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'color-mix(in srgb, var(--te-border) 30%, transparent)' }}>
      {children}
    </div>
  </div>
);

const ShortcutRow: React.FC<{ keys: string; desc: string }> = ({ keys, desc }) => (
  <div className="flex items-center justify-between px-4 py-2.5 text-sm border-b last:border-b-0" style={{ color: 'var(--te-text-primary)', borderColor: 'color-mix(in srgb, var(--te-border) 30%, transparent)' }}>
    <span>{desc}</span>
    <kbd className="px-2 py-0.5 rounded text-xs font-mono border" style={{ backgroundColor: 'var(--te-bg-tertiary)', color: 'var(--te-text-secondary)', borderColor: 'var(--te-border)' }}>
      {keys}
    </kbd>
  </div>
);

const EditorHelp: React.FC<EditorHelpProps> = ({ onClose }) => {
  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--te-bg-primary)' }} onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b" style={{ borderColor: 'color-mix(in srgb, var(--te-border) 10%, transparent)' }}>
        <div className="flex items-center gap-2">
          <Keyboard size={16} style={{ color: 'var(--te-text-primary)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--te-text-primary)' }}>编辑器使用说明</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-1.5 rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--te-text-primary)_10%,transparent)]"
          style={{ color: 'var(--te-text-primary)' }}
          title="关闭"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6 max-w-2xl mx-auto w-full">
        <Section title="文本编辑" icon={<FileText size={16} />}>
          <ShortcutRow keys="Ctrl + Z" desc="撤销" />
          <ShortcutRow keys="Ctrl + Shift + Z" desc="重做" />
          <ShortcutRow keys="Ctrl + X" desc="剪切" />
          <ShortcutRow keys="Ctrl + C" desc="复制" />
          <ShortcutRow keys="Ctrl + V" desc="粘贴" />
          <ShortcutRow keys="Ctrl + A" desc="全选" />
          <ShortcutRow keys="Ctrl + F" desc="查找" />
          <ShortcutRow keys="Ctrl + H" desc="替换" />
          <ShortcutRow keys="Tab / Shift + Tab" desc="缩进 / 取消缩进" />
        </Section>

        <Section title="多光标与列编辑（Notepad++ 风格）" icon={<MousePointer size={16} />}>
          <ShortcutRow keys="Ctrl + 点击" desc="添加多个光标（多光标编辑）" />
          <ShortcutRow keys="Alt + 拖拽" desc="矩形框选（列编辑）" />
          <ShortcutRow keys="Ctrl + D" desc="选中当前单词，继续按选中下一个匹配" />
        </Section>

        <Section title="文件与标签" icon={<FileText size={16} />}>
          <ShortcutRow keys="Ctrl + N" desc="新建文件" />
          <ShortcutRow keys="Ctrl + O" desc="打开文件" />
          <ShortcutRow keys="Ctrl + S" desc="保存" />
          <ShortcutRow keys="Ctrl + W" desc="关闭当前标签" />
          <ShortcutRow keys="鼠标拖拽标签" desc="同组内排序 / 跨组移动（分屏）" />
        </Section>

        <Section title="视图与分屏" icon={<Columns size={16} />}>
          <ShortcutRow keys="Ctrl + Shift + P" desc="切换 Markdown 预览" />
          <ShortcutRow keys="Ctrl + Shift + R" desc="切换 Markdown 阅读模式" />
          <ShortcutRow keys="鼠标拖拽标签到另一侧" desc="分屏编辑" />
          <ShortcutRow keys="F11" desc="切换全屏" />
        </Section>

        <Section title="Markdown" icon={<Eye size={16} />}>
          <div className="px-4 py-3 text-sm" style={{ color: 'var(--te-text-primary)' }}>
            <p className="mb-2">支持 Markdown 实时预览和阅读模式：</p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>预览模式：与编辑器并排显示渲染后的 HTML</li>
              <li>阅读模式：专注阅读，带目录导航和字体调节</li>
              <li>文档内目录锚点链接（<code>[标题](#标题)</code>）可点击跳转</li>
            </ul>
          </div>
        </Section>

        <div className="text-xs text-center mt-8" style={{ color: 'var(--te-text-secondary)' }}>
          更多功能持续开发中，如有建议欢迎反馈。
        </div>
      </div>
    </div>
  );
};

export default EditorHelp;
