# 文本编辑器

一款基于 Tauri v2 + React 19 + Monaco Editor 的跨平台文本编辑器，支持多标签页、语法高亮、Markdown 实时预览、分屏编辑、多编码读写、项目文件夹浏览等功能。

> **构建状态**：✅ 已验证可在 Windows 11 + Tauri v2 环境下成功打包（NSIS 安装程序）

## 功能特性

### 编辑核心
- **多标签页管理**：新建、打开、关闭标签页，未保存内容带有修改标记（蓝色圆点）
- **未保存确认**：关闭已修改的标签页、批量关闭、退出应用时均有二次确认
- **分屏编辑**：支持左右分屏，可将标签页拖拽到另一侧分屏组
- **多格式支持**：txt、md、js、ts、html、css、json、python、java、cpp、c、csharp、rust、go、yaml、xml、sql、ini、log、csv、env、shell 等 40 余种格式
- **语法高亮**：基于 Monaco Editor 原生高亮，额外为 log 文件定制了 INFO / WARN / ERROR / DEBUG 关键字与日期时间着色
- **语言模式切换**：底部状态栏可直接切换当前文件的语法解析模式
- **代码格式化**：支持 JSON、XML、HTML、CSS、JavaScript、TypeScript、Markdown、SQL、YAML、INI 等格式的文档格式化
- **JSON 批量格式化**：右键菜单可对选中的多行 JSON 进行批量格式化，自动保留日志前缀等非 JSON 内容
- **中文右键菜单**：Monaco Editor 右键菜单已汉化
- **自动标题**：新建 "Untitled" 文档在输入内容后，自动以第一行文字作为临时标题

### 编码支持
- **多编码读写**：UTF-8、UTF-8 BOM、ANSI(Windows-1252)、GBK、GB2312、GB18030、BIG5、Shift-JIS、EUC-KR、ISO-8859-1
- **自动编码检测**：打开文件时自动检测编码（基于 Mozilla chardetng 算法），状态栏实时显示当前编码
- **编码切换**：已打开的文件可直接在状态栏切换编码重新读取

### 项目文件夹
- **侧边栏文件树**：打开项目文件夹后，左侧显示可折叠的文件树，支持懒加载子目录
- **文件浏览**：自动排除 node_modules、.git、target、dist 等目录
- **已打开文件高亮**：文件树中高亮当前已打开的文件
- **文件夹操作**：支持打开文件夹、刷新、关闭项目

### 文件操作
- **新建 / 打开 / 保存**：支持系统文件选择器
- **拖拽打开**：直接将文件拖拽到编辑器窗口即可打开
- **打开文件夹**：通过工具栏或侧边栏打开项目文件夹

### Markdown 预览
- **实时分屏预览**：Markdown 文件可开启左右分屏，左侧编辑、右侧实时渲染
- **GFM 支持**：通过 marked 支持表格、删除线、任务列表等 GitHub 风格语法
- **主题自适应**：预览区域随编辑器主题自动切换亮色 / 暗色样式

### 主题与界面
- **三种主题循环切换**：亮色、暗色、高对比主题一键切换
- **侧边栏**：可展开/收起，内含文件树和编辑器设置
- **查找替换**：支持文本查找与替换面板
- **字体大小调节**：侧边栏可实时调整编辑器字体大小
- **Unicode 全角半角高亮**：可选开启字符混淆检测

### 键盘快捷键
| 快捷键 | 功能 |
|--------|------|
| Ctrl + N | 新建文件 |
| Ctrl + O | 打开文件 |
| Ctrl + S | 保存文件 |
| Ctrl + F | 查找替换 |
| Shift + Alt + F | 格式化文档 |
| Escape | 关闭查找替换面板 |

## 技术栈

- **前端框架**：React 19 + TypeScript + Vite
- **桌面框架**：Tauri v2（Rust 后端）
- **代码编辑器**：Monaco Editor
- **样式**：Tailwind CSS v3
- **Markdown 渲染**：marked
- **编码检测**：chardetng（Mozilla Firefox 同款算法）
- **编码转换**：encoding_rs

## 环境要求

- **Node.js**：v20 LTS 或更高版本（推荐 v24 LTS）
- **Rust**：通过 [rustup](https://rustup.rs/) 安装
- **Tauri CLI**：随项目依赖自动安装
- **NSIS**（Windows 打包）：v3.x，`makensis.exe` 需在 PATH 中

### 平台特定依赖

| 平台 | 额外依赖 |
|------|---------|
| **Windows** | Visual Studio（勾选 **"使用 C++ 的桌面开发"**）+ NSIS v3.x |
| **macOS** | Xcode Command Line Tools（`xcode-select --install`） |
| **Linux** | 参见 [Tauri 官方文档](https://tauri.app/start/prerequisites/#linux) |

> **Windows 说明**：
> - VS 安装"使用 C++ 的桌面开发"工作负载
> - NSIS 可通过 winget 安装：`winget install NSIS.NSIS`

## 国内网络加速（推荐）

**Cargo 镜像（中科大 sparse 索引）**：
在 `%USERPROFILE%\.cargo\config.toml` 中添加：
```toml
[source.crates-io]
replace-with = 'ustc'

[source.ustc]
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"
```

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

> **注意**：浏览器环境下文件读写使用浏览器 File API，部分功能（系统文件对话框、自动编码检测、项目文件夹）受浏览器安全策略限制。

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

### Windows（NSIS 安装程序）

Tauri 打包使用 NSIS 作为安装包格式：

```bash
npm run tauri build
```

首次构建 Rust 依赖耗时较长（约 1~5 分钟，取决于网络）。

构建完成后，安装程序位于：
```
src-tauri/target/release/bundle/nsis/Text Editor_0.1.0_x64-setup.exe
```

### 输出产物

| 平台 | 产物 |
|------|------|
| **Windows** | `.exe`（NSIS 安装程序） |
| **macOS** | `.dmg`、`.app` |
| **Linux** | `.AppImage`、`.deb`、`.rpm` |

### 打包常见问题（Windows）

#### 1. `link.exe` 或 MSVC 工具找不到

**原因**：未安装 Visual Studio C++ 桌面开发工具，或终端未加载 VS 环境变量。

**解决方案**：
```powershell
# 先加载 VS 环境变量，再执行打包
cmd /c '"C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" && npm run tauri build'
```

#### 2. NSIS 下载超时

**原因**：Tauri 需要从 GitHub 下载 NSIS 工具包，国内网络可能超时。

**解决方案**：手动下载 `nsis-3.11.zip` 放到缓存目录：
```powershell
# 下载地址：https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip
# 解压到：%LOCALAPPDATA%\tauri\NSIS\nsis-3.11\
```

#### 3. 首次构建耗时较长

首次构建需要下载编译 Rust 依赖，耗时约 **3~10 分钟**。建议配置国内 Cargo 镜像加速。

## 应用图标

应用图标位于 `src-tauri/icons/` 目录。如需更换图标：
```bash
npx tauri icon /path/to/source-icon.png
```

## 配置

可通过 `src-tauri/tauri.conf.json` 修改：
- 应用名称、版本、窗口大小
- 应用标识符（bundle identifier）
- 安全策略（CSP）
- 打包目标平台

## 已知限制

- 浏览器环境下部分功能受限（文件对话框、自动编码检测、项目文件夹浏览）
- 完整功能需使用桌面端版本
- ANSI 编码映射为 Windows-1252，中文 Windows 系统的 ANSI 文件建议手动切换为 GBK
