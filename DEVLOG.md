# Text Editor v2 — 开发日志

> 本文档记录当前开发进度、已知问题和后续计划。更换设备时请优先阅读此文档。

---

## 一、项目概述

**Text Editor v2** 是一个基于 Tauri v2 + React 19 + Rust 原生渲染的桌面文本编辑器。

- **前端**: React 19 + TypeScript + Tailwind CSS —— 负责工具栏、标签栏、侧边栏、状态栏等 UI
- **编辑器核心**: Rust + wgpu + cosmic-text —— 负责文本缓冲、渲染、字体排版
- **架构**: 编辑器区域为一个 Win32 子窗口（`WS_CHILD`），悬浮在 WebView 上方，wgpu 直接渲染

---

## 二、已完成工作

### Phase 0 — 跨平台骨架 ✅

- [x] Rust 模块结构：`core/`, `editor/`, `syntax/`, `render/`, `platform/`, `ffi_export.rs`
- [x] `Cargo.toml` 依赖：`wgpu`, `cosmic-text`, `ropey`, `tree-sitter`, `raw-window-handle`, `windows 0.58.0`
- [x] 前端 `NativeEditorHost` 组件：用 ResizeObserver 同步编辑器区域坐标到 Rust
- [x] 移除 `monaco-editor` 及相关依赖

### Phase 1 — Win32 窗口 + wgpu 渲染 ✅

- [x] `Win32EditorWindow`：创建 `WS_CHILD` 子窗口，绑定到 Tauri WebView 窗口
- [x] `WgpuContext`：wgpu Instance → Surface（D3D12 后端）→ Device/Queue → SwapChain
- [x] 60fps 渲染循环：独立线程运行 `render()`
- [x] `native_editor_resize`：前端 div 坐标 → Rust → `SetWindowPos` 同步子窗口位置
- [x] **cosmic-text 文本渲染**：在 wgpu 窗口中渲染 "Hello 世界"（含 CJK）
  - 使用 `Buffer::draw` 官方方法，正确处理 baseline 对齐
  - 使用 `Microsoft YaHei` 统一字体，避免中英文底端不对齐
  - premultiplied alpha 处理，避免实心方块
  - `FilterMode::Nearest`，避免边缘模糊
- [x] z-order 置顶：`SetWindowPos` + `HWND_TOP`
- [x] 子窗口不抢焦点：`WM_MOUSEACTIVATE` 返回 `MA_NOACTIVATE`

### Phase 2 — 文本编辑器核心（进行中）

- [x] `EditorState`：集成 `ropey::Rope` + `Cursor`（pos/line/col/target_col）
- [x] 键盘操作方法：`insert_char`, `insert_newline`, `backspace`, `delete`, `move_left/right/up/down/home/end`
- [x] `native_editor_key_event` Tauri 命令：接收前端键盘事件，修改编辑器状态
- [x] 前端 `NativeEditorHost.tsx`：全局 `keydown` 监听，过滤 `Ctrl+/Meta+` 和 `input/textarea`
- [x] `TextAtlas::resize()` + `WgpuContext::update_text_texture()`：texture 动态适配窗口大小（避免字体拉伸）
- [ ] **键盘输入未验证**：焦点问题已修复（`MA_NOACTIVATE`），但用户反馈仍无法输入，待排查
- [ ] **光标渲染**：尚未实现
- [ ] **滚动支持**：尚未实现
- [ ] **鼠标点击定位**：尚未实现

---

## 三、已知问题

| 问题 | 优先级 | 说明 |
|------|--------|------|
| 键盘输入未生效 | **P0** | 前端 `keydown` 事件可能未触发，或 Rust 端未正确处理。需排查：① `window.addEventListener` 是否注册 ② `invoke('native_editor_key_event')` 是否成功调用 ③ `Buffer::draw` 性能是否导致阻塞 |
| 光标未渲染 | **P1** | 需要添加光标渲染：wgpu 中画一个竖线 quad，支持闪烁 |
| 无滚动条 | **P1** | 多行文本超出窗口时无法滚动。需要：① 垂直滚动偏移量 ② 鼠标滚轮事件 ③ 滚动条 UI（可选） |
| 文字位置贴边 | **P2** | 当前文字紧贴左侧边缘，需要添加 padding |
| 无法鼠标点击定位 | **P2** | 需要前端/后端协作，将鼠标坐标转换为字符索引 |
| 无选区高亮 | **P3** | `Selection` 结构已存在，但未实现渲染逻辑 |
| 前端全局键盘监听冲突 | **P3** | `window.addEventListener('keydown')` 可能与查找替换框等 `<input>` 冲突（已部分过滤） |

