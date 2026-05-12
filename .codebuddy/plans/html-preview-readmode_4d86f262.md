---
name: html-preview-readmode
overview: 为 HTML 文件添加与 Markdown 同等的预览模式（分屏实时预览）和阅读模式（全屏覆盖层），复用现有架构，通过 iframe 实现安全隔离渲染。
design:
  architecture:
    framework: react
  styleKeywords:
    - Minimalism
    - Dark Mode
  fontSystem:
    fontFamily: Inter
    heading:
      size: 16px
      weight: 500
    subheading:
      size: 14px
      weight: 400
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#3B82F6"
    background:
      - "#1E1E1E"
      - "#FFFFFF"
    text:
      - "#D4D4D4"
      - "#1F2937"
    functional:
      - "#10B981"
      - "#EF4444"
todos:
  - id: create-html-preview
    content: 创建 HtmlPreview.tsx 组件，基于 MarkdownPreview 架构，使用 iframe sandbox + srcDoc 渲染 HTML
    status: completed
  - id: create-html-reader
    content: 创建 HtmlReader.tsx 组件，基于 MarkdownReader 架构，全屏 iframe 覆盖层，保留 ESC 退出和主题切换
    status: completed
  - id: integrate-app
    content: 修改 App.tsx，扩展预览/阅读条件支持 html，增加 HtmlPreview/HtmlReader 渲染分支
    status: completed
    dependencies:
      - create-html-preview
      - create-html-reader
  - id: update-toolbar
    content: 修改 Toolbar.tsx，更新预览/阅读按钮文案，去除 Markdown 限定词
    status: completed
    dependencies:
      - integrate-app
---

## 产品概述

在现有桌面文本编辑器中，为 HTML 文件新增与 Markdown 同等级别的预览和阅读模式支持。

## 核心功能

- **HTML 实时预览**：分屏右侧实时渲染当前 HTML 文件，与编辑器内容同步
- **HTML 阅读模式**：全屏覆盖层渲染 HTML，支持 ESC 退出、主题切换
- **安全隔离渲染**：使用 iframe sandbox 隔离 HTML 脚本与样式，避免污染编辑器全局状态
- **工具栏统一入口**：预览/阅读按钮对 Markdown 和 HTML 同时可用，标签自动适配

## Tech Stack Selection

- 前端框架：React 19 + TypeScript（沿用现有）
- 样式方案：Tailwind CSS 3 + CSS 变量主题系统（沿用现有）
- 状态管理：Zustand（沿用现有）
- 渲染隔离：原生 iframe + sandbox + srcDoc（无额外依赖）

## Implementation Approach

### 总体策略

复用现有 Markdown 预览/阅读模式的全部 UI 框架与状态流转机制，仅替换内容渲染层。HTML 文件无需 marked 转换，直接通过 iframe 注入。新增两个组件 `HtmlPreview` 和 `HtmlReader`，在 App.tsx 中根据当前标签页的 `language` 字段分发到对应组件。

### 关键设计决策

1. **iframe 隔离而非 dangerouslySetInnerHTML**：HTML 中可能包含 `<script>`、`<style>` 及全局样式规则。若像 Markdown 一样直接插入 DOM，会污染编辑器主题、干扰事件捕获。使用 `<iframe sandbox="allow-scripts" srcDoc={html}>` 可将用户 HTML 完全隔离在独立 browsing context 中，同时保留脚本执行能力。
2. **暂不处理相对路径资源**：`srcDoc` 的 base URL 继承自父页面，因此 HTML 中的 `./style.css` 或 `./img.png` 无法直接解析。基础版本先提供纯 HTML 内容预览；相对路径资源加载可作为后续增强（需引入 Service Worker 或临时文件写入方案），避免首次迭代过度膨胀。
3. **主题透传**：通过 iframe 的 `style={{ backgroundColor: 'var(--te-bg-primary)' }}` 统一背景，使预览区域外观与编辑器当前主题一致。

### 性能考量

- 沿用现有 `requestAnimationFrame` 轮询机制获取编辑器内容，开销已验证极低
- iframe 重新渲染仅在内容变化时触发，通过 `useDeferredValue` 避免阻塞主线程
- 无新增依赖，不增加包体积

## Implementation Notes

- **Grounded 复用**：`HtmlPreview` 直接复制 `MarkdownPreview` 的轮询、右键菜单、主题变量注入模式；`HtmlReader` 复制 `MarkdownReader` 的覆盖层、ESC 快捷键、主题切换 toolbar 模式，去除 Markdown 特有的 TOC 和字号调节功能。
- **Blast radius 控制**：仅修改预览条件判断和条件渲染分支，编辑器核心（CmEditor、文件读写、状态管理）零改动。
- **Toolbar 文案更新**：将 "Markdown 预览" / "Markdown 阅读模式" 等硬编码文案改为 "预览" / "阅读模式"，因为按钮现已对多语言类型可用。

## Architecture Design

无需新增架构层或数据流变更。改动集中在表现层（Presentation Layer）：

```
App.tsx (条件扩展)
├── 判断 canPreview / canReadMode：language ∈ {markdown, html}
└── 条件渲染分发：
    ├── previewVisible + markdown → MarkdownPreview
    ├── previewVisible + html     → HtmlPreview（NEW）
    ├── readMode + markdown       → MarkdownReader
    └── readMode + html           → HtmlReader（NEW）
```

## Directory Structure

```
src/
├── components/
│   ├── HtmlPreview.tsx      # [NEW] HTML 分屏预览组件。基于 MarkdownPreview 架构，轮询获取编辑器内容，通过 iframe sandbox + srcDoc 渲染。支持右键菜单、主题背景同步。
│   └── HtmlReader.tsx       # [NEW] HTML 全屏阅读模式组件。基于 MarkdownReader 架构，覆盖层渲染 iframe，含顶部 toolbar（ESC 退出、主题切换），去除 Markdown 特有的目录/字号功能。
├── App.tsx                  # [MODIFY] 扩展 canPreview/canReadMode 条件包含 html；预览区域和阅读模式区域的条件渲染增加 HtmlPreview/HtmlReader 分支。
└── components/
    └── Toolbar.tsx          # [MODIFY] 更新预览/阅读按钮的 title 文案，去除 "Markdown" 限定词，使其对 html 同样语义正确。
```

本次不涉及新的 UI 设计，仅复用现有 Markdown 预览/阅读模式的视觉框架。HtmlPreview 和 HtmlReader 的外观布局与对应 Markdown 组件保持一致，背景色、边框、toolbar 样式均继承现有 CSS 变量主题系统。