# 文本编辑器

一款基于 Tauri + React + Monaco Editor 的跨平台文本编辑器，支持多标签页、语法高亮、Markdown 实时预览、分屏编辑、多编码读写等功能。

## 功能特性

### 编辑核心
- **多标签页管理**：新建、打开、关闭标签页，未保存内容带有修改标记
- **右键标签菜单**：关闭当前 / 关闭其他 / 关闭左侧 / 关闭右侧（均作用于当前分屏组）
- **分屏编辑**：支持左右分屏，可将标签页拖拽到另一侧分屏组
- **多格式支持**：txt、md、js、ts、html、css、json、python、java、cpp、c、csharp、rust、go、yaml、xml、sql、ini、log、csv、env、shell 等 40 余种格式
- **语法高亮**：基于 Monaco Editor 原生高亮，额外为 log 文件定制了 INFO / WARN / ERROR / DEBUG 关键字与日期时间着色
- **语言模式切换**：底部状态栏可直接切换当前文件的语法解析模式
- **代码格式化**：支持 JSON、XML、HTML、CSS、JavaScript、TypeScript、Markdown、SQL、YAML、INI 等格式的文档格式化
- **JSON 批量格式化**：右键菜单可对选中的多行 JSON 进行批量格式化，自动保留日志前缀等非 JSON 内容
- **自动标题**：新建 "Untitled" 文档在输入内容后，自动以第一行文字作为临时标题

### Markdown 预览
- **实时分屏预览**：Markdown 文件可开启左右分屏，左侧编辑、右侧实时渲染
- **GFM 支持**：通过 react-markdown + remark-gfm 支持表格、删除线、任务列表等 GitHub 风格语法
- **主题自适应**：预览区域随编辑器主题自动切换亮色 / 暗色 / 高对比样式

### 主题与界面
- **三种主题循环切换**：亮色、暗色、高对比主题一键切换
- **侧边栏**：可展开/收起，内含字体大小与 Unicode 高亮设置
- **查找替换**：支持文本查找与替换面板

### 文件操作
- **新建 / 打开 / 保存**：支持系统文件选择器与拖拽打开文件
- **编码支持**：状态栏可选择 UTF-8、UTF-8 BOM、GBK、GB2312、BIG5、Shift-JIS、EUC-KR、Windows-1252、ISO-8859-1 等编码

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

## 环境要求

- **Node.js**：v20 LTS 或更高版本（推荐 v24 LTS）
- **Rust**：通过 [rustup](https://rustup.rs/) 安装

### 平台特定依赖

| 平台 | 额外依赖 |
|------|---------|
| **Windows** | [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/?q=build+tools)（勾选 **"使用 C++ 的桌面开发"**） |
| **macOS** | Xcode Command Line Tools（`xcode-select --install`） |
| **Linux** | 参见 [Tauri 官方文档](https://tauri.app/start/prerequisites/#linux) |

> Windows 可通过 winget 一键安装 VS Build Tools：
> ```powershell
> winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
> ```

## 开发

### 安装依赖

```bash
npm install
```

### 浏览器开发模式

```bash
npm run dev
```

浏览器将自动打开 `http://localhost:1420`。

### 桌面端开发模式

```bash
npm run tauri dev
```

### 构建前端静态资源

```bash
npm run build
```

构建产物输出至 `dist/` 目录。

## 打包桌面应用

打包命令会根据当前平台生成对应的安装包。

```bash
npm run tauri build
```

### 输出产物

构建完成后，安装包位于 `src-tauri/target/release/bundle/` 目录：

| 平台 | 产物 |
|------|------|
| **Windows** | `.exe`（安装程序）、`.msi`、`.zip`（便携版） |
| **macOS** | `.dmg`、`.app` |
| **Linux** | `.AppImage`、`.deb`、`.rpm` |

### 打包注意事项

- 首次构建需要下载编译 Rust 依赖，耗时约 5~15 分钟，取决于网络环境
- 构建前会自动执行 `npm run build` 生成前端资源
- 可通过 `src-tauri/tauri.conf.json` 修改应用名称、版本、窗口大小等配置

## 已知限制

- 浏览器环境下文件读写使用浏览器 File API，部分功能受浏览器安全策略限制
- 完整的多编码文件读写、系统级文件打开/保存需使用桌面端版本
