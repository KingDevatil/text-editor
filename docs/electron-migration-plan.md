# Electron 迁移计划

本文档用于指导 Text Editor V2 从当前 Tauri 桌面壳迁移到 Electron。后续迁移工作应优先遵循本文档，除非实际实现中发现新的约束并同步更新此文档。

## 当前状态（2026-06-14）

- 阶段 0 已完成：已新增 `src/platform/desktop.ts`，运行时代码已通过项目自己的 `desktopApi` 访问桌面能力。
- 阶段 1 已完成基础实现：已新增 Electron `main`、`preload`、IPC 服务目录和 npm 脚本。
- 阶段 2 已完成基础实现：Node 端已实现文件读写、编码检测、元信息读取、重命名和原子保存。
- 阶段 3 已完成基础实现：Electron dialog、pending files、单实例 handoff、shell、clipboard 和窗口控制已接入。
- 阶段 4 已完成基础实现：目录读取、搜索和 watcher 已接入 Electron 服务。
- 阶段 5 已完成：已加入 `electron-builder` 基础配置、图标、file associations，并将 Release workflow 迁移到 Electron 产物。
- 阶段 6 已完成：已删除 `src-tauri/`、Tauri npm 依赖、Tauri scripts 和运行时代码中的 Tauri fallback。

验证说明：已通过 `npm run build`、`npm run test`、`npm run lint`，并完成 `NODE_ENV=production electron .`、`npx electron-builder --win --dir`、`npm run electron-build` 和打包后 Windows exe 烟测；Electron 进程启动后 8 秒仍保持运行且 stderr 为空。Windows 打包已设置 `disableAsarIntegrity: true`，用于规避 electron-builder 26 在当前环境写入 `Text Editor V2.exe` ASAR integrity 资源时出现的 `UNKNOWN open` 错误。

## 目标与边界

### 迁移目标

- 保留现有 React、TypeScript、Vite、CodeMirror 6、Zustand 和 Tailwind 前端架构。
- 用 Electron 主进程、preload 和 IPC 替代 Tauri/Rust 命令。
- 保持当前核心桌面能力等价：文件打开、保存、编码识别、目录树、搜索、文件监听、拖拽、窗口控制、文件关联、单实例和系统文件管理器定位。
- 尽量让前端业务代码感知不到底层是 Tauri 还是 Electron。

### 非目标

- 不重写编辑器内核。
- 不重做 UI 设计系统。
- 不在第一阶段引入多窗口、插件系统或云同步。
- 不为了迁移而改变现有文件格式、会话格式和用户设置格式。

## 当前架构摘要

- 前端入口：`src/main.tsx`、`src/App.tsx`。
- 构建工具：Vite，开发端口固定为 `1420`。
- 桌面壳：Tauri 2，配置位于 `src-tauri/tauri.conf.json`。
- Rust 命令集中在 `src-tauri/src/lib.rs` 和 `src-tauri/src/search.rs`。
- 前端通过 `@tauri-apps/api/core` 的 `invoke` 和 `@tauri-apps/api/event` 的 `listen` 调用桌面能力。

## 功能映射

| 当前 Tauri 能力 | 当前位置 | Electron 目标实现 |
| --- | --- | --- |
| `read_file_auto_detect` | `src-tauri/src/lib.rs` | `ipcMain.handle("file:readAuto")` + Node `fs` + 编码库 |
| `read_file_with_encoding` | `src-tauri/src/lib.rs` | `ipcMain.handle("file:readWithEncoding")` |
| `read_file_meta` | `src-tauri/src/lib.rs` | `ipcMain.handle("file:readMeta")` |
| `write_file_with_encoding` | `src-tauri/src/lib.rs` | `ipcMain.handle("file:writeWithEncoding")`，保持原子写入 |
| `rename_file` | `src-tauri/src/lib.rs` | `ipcMain.handle("file:rename")` |
| `list_directory` | `src-tauri/src/lib.rs` | `ipcMain.handle("dir:list")` |
| `search_directory` | `src-tauri/src/search.rs` | `ipcMain.handle("search:directory")` 或 worker 线程 |
| `watch_file` / `unwatch_file` | `src-tauri/src/lib.rs` | `chokidar` 或 `fs.watch` 管理器 |
| `file-changed` 事件 | Tauri event | `webContents.send("file:changed")` |
| `get_pending_files` / `open-file` | Tauri single instance | `app.requestSingleInstanceLock()` + pending queue |
| Dialog | `@tauri-apps/plugin-dialog` | Electron `dialog` |
| Clipboard | `@tauri-apps/plugin-clipboard-manager` | Electron `clipboard` 或浏览器 Clipboard API |
| Open URL | `@tauri-apps/plugin-opener` | Electron `shell.openExternal` |
| Reveal in folder | Rust command | Electron `shell.showItemInFolder` |
| Window minimize/maximize/close | Rust command + Tauri Window API | `BrowserWindow` 方法 |
| 无边框窗口拖拽 | `data-tauri-drag-region` | CSS `app-region: drag` / `no-drag` |
| Windows 文件关联 | Tauri bundle + registry command | `electron-builder` fileAssociations + 必要时保留注册表辅助 |

