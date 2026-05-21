# Text-Editor-V2 全面优化方案

> 版本：1.0  
> 目标：在不破坏项目结构、不影响现有功能的前提下，分阶段实施 17 项优化，提升性能、稳定性与交互体验。  
> 原则：**可扩展、易迭代、易测试**

---

## 目录

1. [总体策略](#总体策略)
2. [阶段一：核心性能重构（P0）](#阶段一核心性能重构p0)
3. [阶段二：资源管理与状态持久化（P1）](#阶段二资源管理与状态持久化p1)
4. [阶段三：编辑体验增强（P2）](#阶段三编辑体验增强p2)
5. [阶段四：搜索与文件系统优化（P2-P3）](#阶段四搜索与文件系统优化p2-p3)
6. [阶段五：工程化质量基建（贯穿全程）](#阶段五工程化质量基建贯穿全程)
7. [兼容性保障](#兼容性保障)
8. [验收标准](#验收标准)

---

## 总体策略

### 设计原则

| 原则 | 说明 |
|------|------|
| **零侵入** | 每个优化以"新增模块"或"扩展点"实现，不修改已有业务逻辑的主体流程 |
| **可开关** | 性能优化（如按需挂载、预加载）提供降级路径，出现问题可秒级回滚 |
| **单测护航** | 每个阶段新增代码须配套单元测试，核心 hooks 覆盖率目标 ≥ 80% |
| **渐进交付** | 每阶段独立合并、独立验证，不阻塞其他阶段并行开发 |

### 项目结构保持

```
src/
├── hooks/           # 保持不变，新增 hook 以独立文件放入
├── components/      # 保持不变，新增组件以独立文件放入
├── utils/           # 保持不变，通用工具函数追加
├── stores/          # [建议新增] 若状态逻辑膨胀，从 hooks 中拆分独立 store 目录
├── services/        # [建议新增] 跨组件通信、文件搜索等纯逻辑服务
└── __tests__/       # [建议新增] 测试目录，与源码目录镜像
```

> **注意**：本次优化不强制重构目录，所有新增文件按现有约定放入 `hooks/` / `components/` / `utils/`，避免一次性大规模目录调整。

---

## 阶段一：核心性能重构（P0）

> 目标：消除性能黑洞，解决大文件/多标签场景下的 CPU 与内存问题。

### 1. 预览组件事件驱动重构

**现状**：`MarkdownPreview`、`HtmlPreview`、`HtmlReader`、`MarkdownReader` 使用 `requestAnimationFrame` / `setTimeout` 轮询编辑器内容，每秒 60 次调用 `doc.toString()`。

**优化**：
- 在 `useEditorStatePool.ts` 引入轻量级发布订阅：`subscribeContentChange(tabId, cb)` / `notifyContentChange(tabId, content)`
- `CmEditor.tsx` 的 `EditorView.updateListener` 中，当 `update.docChanged` 为 `true` 时调用 `notifyContentChange`
- `updateEditorContent`（编码切换、文件重载）后手动调用 `notifyContentChange`
- 四个预览/阅读组件取消轮询，改用 `useEffect(() => subscribeContentChange(...), [tabId])`
- 各组件内部维护 `debounceRef`，300ms 防抖后渲染

**体验变化**：
- 大文件 idle 时 CPU 从 10-30% 降至 0%
- `doc.toString()` 调用从 60 次/秒降为仅实际编辑次数
- 快速输入时预览不再卡顿，笔记本续航提升

**影响文件**：
```
src/hooks/useEditorStatePool.ts   # 新增发布订阅 API
src/components/CmEditor.tsx       # updateListener 扩展
src/components/MarkdownPreview.tsx # 移除 RAF，接入订阅
src/components/HtmlPreview.tsx    # 移除 RAF，接入订阅
src/components/HtmlReader.tsx     # 移除 RAF，接入订阅
src/components/MarkdownReader.tsx # 移除 setTimeout 轮询，接入订阅
```

---

### 2. CmEditor 按需挂载

**现状**：`App.tsx` 中所有标签页同时挂载 `CmEditor`，不可见标签也维持完整 CodeMirror 实例，内存随标签数线性增长。

**优化**：
- 改为仅挂载当前活跃标签页（及分屏中可见标签页）的编辑器实例
- 滚动位置通过已有的 `scrollTops` Map 保存/恢复
- `EditorState` 通过 `useEditorStatePool` 持久化，切换标签时状态不丢失
- 支持可选的 `keepLastN=3` 缓存策略（最近 3 个标签保留实例以加速回退）

**体验变化**：
- 打开 20+ 标签页时内存占用从数百 MB 降至与活跃标签数成正比
- 切换标签无视觉跳动，光标和滚动位置完全保持

**影响文件**：
```
src/App.tsx              # 渲染逻辑改为条件挂载
src/components/CmEditor.tsx # 确保 cleanup 时保存状态
src/hooks/useEditorStatePool.ts # 状态保存逻辑确认无误
```

---

### 3. Minimap 轮询优化

**现状**：`Minimap.tsx` 对可见标签页以 200ms `setTimeout` 轮询重绘，存在过期一帧的视觉延迟。

**优化**：
- 接入阶段一建立的 `subscribeContentChange`，仅内容变更时触发重绘
- 滚动位置同步通过 CodeMirror `EditorView.scrollIntoView` / `viewport` 事件驱动
- 折叠状态变化通过 `foldEffect` 监听

**体验变化**：
- Minimap 与编辑器内容严格同步，无轮询延迟
- 大文件 idle 时 Minimap 不再消耗 CPU

**影响文件**：
```
src/components/Minimap.tsx
```

---

## 阶段二：资源管理与状态持久化（P1）

> 目标：修复已知缺陷，防止内存泄漏，实现会话恢复。

### 4. 主题注入 Key 修复

**现状**：`themeInjector.ts` 直接读取 `localStorage.getItem('te2-settings')`，但 `useSettingsStore.ts` 写入的 key 名称不一致，导致重启后主题色闪回默认。

**优化**：
- **方案 A（推荐）**：`themeInjector.ts` 不再直接读取 `localStorage`，改为导出 `applyTheme(colors)` 函数，由 `App.tsx` 在 settings store 初始化后调用
- **方案 B**：统一 localStorage key 名称，并添加版本号前缀（如 `te-v2-settings`）

**体验变化**：
- 自定义主题色保存后，重启应用立即生效，不再出现白色闪屏

**影响文件**：
```
src/utils/themeInjector.ts
src/App.tsx
```

---

### 5. 关闭标签页资源释放

**现状**：关闭标签页时 `EditorState` 仍留在 `useEditorStatePool` 中，内存永不释放；文件监听器也可能残留。

**优化**：
- 关闭标签时调用 `deleteEditorState(tabId)`，从 `editorStates` / `activeViews` / `scrollTops` / `contentListeners` 中彻底清理
- 同步调用 `unwatch_file` 移除文件系统监听
- 可选：提供 `clearClosedTabStateAfterMs = 300000`（5分钟）延迟清理策略，防止误关后快速 reopen 丢失状态

**体验变化**：
- 长时间使用后内存不再无限增长
- 关闭大量文件后应用保持轻量

**影响文件**：
```
src/hooks/useEditorStatePool.ts  # 新增 deleteEditorState API
src/hooks/useEditorStore.ts      # closeTab 中调用清理
src/hooks/useFileWatcher.ts      # 确保 unwatch 被调用
```

---

### 6. 标签页恢复与持久化

**现状**：关闭应用后所有标签页丢失，需手动重新打开。

**优化**：
- 退出时（`beforeunload` 或 Tauri `CloseRequested` 事件）序列化会话：
  ```ts
  interface SessionState {
    tabs: Array<{
      path: string;
      cursor: { line: number; ch: number };
      scrollTop: number;
      encoding: string;
      eol: string;
    }>;
    activeTabId: string;
    sidebarOpen: boolean;
    sidebarPath?: string;
  }
  ```
- 序列化数据保存到 Tauri 应用数据目录（`app_config_dir`）下的 `session.json`
- 启动时若存在 `session.json` 且文件仍可读，自动恢复；文件已被删除则静默跳过
- 未保存修改的标签弹出提示：保存 / 不保存 / 取消关闭

**体验变化**：
- 关机、崩溃或升级后重启，工作现场完全恢复
- 再也不会因为忘记保存而丢失上下文

**影响文件**：
```
src-tauri/src/main.rs              # 新增 save_session / load_session 命令
src-tauri/tauri.conf.json          # 配置 CloseRequested 事件监听
src/utils/sessionManager.ts        # [新增] 会话序列化/反序列化逻辑
src/App.tsx                        # 启动恢复 + 退出保存
```

---

## 阶段三：编辑体验增强（P2）

> 目标：减少用户等待，提升日常编辑效率。

### 7. 语言包预加载策略

**现状**：`languageExtensions.ts` 按需 `import()` 加载语言包，首次打开某语言文件时存在 100-500ms 白屏。

**优化**：
- 维护一个 `ext -> language` 映射表（已有）
- 基于当前已打开标签的扩展名，在 `requestIdleCallback` 中预加载对应语言包
- 已缓存的语言包直接复用，不重复加载
- 提供 `prefetchLanguages(exts: string[])` 公共 API，供文件树展开文件夹时批量预加载

**体验变化**：
- 切换已打开过的语言标签无延迟
- 首次打开主流语言文件等待时间减半

**影响文件**：
```
src/utils/languageExtensions.ts  # 新增 prefetchLanguages API
src/App.tsx                      # 标签切换/打开时触发预加载
```

---

### 8. 大文件编辑优化

**现状**：已有 `largeFileOptimization` 开关（>2MB 自动开启纯文本模式），但纯文本模式下无语法高亮、无折叠，且 DOM 仍全量渲染。

**优化**：
- **行级高亮**：大文件模式下保留基于行首特征（如日志时间戳、JSON key、报错堆栈）的启发式语法高亮，禁用跨行解析
- **特性降级**：禁用括号匹配、代码折叠、Unicode 高亮、列对齐等跨行/全量扫描特性
- **虚拟滚动**：CodeMirror 6 本身基于 viewport 渲染，确认 `EditorView` 的 `scrollPastEnd` / `drawSelection` 配置不会在大文件下产生额外开销即可

**体验变化**：
- 10MB+ 日志文件打开时间 < 1s，滚动流畅
- 纯文本模式下仍保留基本的可读性高亮

**影响文件**：
```
src/components/CmEditor.tsx       # 大文件模式扩展配置调整
src/utils/editorExtensions.ts     # 大文件模式下跳过部分扩展
```

---

### 9. 最近打开（MRU）与快速打开

**现状**：无最近文件列表，无 `Ctrl+P` 快速打开文件功能。

**优化**：
- 在 `useEditorStore` 中维护 `recentFiles: string[]`（最多 50 条），按打开时间排序
- `Ctrl+P`（或 `Cmd+P`）唤起快速打开面板，模糊搜索项目内文件 + 最近文件
- 最近文件列表持久化到 `localStorage`
- 文件树中已打开文件夹时，使用 Tauri `read_dir` 递归建立文件索引（深度限制 3 层，排除 `node_modules` / `.git`）

**体验变化**：
- 常用文件秒开，无需在文件夹树中层层查找
- 项目级文件跳转体验接近 VS Code

**影响文件**：
```
src/hooks/useEditorStore.ts       # 新增 recentFiles 状态与持久化
src/components/QuickOpen.tsx      # [新增] 快速打开面板组件
src/App.tsx                       # 注册 Ctrl+P 快捷键
```

---

### 10. 智能括号与引号

**现状**：已有基础括号匹配高亮，但无自动补全（输入 `{` 不自动补全 `}`）。

**优化**：
- 集成 CodeMirror `@codemirror/closebrackets` 扩展
- 支持 `()[]{}""''` 成对补全
- 当选择区非空时，输入括号用括号包裹选择内容

**体验变化**：
- 输入代码时括号/引号自动成对，减少语法错误
- 包裹选择内容时无需手动删除再输入

**影响文件**：
```
src/utils/editorExtensions.ts     # 新增 closeBrackets 扩展
```

---

### 11. 多光标与列选择

**现状**：已有 `Ctrl+点击` 多光标，但无 `Alt+鼠标拖拽` 列选择（块选择）模式。

**优化**：
- 启用 CodeMirror `@codemirror/rectangular-selection` 扩展
- `Alt+鼠标拖拽` 进入列选择模式
- `Ctrl+Alt+↑/↓` 添加同行列光标

**体验变化**：
- CSV、日志、对齐文本的批量编辑效率大幅提升

**影响文件**：
```
src/utils/editorExtensions.ts     # 新增 rectangularSelection 扩展
```

---

## 阶段四：搜索与文件系统优化（P2-P3）

> 目标：实现项目级搜索、高效保存、智能外部变更处理。

### 12. 全局搜索与替换

**现状**：仅有单文件查找替换（`FindReplace.tsx`），无跨文件搜索。

**优化**：
- **Tauri 后端**：新增 `search_in_dir` 命令，封装 `ripgrep` 风格的目录搜索（Windows 可用 Rust 递归扫描 + 正则匹配）
- **前端面板**：新增 `GlobalSearch.tsx` 面板，支持：
  - 正则 / 普通文本搜索
  - 文件过滤（`*.ts`、`!*.test.ts`）
  - 结果列表：文件路径、行号、上下文预览
  - 点击结果跳转到对应位置
  - 全局替换（带确认）
- 搜索结果限制 1000 条，防止内存溢出

**体验变化**：
- 项目级搜索无需离开编辑器
- 重构时批量替换安全可控

**影响文件**：
```
src-tauri/src/main.rs             # 新增 search_in_dir / replace_in_dir 命令
src/components/GlobalSearch.tsx   # [新增] 全局搜索面板
src/App.tsx                       # 注册快捷键与面板切换
```

---

### 13. 增量保存与大文件写入

**现状**：每次保存调用 `write_file` 全量写入，大文件保存时阻塞 UI。

**优化**：
- **Tauri 后端**：
  - 若文件 < 1MB：直接全量写入（简单可靠）
  - 若文件 ≥ 1MB：计算新旧内容差异，若仅尾部追加/修改，使用 `std::fs::OpenOptions::append()` 或 seek+write；若头部/中部修改，仍全量写入但放到异步线程，前端显示进度条
- 写入完成后返回 `lastModified` 时间戳，前端刷新文件监听状态

**体验变化**：
- 100MB 文件修改最后一行后保存从 2s 降至毫秒级
- 大文件保存时 UI 不再冻结

**影响文件**：
```
src-tauri/src/file_ops.rs         # [新增或修改] 增量写入逻辑
src/components/StatusBar.tsx      # 保存时显示进度指示
```

---

### 14. 外部文件变更智能合并

**现状**：`useFileWatcher.ts` 监听到外部变更后弹出提示，用户需手动选择重载或忽略。

**优化**：
- 若文件在编辑器中**无未保存修改**：自动静默重载，状态栏显示 "已同步外部变更" 提示（2 秒后消失）
- 若文件**有未保存修改**：
  - 展示 `DiffEditor` 对比外部版本与当前编辑版本
  - 提供选项：使用外部版本 / 保留当前编辑 / 合并（手动复制差异）
- 支持设置 `autoReloadOnExternalChange: boolean`（默认 `true`）

**体验变化**：
- Git 切换分支、IDE 外部修改等场景下不再被频繁弹窗打断
- 有未保存内容时安全决策，避免丢失工作

**影响文件**：
```
src/hooks/useFileWatcher.ts       # 智能重载逻辑
src/components/DiffEditor.tsx     # 已存在，复用
```

---

## 阶段五：工程化质量基建（贯穿全程）

> 目标：提升代码质量、可维护性与构建效率。

### 15. 类型安全强化

**现状**：部分 `any` 类型（如 Tauri API 返回、正则构建器状态），`tsconfig.json` 未开启 `strict` 全模式。

**优化**：
- 逐步开启 `tsconfig.json` 严格选项：
  ```json
  {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
  ```
- 为 Tauri 命令补充 Rust + TypeScript 共享类型接口（可用 `ts-rs` 或手写 `.d.ts`）
- 建立 `src/types/tauri.d.ts` 统一管理 Tauri 调用类型
- 不一次性修复所有 `any`，而是**新增代码必须严格，旧代码逐步收敛**

**体验变化**（开发者侧）：
- 重构更安全，IDE 提示更精准
- 运行时类型错误减少

**影响文件**：
```
tsconfig.json                     # 开启 strict
tsconfig.app.json                 # 同步调整
src/types/                        # [新增] 类型定义目录
```

---

### 16. 测试覆盖

**现状**：已有 Vitest 配置，但无实际测试文件。

**优化**：
- **前端单元测试**：
  - `utils/sessionManager.ts` —— 会话序列化/反序列化
  - `hooks/useEditorStatePool.ts` —— 状态存取、发布订阅
  - `utils/editorExtensions.ts` —— 扩展配置生成逻辑
- **前端组件测试**：
  - `StatusBar` —— 状态显示逻辑
  - `FindReplace` —— 搜索逻辑（不涉及 CM 视图）
- **Tauri 集成测试**：
  - 文件读写、编码检测、目录搜索命令
- 目标：核心 hooks 和工具函数覆盖率 ≥ 80%

**影响文件**：
```
vitest.config.ts                  # 确认配置完善
src/__tests__/                    # [新增] 测试目录
src-tauri/tests/                  # [新增] Rust 测试
```

---

### 17. 构建产物优化

**现状**：所有语言包打包在一个 chunk 中，首载体积大。

**优化**：
- Vite `manualChunks` 按语言分包：
  ```ts
  // vite.config.ts
  manualChunks: {
    'cm-langs-common': ['@codemirror/lang-javascript', '@codemirror/lang-typescript', '@codemirror/lang-json'],
    'cm-langs-web': ['@codemirror/lang-html', '@codemirror/lang-css', '@codemirror/lang-markdown'],
    // ... 其他分组
  }
  ```
- `marked` 等重型库异步加载（`import('marked')`），仅在预览组件挂载时拉取
- 开启 `build.minify: 'terser'` 与 `build.rollupOptions.output.manualChunks`

**体验变化**：
- 应用启动包体 < 500KB，首屏加载 < 1s
- 语言包按需拉取，无阻塞

**影响文件**：
```
vite.config.ts                    # 调整 chunk 策略
src/components/MarkdownPreview.tsx # marked 改为动态 import
src/components/MarkdownReader.tsx  # marked 改为动态 import
```

---

## 兼容性保障

### 不修改的现有行为

以下功能在优化过程中**完全不改变交互逻辑**，仅提升性能或修复缺陷：

- 标签页创建、关闭、切换、重命名、拖拽排序
- 分屏编辑模式
- Diff 对比视图
- 查找替换（单文件）
- 文件树浏览与文件打开
- 主题编辑器与颜色设置
- 设置面板的全部选项
- 命令面板（F1）
- 右键菜单（CmEditor、TabBar、文件树）
- 大文件优化开关及其行为
- 编码切换、换行符切换
- 状态栏显示内容
- 诊断面板
- 文件拖放打开
- 全局快捷键

### 回滚策略

每个阶段优化均遵循：
1. **特性开关**：通过环境变量或配置项启用/禁用（如 `VITE_ENABLE_LAZY_MOUNT=true`）
2. **独立分支**：每个阶段在独立功能分支开发，合并前经过完整回归测试
3. **秒级回滚**：若发现问题，仅回滚该阶段对应的文件变更，不影响其他优化

---

## 验收标准

| 阶段 | 验收项 | 验证方式 |
|------|--------|----------|
| P0-1 | 大文件 idle CPU 降至 0% | 任务管理器 / DevTools Performance |
| P0-2 | 20 标签页内存 < 300MB | DevTools Memory |
| P0-3 | 切换标签无滚动/光标跳动 | 手动测试 |
| P1-4 | 自定义主题重启后生效 | 重启应用验证 |
| P1-5 | 关闭标签后内存下降 | DevTools Memory |
| P1-6 | 重启后恢复上次会话 | 重启应用验证 |
| P2-7 | 语言包切换无白屏 | Lighthouse / 手动 |
| P2-8 | 10MB 文件打开 < 1s | `performance.now()` |
| P2-9 | Ctrl+P 打开文件 < 200ms | 手动测试 |
| P3-12 | 全局搜索返回结果 < 2s | 手动测试 |
| P3-13 | 大文件尾部修改保存 < 100ms | `performance.now()` |
| P5-16 | 核心 hooks 覆盖率 ≥ 80% | `vitest run --coverage` |
| P5-17 | 首屏包体 < 500KB | `vite build` 产物分析 |

---

## 附录：优化优先级矩阵

| 优先级 | 编号 | 优化项 | 收益 | 工作量 | 阶段 |
|--------|------|--------|------|--------|------|
| P0 | 1 | 预览组件事件驱动 | 极高 | 中 | 一 |
| P0 | 2 | CmEditor 按需挂载 | 极高 | 中 | 一 |
| P1 | 3 | Minimap 轮询优化 | 高 | 低 | 一 |
| P1 | 4 | 主题注入 Key 修复 | 高 | 低 | 二 |
| P1 | 5 | 关闭标签资源释放 | 高 | 低 | 二 |
| P1 | 6 | 标签页恢复 | 高 | 中 | 二 |
| P2 | 7 | 语言包预加载 | 中 | 低 | 三 |
| P2 | 8 | 大文件编辑优化 | 中 | 高 | 三 |
| P2 | 9 | MRU 与快速打开 | 中 | 中 | 三 |
| P2 | 10 | 智能括号 | 中 | 低 | 三 |
| P2 | 11 | 列选择 | 中 | 低 | 三 |
| P3 | 12 | 全局搜索 | 中 | 高 | 四 |
| P3 | 13 | 增量保存 | 中 | 高 | 四 |
| P3 | 14 | 外部变更智能合并 | 中 | 中 | 四 |
| P3 | 15 | 类型安全 | 长期 | 中 | 五 |
| P3 | 16 | 测试覆盖 | 长期 | 中 | 五 |
| P3 | 17 | 构建优化 | 中 | 低 | 五 |
