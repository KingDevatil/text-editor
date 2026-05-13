# Text Editor V2

一款基于 **Tauri + React + CodeMirror 6** 构建的高性能桌面文本编辑器，支持多种编程语言高亮、分屏编辑、Markdown 预览、文件对比等丰富功能。

可直接前往release下载Windows和Macos版安装包，离线且缺少webview2环境的Windows请下载full全量安装包

---
<img width="1920" height="1040" alt="image" src="https://github.com/user-attachments/assets/d64434fb-43b4-4416-933a-0bb16172d000" />
<img width="1920" height="1040" alt="image" src="https://github.com/user-attachments/assets/1a27d0dd-25ce-43e1-8736-ec5151d85657" />
<img width="1920" height="1040" alt="image" src="https://github.com/user-attachments/assets/d627686d-3902-4ec5-b465-c9c79cdd4059" />


## ✨ 核心特性

### 编辑器
- **CodeMirror 6 内核**：轻量、极速启动，支持超大文件流畅编辑
- **30+ 语言高亮**：JavaScript、TypeScript、HTML、CSS、JSON、Python、Java、C/C++、C#、Rust、Go、Markdown、YAML、XML、SQL、Shell、INI、Log、Vue、Svelte、Kotlin、Swift、Ruby、PHP、Lua 等
- **多光标编辑**：支持 `Ctrl+D` 选中下一个匹配项、`Ctrl+Shift+L` 选中所有匹配项
- **查找替换**：支持大小写敏感、**正则表达式可视化构建**、循环搜索、全部替换
- **代码格式化**：支持 JSON、XML、HTML、CSS、JavaScript、TypeScript、SQL
- **转到定义**：同文件内符号跳转（`F12`）
- **大文件优化**：自动关闭折叠、括号匹配等重扩展，保障大文件流畅度
- **智能悬浮提示**：鼠标悬停显示 token 类型，**悬停十六进制颜色值时显示实时颜色预览**
- **缩进引导线**：直观显示代码缩进层级

### 主题系统
- **Light / Dark / Custom 三主题**：一键循环切换
- **22 项可配置颜色**：背景、文字、边框、光标、选中高亮、同字符匹配、标签页、滚动条等全部可自定义
- **实时生效**：在主题编辑器面板中调整颜色，编辑器即时响应
- **导入/导出 JSON**：保存和分享你的专属配色方案

### 界面与交互
- **分屏编辑**：左右双栏独立编辑，方便对照与复制（需至少 2 个标签页）
- **Markdown 预览/阅读模式**：实时预览渲染效果，专注阅读体验
- **文件对比（Diff）**：基于 CodeMirror Merge，高亮差异
- **命令面板（F1）**：快速搜索执行所有命令
- **侧边栏文件树**：浏览项目目录，快速打开文件
- **代码缩略图（Minimap）**：整体代码概览，支持点击跳转
- **自定义右键菜单**：预览和阅读模式接入统一的主题化右键菜单
- **自定义字体大小、自动换行、空白字符显示**

### 文件与编码
- **拖拽打开文件**：支持从系统拖入文件直接编辑
- **多编码支持**：UTF-8、UTF-8 BOM、ANSI、GBK、GB2312、GB18030、BIG5、Shift-JIS、EUC-JP、EUC-KR、ISO-8859-1~9、Windows-1250~1258、KOI8-R、KOI8-U、Macintosh、IBM866 等
- **编码自动检测**：基于 chardetng（Firefox 算法）智能识别文件编码
- **原子写入保存**：先写临时文件再重命名，避免写入中断导致文件损坏
- **未保存更改提醒**：关闭窗口前提示保存

### 系统集成
- **跨平台支持**：Windows（NSIS 安装包）、macOS（DMG 安装包）
- **Windows 文件关联**：可将本编辑器注册为多种文本文件的默认打开方式
- **单实例模式**：已运行时再次打开文件会聚焦到现有窗口
- **系统文件管理器 reveal**：在文件夹中显示当前文件

---

## 🚀 快速开始

