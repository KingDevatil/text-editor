# Text Editor V2

一款基于 **Tauri 2 + React 19 + CodeMirror 6** 构建的桌面文本编辑器，面向日常文本编辑、代码阅读、Markdown/HTML 预览、文件对比和多编码文件处理。

> 当前主线仍使用 Tauri。项目已整理 Electron 迁移计划，后续迁移工作请参考 [Electron 迁移计划](./docs/electron-migration-plan.md)。

## 核心特性

### 编辑体验

- **CodeMirror 6 内核**：轻量、响应快，支持大文件编辑场景。
- **30+ 语言高亮**：JavaScript、TypeScript、HTML、CSS、JSON、Python、Java、C/C++、C#、Rust、Go、Markdown、YAML、XML、SQL、Shell、INI、Log、Vue、Svelte、Kotlin、Swift、Ruby、PHP、Lua 等。
- **多光标编辑**：支持 `Ctrl+D` 选中下一个匹配项，`Ctrl+Shift+L` 选中所有匹配项。
- **查找替换**：支持大小写敏感、正则搜索、可视化正则构建器、循环搜索和全部替换。
- **代码辅助**：支持格式化、同文件符号跳转、代码折叠、括号/HTML 标签匹配、悬浮提示、自动补全和签名提示。
- **Minimap 缩略图**：提供整体代码概览，并支持点击快速跳转。

### 文件与编码

- **多编码读写**：支持 UTF-8、UTF-8 BOM、UTF-16、ANSI、GBK、GB2312、GB18030、Big5、Shift-JIS、EUC-JP、EUC-KR、ISO-8859 系列、Windows-125x、KOI8、Macintosh、IBM866 等。
- **自动编码检测**：基于 chardetng 自动识别文件编码。
- **原子保存**：先写入临时文件再重命名，降低保存过程中断造成文件损坏的风险。
- **外部修改检测**：已打开文件被外部程序修改时自动提示重新加载。
- **拖拽打开**：支持从系统文件管理器拖入文件。
- **目录侧边栏**：支持打开文件夹、浏览目录树并快速打开文件。

### 预览与界面

- **分屏编辑**：左右双栏独立编辑，方便对照和复制。
- **Markdown / HTML 预览与阅读模式**：支持实时预览和默认、较宽、全宽三种阅读宽度。
- **Diff 文件对比**：基于 CodeMirror Merge 高亮文件差异。
- **命令面板**：通过 `F1` 快速搜索并执行命令。
- **主题系统**：内置 Light / Dark / Custom 三种主题模式，支持 22 项颜色配置和主题 JSON 导入导出。

### 系统集成

- **跨平台桌面应用**：当前支持 Windows NSIS 安装包和 macOS DMG 安装包。
- **Windows 文件关联**：可注册为多种文本文件的默认打开方式。
- **单实例模式**：应用已运行时再次打开文件，会聚焦现有窗口并打开目标文件。
- **系统文件管理器定位**：支持在文件夹中显示当前文件。

## 截图

<img width="1920" height="1040" alt="Text Editor screenshot" src="https://github.com/user-attachments/assets/d64434fb-43b4-4416-933a-0bb16172d000" />
<img width="1920" height="1040" alt="Text Editor screenshot" src="https://github.com/user-attachments/assets/1a27d0dd-25ce-43e1-8736-ec5151d85657" />
<img width="1920" height="1040" alt="Text Editor screenshot" src="https://github.com/user-attachments/assets/d627686d-3902-4ec5-b465-c9c79cdd4059" />

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install)
- Windows 构建需要 WebView2 运行时；macOS 构建需要 Xcode Command Line Tools。

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri-dev
```

### 构建生产版本

```bash
npm run tauri-build
```

常见产物路径：

| 平台 | 产物 |
| --- | --- |
| Windows | `src-tauri/target/release/bundle/nsis/Text Editor_1.1.0_x64-setup.exe` |
| macOS | `src-tauri/target/release/bundle/dmg/Text Editor_1.1.0_x64.dmg` |

> macOS 应用需要在 macOS 系统上构建。若要分发给其他用户，建议配置 Apple Developer 签名和公证。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run tauri-dev` | 启动 Tauri 桌面开发模式 |
| `npm run build` | 构建前端资源 |
| `npm run tauri-build` | 构建桌面安装包 |
| `npm run test` | 运行测试 |
| `npm run lint` | 运行 ESLint |

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + N` | 新建文件 |
| `Ctrl + O` | 打开文件 |
| `Ctrl + S` | 保存文件 |
| `Ctrl + W` | 关闭当前标签 |
| `Ctrl + F` | 查找 |
| `Ctrl + H` | 替换 |
| `Ctrl + D` | 选中下一个匹配项 |
| `Ctrl + Shift + L` | 选中所有匹配项 |
| `Shift + Alt + F` | 格式化文档 |
| `F1` | 命令面板 |
| `F12` | 转到定义 |
| `Ctrl + Shift + V` | Markdown / HTML 阅读模式 |
| `Ctrl + 1 ~ 6` | Markdown 标题 1~6 |
| `Ctrl + B` | Markdown 粗体 |
| `Ctrl + I` | Markdown 斜体 |
| `Ctrl + U` | Markdown 删除线 |
| `Ctrl + K` | Markdown 链接 |
| <code>Ctrl + \`</code> | Markdown 行内代码 |
| `F11` | 切换全屏 |
| 鼠标拖拽标签 | 同组内排序或跨组移动 |

## 项目结构

```text
text-editor-v2/
├── src/                    # React 前端源码
│   ├── components/         # UI 组件
│   ├── hooks/              # 状态、文件、会话相关 Hooks
│   ├── services/           # 前端服务封装
│   ├── utils/              # 编辑器、主题、解析和命令工具
│   ├── App.tsx             # 应用主组件
│   └── types.ts            # 公共类型定义
├── src-tauri/              # Tauri / Rust 桌面能力
│   ├── src/lib.rs          # 文件读写、窗口控制、文件监听等命令
│   ├── src/search.rs       # 目录搜索
│   ├── src/encoding.rs     # 编码识别和转换
│   └── tauri.conf.json     # Tauri 打包配置
├── docs/                   # 项目文档
├── .github/workflows/      # GitHub Actions
└── package.json
```

## Electron 迁移状态

迁移目标不是重写编辑器，而是保留现有 React/CodeMirror 前端，将 Tauri/Rust 提供的桌面能力迁移到 Electron 主进程、preload 和 IPC。详细阶段、风险和验收标准见 [docs/electron-migration-plan.md](./docs/electron-migration-plan.md)。

## 自动打包

项目已配置 GitHub Actions，推送 `v*` 标签时可自动构建并发布 Release。

```bash
git tag v1.1.0
git push origin v1.1.0
```

也可以在 GitHub Actions 页面手动触发 Release workflow。

## 许可证

当前仓库 README 保留 MIT License 说明；如果需要正式开源分发，请确认仓库根目录存在对应的 `LICENSE` 文件。

## 致谢

项目图标 Designed by Freepik，来自 [www.freepik.com](https://www.freepik.com)。
