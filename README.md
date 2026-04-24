# 文本编辑器

一款基于 Tauri + React + Monaco Editor 的跨平台文本编辑器，支持多标签页、语法高亮、Markdown 实时预览、多编码读写等功能。目前以浏览器模式运行，桌面端功能待编译环境就绪后启用。

## 功能特性

### 编辑核心
- **多标签页管理**：新建、打开、关闭标签页，未保存内容带有修改标记
- **多格式支持**：txt、md、js、ts、html、css、json、python、java、cpp、c、csharp、rust、go、yaml、xml、sql、ini、log、csv、env、shell 等 40 余种格式
- **语法高亮**：基于 Monaco Editor 原生高亮，额外为 log 文件定制了 INFO / WARN / ERROR / DEBUG 关键字与日期时间着色
- **语言模式切换**：底部状态栏可直接切换当前文件的语法解析模式，无需重建编辑器
- **代码格式化**：支持 JSON、XML、HTML、CSS、JavaScript、TypeScript、Markdown、SQL、YAML、INI 等格式的文档格式化
- **JSON 批量格式化**：右键菜单可对选中的多行 JSON 进行批量格式化，自动保留日志前缀等非 JSON 内容

### Markdown 预览
- **实时分屏预览**：Markdown 文件可开启左右分屏，左侧编辑、右侧实时渲染
- **GFM 支持**：通过 react-markdown + remark-gfm 支持表格、删除线、任务列表等 GitHub 风格语法
- **主题自适应**：预览区域随编辑器主题自动切换亮色 / 暗色 / 高对比样式

### 主题与界面
- **三种主题循环切换**：亮色、暗色、高对比主题一键切换，工具栏按钮显示即将切换的目标主题图标
- **侧边栏**：可展开/收起，内含文件列表与设置项
- **查找替换**：支持文本查找与替换面板

### 设置选项
- **字体大小调节**：侧边栏设置中提供 10 ~ 24px 的滑块调节
- **Unicode 高亮**：可选是否高亮显示歧义字符

### 文件操作
- **新建 / 打开 / 保存**：支持系统文件选择器与拖拽打开文件
- **编码支持**：状态栏可选择 UTF-8、GBK、BIG5、Shift-JIS 等编码（前端 UI 已就绪，多编码读写需桌面端后端支持）

### 键盘快捷键
- Ctrl + N：新建文件
- Ctrl + O：打开文件
- Ctrl + S：保存文件
- Ctrl + F：查找替换
- Shift + Alt + F：格式化文档

## 技术栈

- **前端框架**：React 19 + TypeScript + Vite
- **桌面框架**：Tauri v2（Rust 后端）
- **代码编辑器**：Monaco Editor
- **样式**：Tailwind CSS v3
- **Markdown 渲染**：react-markdown + remark-gfm
- **状态管理**：Zustand

## 使用说明

### 开发环境运行

确保已安装 Node.js（建议 v20+）。在项目根目录执行：

```bash
npm install
npm run dev
```

浏览器将自动打开 `http://localhost:1420`，即可开始使用编辑器。

### 构建生产版本

执行以下命令打包前端静态资源：

```bash
npm run build
```

构建产物输出至 `dist/` 目录。

### 桌面端编译

当前 Rust 后端已包含多编码文件读写命令（基于 encoding_rs 库），但受限于当前环境缺少 Visual Studio Build Tools（`link.exe`），Tauri 桌面端暂无法编译。

如需启用桌面端功能，请在 Windows 上安装 **Visual Studio Build Tools**（勾选 C++ 桌面开发工作负载），然后执行：

```bash
npm run tauri dev    # 开发模式
npm run tauri build  # 打包桌面应用
```

## 已知限制

- 浏览器环境下文件读写使用浏览器 File API，编码切换功能仅在 UTF-8 下可用；完整的多编码支持需等待 Tauri 桌面端编译环境就绪
- Tauri 桌面端编译需要本地安装 Visual Studio Build Tools with C++ workload