### 环境要求
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install)

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri-dev
```

### 构建生产版本

#### Windows

```bash
npm run tauri-build
```

构建完成后，安装包位于：

| 平台 | 路径 |
|------|------|
| Windows | `src-tauri/target/release/bundle/nsis/Text Editor_1.1.0_x64-setup.exe` |

---

#### macOS（在 Mac 上打包）

> ⚠️ **注意**：由于 Tauri 的限制，macOS 应用必须在 **macOS 系统** 上构建，无法通过 Windows/Linux 交叉编译。

##### 1. 环境准备

确保你的 Mac 已安装以下工具：

- **Node.js** 18+（推荐通过 [Homebrew](https://brew.sh/) 安装：`brew install node`）
- **Rust**（通过 [rustup](https://rustup.rs/) 安装）
- **Xcode Command Line Tools**（运行 `xcode-select --install` 安装）

验证安装：

```bash
node -v    # v18.x.x 或更高
npm -v     # 9.x.x 或更高
cargo -v   # 确认 Rust 已安装
```

##### 2. 克隆项目并安装依赖

```bash
git clone <仓库地址>
cd text-editor-v2
npm install
```

##### 3. 执行打包

```bash
npm run tauri-build
```

该命令会自动完成以下步骤：
1. 编译前端（`tsc -b && vite build`）
2. 编译 Rust 后端（Release 模式）
3. 生成 `.app` 应用包
4. 打包为 `.dmg` 镜像文件

##### 4. 获取安装包

构建完成后，产物位于：

| 类型 | 路径 |
|------|------|
| DMG 安装包 | `src-tauri/target/release/bundle/dmg/Text Editor_1.1.0_x64.dmg` |
| APP 应用包 | `src-tauri/target/release/bundle/macos/Text Editor.app` |

##### 5. 常见问题

**Q: 构建时提示 `xcrun: error: invalid active developer path`？**

A: Xcode Command Line Tools 未正确安装，执行：
```bash
xcode-select --install
# 或重新指定路径
sudo xcode-select --reset
```

**Q: 打开应用时提示「无法验证开发者」？**

A: 本地构建未签名的应用会被 Gatekeeper 拦截。可通过以下方式解决：
- **方式一**：右键点击 `.app` → 选择「打开」→ 点击「仍要打开」
- **方式二**：系统设置 → 隐私与安全性 → 安全性 → 点击「仍要打开」
- **方式三**：终端执行 `xattr -rd com.apple.quarantine "src-tauri/target/release/bundle/macos/Text Editor.app"`

**Q: 如何进行签名和公证（Notarization）？**

A: 若需分发给其他 Mac 用户，建议配置 Apple Developer 签名：

1. 在 [Apple Developer](https://developer.apple.com/) 申请 Developer ID 证书
2. 在 `src-tauri/tauri.conf.json` 的 `bundle.macOS` 中配置：
   ```json
   "macOS": {
     "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
     "notarize": true
   }
   ```
3. 或在 CI 中通过环境变量配置（见 `.github/workflows/release.yml`）

更多详情参考 [Tauri 官方签名文档](https://tauri.app/distribute/sign/macOS/)。

---

## 📦 自动打包

项目已配置 GitHub Actions，推送 `v*` 标签时自动在 macOS runner 上构建并发布 Release。

```bash
git tag v1.1.0
git push origin v1.1.0
```

也可以手动在 **Actions → Release → Run workflow** 触发。

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + N` | 新建文件 |
| `Ctrl + O` | 打开文件 |
| `Ctrl + S` | 保存文件 |
| `Ctrl + F` | 查找替换 |
| `Ctrl + D` | 选中下一个匹配项 |
| `Ctrl + Shift + L` | 选中所有匹配项 |
| `Shift + Alt + F` | 格式化文档 |
| `F1` | 命令面板 |
| `F12` | 转到定义 |
| `Ctrl + Shift + V` | Markdown 阅读模式 |
| `鼠标拖拽标签` | 同组内排序 / 跨组移动（分屏） |

---

## 📋 更新日志

### v1.1.0

**新功能**
- **可视化正则构建器**：查找替换面板新增"正则模式"，通过积木式 UI 拼装正则条件，无需手写正则语法。支持精确文本、数字、字母、空白字符、任意字符、分组、或逻辑等条件，内置邮箱、URL、IP 地址、日期、手机号等 7 个常用模板
- **十六进制颜色悬浮预览**：鼠标悬停在 `#RRGGBB` / `#RGB` / `#RGBA` 等颜色值上时，提示框中显示实时颜色方块预览
- **缩进引导线修复**：修正了制表符与空格混用时引导线位置偏移的问题，引导线现在精确对齐每个缩进层级

**改进**
- 查找替换支持正则表达式搜索（基于 CodeMirror RegExpCursor）
- 正则构建器弹窗支持主题外观自适应（Light / Dark / Custom）
- 主题系统 CSS 变量覆盖全部弹窗组件

**性能优化**
- `useEditorStore` localStorage 保存增加 300ms 防抖，避免打字时同步写盘阻塞主线程
- `MarkdownReader` 轮询从 60fps (`requestAnimationFrame`) 降至 100ms (`setTimeout`)，显著降低大文件 GC 压力
- `Minimap` 增加容器可见性检测，隐藏标签页完全停止后台渲染；无变化时从 60fps 降级为 200ms 轮询；延迟读取 `getBoundingClientRect` 避免强制同步布局
- `useFileWatcher` 路径集合不变时提前退出，消除 `markTabDirty` 导致的无意义 diff 计算
- `useFileWatcher` 新增 `onFileChanged` 回调解耦 Store 依赖，提升可测试性与复用性
- `App.tsx` 补全 `handleSaveFile` 依赖数组，消除潜在闭包不一致风险

---

## 🏗️ 技术栈

- **前端框架**：React 19 + TypeScript
- **构建工具**：Vite 8
- **编辑器内核**：CodeMirror 6
- **桌面框架**：Tauri 2
- **样式方案**：Tailwind CSS 3
- **状态管理**：Zustand

---

## 📁 项目结构

```
text-editor-v2/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   ├── hooks/              # 自定义 Hooks（状态管理、文件打开）
│   ├── utils/              # 工具函数（主题、语言扩展、命令等）
│   ├── App.tsx             # 根组件
│   └── types.ts            # TypeScript 类型定义
├── src-tauri/              # Tauri / Rust 后端
│   ├── src/lib.rs          # Rust 主逻辑（文件读写、编码检测等）
│   └── tauri.conf.json     # Tauri 配置
├── .github/workflows/      # GitHub Actions CI
├── dist/                   # 前端构建输出
└── package.json
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

[MIT License](./LICENSE)

---

## 🙏 致谢

本项目图标 **Designed by Freepik**，来自 [www.freepik.com](https://www.freepik.com)。