---

## 四、后续开发计划

### Phase 2 剩余工作（核心编辑器）

1. **修复键盘输入** — 确认事件传递链路，必要时添加日志排查
2. **光标渲染** — wgpu 中渲染闪烁光标竖线
3. **滚动支持** — 垂直滚动 + 鼠标滚轮
4. **鼠标点击定位** — 坐标 → 字符索引转换
5. **选区高亮** — Shift+方向键选区，渲染高亮背景

### Phase 3（文件 I/O 与状态同步）

- [ ] 打开文件加载到编辑器
- [ ] 保存文件
- [ ] 前端 Tab 状态与 Rust 编辑器状态同步
- [ ] 未保存更改提示（dirty flag 已实现）

### Phase 4（高级功能）

- [ ] 语法高亮（tree-sitter）
- [ ] 查找替换
- [ ] 多光标
- [ ] 撤销/重做（undo_stack 骨架已存在）
- [ ] 字体/主题配置

---

## 五、技术栈详情

### Rust 后端

| 模块 | 文件 | 说明 |
|------|------|------|
| 文本缓冲 | `src/core/rope_buffer.rs` | `TextBuffer` 包装 `ropey::Rope` |
| 编辑器状态 | `src/editor/editor_state.rs` | `EditorState`：rope + cursor + undo_stack |
| 光标 | `src/editor/cursor.rs` | `Cursor`（pos/line/col/target_col）+ `Selection` |
| wgpu 上下文 | `src/render/wgpu_context.rs` | `WgpuContext`：Surface/Device/Queue + text pipeline |
| 文字渲染 | `src/render/text_atlas.rs` | `TextAtlas`：cosmic-text `Buffer::draw` → CPU RGBA → GPU texture |
| Win32 窗口 | `src/platform/win32/window.rs` | `Win32EditorWindow` + `Win32WindowWrapper`（raw-window-handle） |
| FFI 命令 | `src/ffi_export.rs` | Tauri `invoke` 命令：resize/load/get/key_event |

### 前端

| 文件 | 说明 |
|------|------|
| `src/components/NativeEditorHost.tsx` | 编辑器占位 div，ResizeObserver + 键盘事件转发 |
| `src/App.tsx` | 主布局：Toolbar/TabBar/Sidebar/StatusBar/NativeEditorHost |

### 关键依赖版本

```toml
wgpu = "22.1"
cosmic-text = "0.12"
ropey = "1.6"
tree-sitter = "0.24"
raw-window-handle = "0.6"
windows = { version = "0.58", features = [...] }
```

---

## 六、本地开发环境

### 必备工具

- **Rust**: MSVC toolchain（VS 2022+）
- **Node.js**: 18+
- **Tauri CLI**: `npm run tauri`（项目本地安装 `@tauri-apps/cli`）

### 首次构建

```powershell
cd D:\kimicode\text-editor-v2
npm install
cd src-tauri
cargo check
```

### 运行开发服务器

```powershell
cd D:\kimicode\text-editor-v2
npx tauri dev
```

> 注意：如果端口 1420 被占用，先关闭之前的 dev server（Ctrl+C）。

### Cargo 镜像配置（USTC）

`C:\Users\<username>\.cargo\config.toml`：

```toml
[registries.crates-io]
protocol = "sparse"

[source.crates-io]
replace-with = 'ustc'

[source.ustc]
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"
```

---

## 七、Git 提交规范

- 分支：`text-editor-v2`
- 提交前确保 `cargo check` 通过
- 前端修改需同步到 `src/components/NativeEditorHost.tsx`

---

*最后更新：2026-04-25*
