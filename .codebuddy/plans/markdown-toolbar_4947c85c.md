---
name: markdown-toolbar
overview: 为 Markdown 文件增加编辑器顶部格式化工具栏，支持常用 MD 语法的快捷插入。
design:
  architecture:
    framework: react
  styleKeywords:
    - Minimalism
    - Clean
    - Compact
  fontSystem:
    fontFamily: JetBrains Mono
    heading:
      size: 14px
      weight: 500
    subheading:
      size: 18px
      weight: 500
    body:
      size: 13px
      weight: 400
  colorSystem:
    primary:
      - "#3B82F6"
    background:
      - var(--te-bg-secondary)
      - var(--te-bg-primary)
    text:
      - var(--te-text-primary)
      - var(--te-text-secondary)
    functional:
      - var(--te-border)
todos:
  - id: create-markdown-toolbar
    content: 创建 MarkdownToolbar 组件及 action 定义
    status: completed
  - id: integrate-toolbar
    content: 在 CmEditor 中条件渲染 MarkdownToolbar 并接入 viewRef 插入逻辑
    status: completed
    dependencies:
      - create-markdown-toolbar
  - id: typescript-build
    content: 运行 tsc 编译检查，确保无类型错误
    status: completed
    dependencies:
      - integrate-toolbar
---

## 产品概述

为文本编辑器增加 Markdown 格式化工具栏插件。当当前编辑器语言为 `markdown` 时，在 CodeMirror 编辑器顶部显示一条轻量级工具栏，用户点击按钮即可在光标处插入对应的 Markdown 语法。

## 核心功能

- **条件显示**：仅当 `language === 'markdown'` 时显示工具栏，不区分文件后缀
- **语法按钮**：支持 H1-H6、粗体、斜体、删除线、引用、行内代码、代码块、链接、图片、无序列表、有序列表、任务列表、表格、水平分割线
- **智能插入**：
- 有选区时：用对应 Markdown 语法包裹选区（如选中文本后点粗体插入 `**选中文本**`）
- 无选区时：插入占位符文本，并将光标定位到内容区（如点链接插入 `[文本](url)`，光标停在 `文本` 处）
- **视觉风格**：与现有编辑器主题一致，使用 CSS 变量适配亮/暗/自定义主题

## Tech Stack

- 前端框架：React + TypeScript（与项目一致）
- 样式：Tailwind CSS + CSS 变量主题（与项目一致）
- 编辑器：CodeMirror 6
- 图标：lucide-react（与项目一致）

## Implementation Approach

在 `CmEditor.tsx` 的 render 结构中，于 editor container 上方条件渲染 `MarkdownToolbar` 组件。工具栏接收一个 `onAction` 回调，CmEditor 内部通过 `viewRef.current.dispatch` 执行文本插入/替换。

每个按钮对应一个 `MarkdownAction` 定义，包含：

- `label` / `icon`：UI 展示
- `wrap`：是否包裹选区
- `insert`：无选区时的插入文本
- `placeholderRanges`：占位符文本在插入后的选中范围，用于定位光标

CodeMirror 6 插入通过 `view.dispatch({ changes: { from, to, insert }, selection: ... })` 完成。

### Architecture

```
CmEditor (language === 'markdown')
  ├── MarkdownToolbar (onAction)
  └── EditorView container
        └── viewRef.dispatch(changes + selection)
```

### 设计决策

- 工具栏作为 CmEditor 的子组件而非全局 Toolbar，因为它与编辑器实例强相关
- 不将 `viewRef` 直接透传给子组件，而是通过 `onAction` 回调由父组件统一操作，保持封装
- 按钮分组用竖线分隔（标题 / 格式 / 插入 / 列表 / 其他），与现有 Toolbar 风格一致

## Design Style

采用与现有编辑器一致的极简工具栏风格。工具栏高度 36px，紧贴在 CodeMirror 编辑区上方，与全局 Toolbar（文件操作栏）形成层级区分。按钮为纯图标 + tooltip 形式，紧凑排列，减少视觉噪音。

## 页面规划

仅涉及 CmEditor 内部新增一行工具栏区域，无独立页面。

## 单页块设计

- **工具栏容器**：flex 横排，左对齐，高度 36px，底部分割线，背景使用 `var(--te-bg-secondary)`
- **按钮组**：按功能分组（标题 / 文本格式 / 插入 / 列表 / 分割线），组间用竖线分隔
- **图标按钮**：16px 图标，hover 时 `bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]`，active 时 `scale-95`
- **Tooltip**：原生 `title` 属性，显示按钮名称和快捷键（如有）