## 推荐迁移策略

采用“先抽象、再替换、最后清理”的分阶段迁移。不要一开始就删除 Tauri 代码，否则会失去功能对照基准。

### 阶段 0：迁移准备

- 新增桌面能力抽象层，例如 `src/platform/desktop.ts`。
- 将前端分散的 Tauri 调用逐步收口到该抽象层。
- 保留 Tauri 实现作为默认 backend。
- 为核心抽象补测试或 mock，避免后续改 Electron 时大面积更新组件测试。

验收标准：

- 前端不再直接在业务组件中大量导入 `@tauri-apps/*`。
- 文件打开、保存、目录树、搜索、窗口控制在 Tauri 下行为不变。
- `npm run test` 通过。

### 阶段 1：Electron 基础壳

- 增加 Electron 相关目录，建议使用：
  - `electron/main.ts`
  - `electron/preload.ts`
  - `electron/ipc/`
  - `electron/services/`
- 引入 `electron`、`electron-builder` 或 `electron-vite`。
- 配置开发模式加载 `http://localhost:1420`，生产模式加载 `dist/index.html`。
- 默认启用安全配置：
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`，若第三方能力不兼容再单点放宽
  - preload 只暴露白名单 API

验收标准：

- Electron 窗口能启动并显示现有前端。
- 无边框窗口、标题栏、最小化、最大化、关闭可用。
- 开发模式和生产构建入口清晰。

### 阶段 2：文件系统与编码

- 将 Rust 编码逻辑迁到 Node。
- 推荐优先评估以下库：
  - `iconv-lite`：常见编码解码和编码。
  - `jschardet`、`chardet` 或同类库：编码检测。
- 明确保留以下行为：
  - UTF-8 BOM、UTF-16 LE/BE BOM 优先识别。
  - GBK/GB18030/Big5/Shift-JIS 等中文和东亚编码可正常读写。
  - 大文件先读取头部元信息和首批内容，再后台完整加载。
  - 保存时先写临时文件，再 rename 到目标路径。
  - Windows 文件占用时返回用户可读错误。

验收标准：

- 打开 UTF-8、UTF-8 BOM、UTF-16、GBK、GB18030、Big5 文件内容正确。
- 修改后按原编码保存，重新打开内容正确。
- 大文件打开性能不明显退化。
- 保存过程中外部监听不会误报为外部修改。

### 阶段 3：Dialog、拖拽、会话和文件打开

- 用 Electron `dialog.showOpenDialog`、`dialog.showSaveDialog` 替换 Tauri dialog。
- 用 preload API 暴露 `openFileDialog`、`openFolderDialog`、`saveFileDialog`、`confirm`、`message`。
- 处理系统文件双击打开：
  - 冷启动参数进入 pending queue。
  - 已启动时通过 second-instance 事件聚焦窗口并发送 open-file 事件。
- 保持 session restore 与用户主动打开文件的优先级逻辑。

验收标准：

- `Ctrl+O` 打开文件可用。
- 打开文件夹可用。
- 双击关联文件或命令行传入文件时，应用能打开目标文件。
- session restore 不覆盖用户主动打开的文件。

### 阶段 4：目录树、搜索与文件监听

- 迁移目录读取逻辑，保持排除规则：
  - `.git`、`node_modules`、`target`、`dist`、`build`、`out` 等不展示或不搜索。
- 搜索建议先用主进程实现，若大目录阻塞明显，再迁到 worker thread。
- 文件监听建议用 `chokidar`，保留 500ms 防抖和 pause/resume 机制。

验收标准：

- 目录树排序保持目录优先、名称大小写不敏感排序。
- 全局搜索支持普通文本、正则、大小写敏感。
- 搜索结果中的中文字符 offset 正确，前端高亮不偏移。
- 外部修改提示稳定，不因本应用保存产生重复误报。

### 阶段 5：系统集成与安装包

- 使用 `electron-builder` 配置：
  - `appId`
  - `productName`
  - Windows NSIS
  - macOS DMG
  - icon
  - fileAssociations
- Windows 构建保留 asar 打包，但通过 `disableAsarIntegrity: true` 跳过 exe 内 ASAR integrity 资源写入，避免本地/CI 打包时因 `Text Editor V2.exe` 被拒绝写入而失败。
- 迁移 Windows 默认应用注册能力。
- 迁移 reveal in folder、open external URL、clipboard。
- 调整 GitHub Actions release workflow。

验收标准：

- Windows 安装包可安装、卸载、启动。
- macOS DMG 可生成，签名/公证流程有文档或 CI 支持。
- 文件关联能打开应用并传入文件路径。
- 单实例行为可用。

### 阶段 6：清理 Tauri 代码

- 在 Electron 功能等价后再删除：
  - `src-tauri/`
  - `@tauri-apps/*` 依赖
  - Tauri scripts
  - Tauri CI 配置
- 更新 README、用户指南和发布说明。
- 确认没有残留 `data-tauri-drag-region`、`isTauri`、`invoke` 等调用。

验收标准：

- `rg "@tauri|isTauri|invoke\\(|data-tauri"` 无业务代码残留，除迁移说明文档外。
- `npm install`、`npm run build`、`npm run test` 成功。
- 打包产物只来自 Electron。

## 前端抽象建议

建议建立统一 API，避免组件直接依赖 Electron：

```ts
export interface DesktopApi {
  isDesktop(): boolean;
  readFileAuto(path: string): Promise<{ text: string; encoding: string }>;
  readFileMeta(path: string): Promise<FileMeta>;
  writeFile(path: string, content: string, encoding: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  listDirectory(path: string): Promise<DirEntry[]>;
  searchDirectory(dir: string, options: SearchOptions, maxResults?: number): Promise<SearchMatch[]>;
  watchFile(path: string): Promise<void>;
  unwatchFile(path: string): Promise<void>;
  onFileChanged(handler: (path: string) => void): () => void;
  onOpenFile(handler: (path: string) => void): () => void;
  revealInFolder(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  windowMinimize(): Promise<void>;
  windowToggleMaximize(): Promise<boolean>;
  windowClose(): Promise<void>;
}
```

命名可以根据实际代码微调，但需要坚持一个原则：组件和 hooks 调用项目自己的 `desktopApi`，不要直接调用 `window.electron` 或 Tauri API。

## 安全注意事项

- preload 不暴露任意 `ipcRenderer.invoke(channel, ...args)`。
- IPC channel 使用固定白名单。
- 主进程必须校验参数类型，尤其是 path、encoding、URL。
- 外部链接只允许 `http:`、`https:`、`mailto:` 等明确协议。
- 渲染进程不启用 Node 集成。
- 避免在 renderer 中拼接 shell 命令。
- 文件路径来自用户选择、拖拽、系统启动参数或已打开文件，不要引入远程内容路径。

## 性能注意事项

- 大文件读取和搜索不能长期阻塞主进程。
- 搜索目录时需要限制单文件大小、最大扫描行数和最大结果数。
- 文件监听要防抖，并在本应用保存时暂停对应文件监听。
- 编码检测只对必要字节执行，避免每次读取都全量检测超大文件。
- Electron 包体会显著大于 Tauri，发布说明中应明确这一点。

## 测试清单

### 单元测试

- 编码检测和解码。
- 原子保存。
- 目录过滤和排序。
- 搜索结果 offset，特别是中文、emoji、长行截断。
- 文件 watcher pause/resume。
- desktop API mock。

### 手工回归

- 新建、打开、保存、另存为。
- 打开 UTF-8、UTF-8 BOM、UTF-16、GBK、Big5 文件。
- 外部编辑器修改已打开文件。
- 目录树打开项目并刷新。
- 普通搜索、正则搜索、大小写敏感搜索。
- Markdown/HTML 预览和阅读模式。
- Diff 对比。
- 分屏、拖拽标签、关闭未保存标签。
- 命令面板。
- 单实例和文件双击打开。
- Windows 安装、卸载、文件关联。
- macOS 打包、首次打开、签名/公证提示。

## 主要风险

- 编码检测库与 chardetng 结果不完全一致，可能影响旧文件打开效果。
- Node `rename` 在 Windows 文件占用场景下的错误码和 Rust 行为不同，需要专门处理。
- `fs.watch` 在不同平台表现不一致，优先考虑 `chokidar`。
- Electron 安全模型需要谨慎设计 preload，不能为了迁移方便开放泛化 IPC。
- 安装包体积和内存占用会高于 Tauri，需要接受产品层面的变化。
- macOS 签名、公证和 Windows SmartScreen 可能成为发布流程中的主要摩擦点。

## 推荐执行顺序

1. 新建迁移分支。
2. 阶段 0：前端 Tauri 调用收口。
3. 阶段 1：Electron 壳跑通。
4. 阶段 2：文件读写和编码等价。
5. 阶段 3：Dialog、拖拽、会话和文件打开。
6. 阶段 4：目录树、搜索和 watcher。
7. 阶段 5：安装包、文件关联和 CI。
8. 阶段 6：删除 Tauri、更新文档、最终回归。

## 迁移期间的维护约定

- 每完成一个阶段都更新本文档的状态和偏差说明。
- 不在同一个提交里混合“大规模迁移”和“无关 UI 重构”。
- 每次替换一类 Tauri 能力时，都保留对应测试或补充最小测试。
- 若发现 Electron 实现与 Tauri 行为不同，先记录差异，再决定兼容还是调整产品行为。
