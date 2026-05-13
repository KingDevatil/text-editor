import React from 'react';
import { X, Keyboard, MousePointer, Columns, FileText, Terminal, Search, Braces, BookOpen } from 'lucide-react';

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
        <Section title="命令面板" icon={<Terminal size={16} />}>
          <ShortcutRow keys="F1" desc="打开命令面板（快速访问所有功能）" />
        </Section>

        <Section title="文本编辑" icon={<FileText size={16} />}>
          <ShortcutRow keys="Ctrl + Z" desc="撤销" />
          <ShortcutRow keys="Ctrl + Shift + Z" desc="重做" />
          <ShortcutRow keys="Ctrl + X" desc="剪切" />
          <ShortcutRow keys="Ctrl + C" desc="复制" />
          <ShortcutRow keys="Ctrl + V" desc="粘贴" />
          <ShortcutRow keys="Ctrl + A" desc="全选" />
          <ShortcutRow keys="Tab / Shift + Tab" desc="缩进 / 取消缩进" />
          <ShortcutRow keys="Shift + Alt + F" desc="格式化文档" />
        </Section>

        <Section title="查找与替换" icon={<Search size={16} />}>
          <ShortcutRow keys="Ctrl + F" desc="查找" />
          <ShortcutRow keys="Ctrl + H" desc="替换" />
          <div className="px-4 py-3 text-sm border-t" style={{ color: 'var(--te-text-primary)', borderColor: 'color-mix(in srgb, var(--te-border) 30%, transparent)' }}>
            <p className="mb-1">查找替换面板支持以下高级功能：</p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>正则表达式搜索（切换正则模式后支持）</li>
              <li>正则构建器：可视化辅助构建正则表达式</li>
              <li>选中文本后按 Ctrl+F 可自动填入查找内容</li>
            </ul>
          </div>
        </Section>

        <Section title="多光标与列编辑（Notepad++ 风格）" icon={<MousePointer size={16} />}>
          <ShortcutRow keys="Ctrl + 点击" desc="添加多个光标（多光标编辑）" />
          <ShortcutRow keys="Alt + 拖拽" desc="矩形框选（列编辑）" />
          <ShortcutRow keys="Ctrl + D" desc="选中当前单词，继续按选中下一个匹配" />
        </Section>

        <Section title="代码导航与辅助" icon={<Braces size={16} />}>
          <ShortcutRow keys="F12" desc="转到定义（仅桌面端）" />
          <div className="px-4 py-3 text-sm border-t" style={{ color: 'var(--te-text-primary)', borderColor: 'color-mix(in srgb, var(--te-border) 30%, transparent)' }}>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>自动补全：输入时自动提示代码补全（Ctrl + Space 手动触发）</li>
              <li>签名提示：输入函数参数时显示参数列表和说明</li>
              <li>悬停提示：鼠标悬停在变量/函数上查看类型和信息</li>
              <li>括号匹配：自动高亮匹配括号与 HTML/XML 标签对</li>
              <li>代码折叠：点击行号旁的箭头折叠/展开代码块</li>
            </ul>
          </div>
        </Section>

        <Section title="文件与标签" icon={<FileText size={16} />}>
          <ShortcutRow keys="Ctrl + N" desc="新建文件" />
          <ShortcutRow keys="Ctrl + O" desc="打开文件" />
          <ShortcutRow keys="Ctrl + S" desc="保存" />
          <ShortcutRow keys="Ctrl + W" desc="关闭当前标签" />
          <ShortcutRow keys="鼠标拖拽标签" desc="同组内排序 / 跨组移动（分屏）" />
          <div className="px-4 py-3 text-sm border-t" style={{ color: 'var(--te-text-primary)', borderColor: 'color-mix(in srgb, var(--te-border) 30%, transparent)' }}>
            <p className="mb-1">文件相关功能：</p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>Diff 对比：选择两个文件进行差异对比（命令面板或工具栏）</li>
              <li>外部修改检测：文件被外部程序修改时自动提示重新加载</li>
              <li>在文件夹中显示：通过命令面板在系统文件管理器中定位当前文件</li>
            </ul>
          </div>
        </Section>

        <Section title="视图与分屏" icon={<Columns size={16} />}>
          <ShortcutRow keys="Ctrl + Shift + V" desc="切换 Markdown / HTML 阅读模式" />
          <ShortcutRow keys="鼠标拖拽标签到另一侧" desc="分屏编辑" />
          <ShortcutRow keys="F11" desc="切换全屏" />
          <div className="px-4 py-3 text-sm border-t" style={{ color: 'var(--te-text-primary)', borderColor: 'color-mix(in srgb, var(--te-border) 30%, transparent)' }}>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>预览模式：Markdown / HTML 实时预览（工具栏或命令面板）</li>
              <li>Minimap：代码缩略图，支持快速定位（设置面板开关）</li>
              <li>侧边栏：显示/隐藏项目文件树（工具栏或命令面板）</li>
            </ul>
          </div>
        </Section>

        <Section title="Markdown / HTML" icon={<BookOpen size={16} />}>
          <div className="px-4 py-3 text-sm" style={{ color: 'var(--te-text-primary)' }}>
            <p className="mb-2">支持 Markdown 和 HTML 的实时预览与阅读模式：</p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>预览模式：与编辑器并排显示渲染后的内容</li>
              <li>阅读模式：专注阅读，带目录导航和字体调节</li>
              <li>文档内目录锚点链接（<code>[标题](#标题)</code>）可点击跳转</li>
              <li>阅读模式下支持深色/浅色主题自适应</li>
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
