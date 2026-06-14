# Text Editor V2

基于 **Electron + React 19 + CodeMirror 6** 的桌面文本编辑器，面向日常文本编辑、代码阅读、Markdown/HTML 预览、文件对比和多编码文件处理。

## 功能概览

- CodeMirror 6 编辑内核，支持大文件场景和 30+ 常见语言高亮。
- 多标签、分屏编辑、Diff 对比、命令面板、查找替换和文件夹搜索。
- Markdown/HTML 实时预览与阅读模式。
- UTF-8、UTF-8 BOM、UTF-16、GBK、GB18030、Big5、Shift-JIS 等编码读写。
- Electron 桌面能力：文件打开/保存、目录树、文件监听、拖拽打开、单实例、文件关联、剪贴板、系统文件管理器定位。
- Windows NSIS 与 macOS DMG 打包配置。

## 环境要求

- Node.js 20+
- Windows、macOS 或 Linux 桌面环境
- macOS 打包需要 Xcode Command Line Tools

## 安装

```bash
npm install
```

## 开发

启动 Vite 前端开发服务：

```bash
npm run dev
```

启动 Electron 桌面开发模式：

```bash
npm run electron-dev
```

## 构建

构建前端资源：

```bash
npm run build
```

构建 Electron 安装包：

```bash
npm run electron-build
```

常见产物路径：

| 平台 | 产物 |
| --- | --- |
| Windows | `release/*.exe` |
| macOS | `release/*.dmg` |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务 |
| `npm run electron-dev` | 启动 Electron 桌面开发模式 |
| `npm run build` | 构建前端资源 |
| `npm run electron-build` | 构建 Electron 安装包 |
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
| `Ctrl + Shift + F` | 文件夹搜索 |
| `Shift + Alt + F` | 格式化文档 |
| `F1` | 命令面板 |
| `F12` | 转到定义 |
| `Ctrl + Shift + V` | Markdown / HTML 阅读模式 |

## 项目结构

```text
text-editor-v2/
├── electron/                # Electron main/preload/IPC services
├── build/icons/             # Electron build resources
├── src/                     # React renderer source
│   ├── components/          # UI components
│   ├── hooks/               # state, editor, file and session hooks
│   ├── platform/            # renderer desktop API abstraction
│   ├── services/            # renderer services
│   ├── utils/               # editor, theme and parser utilities
│   ├── App.tsx
│   └── types.ts
├── docs/
├── .github/workflows/
└── package.json
```

## 发布

项目使用 GitHub Actions Release workflow 构建 Electron 产物。推送 `v*` tag 或在 Actions 页面手动触发即可生成 Windows/macOS artifacts，并上传到对应 GitHub Release。

```bash
git tag v1.1.0
git push origin v1.1.0
```

## 迁移记录

Electron 迁移计划和完成状态见 [docs/electron-migration-plan.md](./docs/electron-migration-plan.md) 与 [plan.md](./plan.md)。
