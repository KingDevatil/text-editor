# Column Align Feature - Review Round 2 (UX Focus)

## 1. 已修复问题（本轮之前）

| # | 文件 | 修复内容 |
|---|------|----------|
| 1 | `columnAlign.ts:173` | `querySelector('.cm-content')` → `view.contentDOM` |
| 2 | `columnAlign.ts:239` | `view.dom.addEventListener('scroll')` → `view.scrollDOM` |
| 3 | `columnAlign.ts:166` | 提取 `TAB_REGEX` 常量 |
| 4 | `CmEditor.tsx:739-783` | 拆分 effect + `tabColumnWidthsRef` 按 tab 缓存列宽 |

---

## 2. 本轮发现的问题（按严重程度排序）

### Critical — 功能缺陷

| # | 文件 | 问题 | 用户体验影响 |
|---|------|------|-------------|
| 1 | `columnAlign.ts:89-118` | `build()` 只扫描 `view.viewport`，如果用户滚动到未渲染区域，那些行的 tab 不会被替换 | **滚动到未渲染区域时列对齐失效**，出现混乱的 tab 显示 |
| 2 | `columnAlign.ts:94-115` | 遍历 viewport 时 `pos = line.to + 1` 可能跳过空行或导致越界 | 空行处理可能不正确 |
| 3 | `CmEditor.tsx:761-783` | drag layer effect 在 `columnAlignEnabled` 变化时 cleanup 旧 layer，但新 layer 的 `updateHandles` 中 `view.contentDOM.getBoundingClientRect()` 在 tab 切换时可能获取的是旧视口尺寸 | 拖拽线位置可能短暂错位 |

### High — 交互体验

| # | 文件 | 问题 | 用户体验影响 |
|---|------|------|-------------|
| 4 | `columnAlign.ts:185-187` | 拖拽线 `width: 4px` 太窄，且 `background: transparent` 时完全不可见，用户不知道哪里可以拖拽 | **用户无法发现可拖拽区域**，除非偶然鼠标 hover |
| 5 | `columnAlign.ts:186` | 拖拽线 `left` 是绝对位置，但如果编辑器内容区域左侧有 gutter（行号），`cumulativeX` 计算从 `contentRect.left` 开始是对的，但如果容器有 transform/scale 会错位 | 拖拽线位置与视觉列边界不对齐 |
| 6 | `columnAlign.ts:210-221` | `onMouseMove` 中每次移动都 dispatch 一个 StateEffect，即使 delta 只有 1px | **拖拽时 CM6 频繁重渲染，可能导致卡顿** |
| 7 | `CmEditor.tsx:752-756` | `tabColumnWidthsRef` 只在内存中，刷新页面后列宽丢失 | 用户调整好的列宽无法持久化 |
| 8 | `Toolbar.tsx:134-142` | 列对齐按钮没有 `disabled` 状态，也没有判断当前文件是否包含 tab 字符 | 用户对不含 tab 的文件点击按钮没有任何视觉反馈 |

### Medium — 代码/可维护性

| # | 文件 | 问题 | 建议 |
|---|------|------|------|
| 9 | `columnAlign.ts:100-104` | 逐字符扫描找 tab，O(n) 每行 | 对超大文件可用 `indexOf` 循环优化，但当前够用 |
| 10 | `columnAlign.ts:233-235` | `updateHandler` 用 `requestAnimationFrame` 包裹 `updateHandles`，但 `updateHandles` 本身已经很快 | 可以简化直接调用 |
| 11 | `columnAlign.test.ts:23` | `columnAlignExtension[2]` 数组索引访问 | 导出 `columnAlignPlugin` 直接引用 |
| 12 | `columnAlign.test.ts:119-124` | "respects minimum column width" 没有真正断言宽度被 clamp | 检查 widget 宽度 |
| 13 | `App.tsx:713` | 命令面板中列对齐命令没有 shortcut | 建议添加快捷键如 `Ctrl+Shift+T` |

### Low — 细节优化

| # | 文件 | 问题 | 建议 |
|---|------|------|------|
| 14 | `columnAlign.ts:13` | `COL_PADDING = 16` 无注释 | 添加注释说明 |
| 15 | `StatusBar.tsx:287-299` | `onToggleColumnAlign` 是 optional，但 App 总是传入 | 简化条件判断 |
| 16 | `SettingsPanel.tsx:213` | ToggleRow 的 title 说明清晰 | OK |

---

## 3. 关键用户体验问题详解

### 问题 1: Viewport 外区域列对齐失效（Critical）

**现状：** `build()` 方法只处理 `view.viewport.from` 到 `view.viewport.to` 范围内的行。CM6 的 viewport 是可见区域加上一定缓冲，但如果文件很长，滚动到未缓冲区域时，那些行的 tab 不会被 `ColumnSpacerWidget` 替换。

**后果：** 用户滚动时，部分区域的 tab 显示为原始 `\t` 字符（通常是一个小箭头或空白），与列对齐区域混杂，视觉混乱。

**修复建议：** CM6 的 `ViewPlugin` 会自动处理 viewport 变化并调用 `update()`，但 `build()` 确实只应该处理 viewport。这不是 bug，而是 CM6 的设计。不过需要确认 CM6 的 viewport 缓冲是否足够大。如果用户报告滚动时闪烁，可能需要增加 `viewportMargin`。

```typescript
// 在 CmEditor.tsx 的 buildBaseExtensions 中
EditorView.viewportMargin.of(100), // 增加 viewport 缓冲行数
```

### 问题 4: 拖拽线不可见（High）

**现状：** 拖拽线默认 `background: transparent`，只有鼠标 hover 时才显示 `var(--te-primary)` 颜色。

**后果：** 用户完全不知道哪里可以拖拽调整列宽，除非鼠标恰好滑过那条 4px 宽的 invisible 线。

**修复建议：**

```typescript
// 方案 A: 始终显示 subtle 的拖拽线
handle.style.cssText =
  `position:absolute;top:0;left:${cumulativeX}px;width:4px;height:100%;` +
  `cursor:col-resize;pointer-events:auto;background:color-mix(in srgb, var(--te-border) 30%, transparent);`;

// hover 时加深
handle.addEventListener('mouseenter', () => {
  handle.style.background = 'var(--te-primary)';
  handle.style.opacity = '0.5';
});
handle.addEventListener('mouseleave', () => {
  if (!isDragging) {
    handle.style.background = 'color-mix(in srgb, var(--te-border) 30%, transparent)';
    handle.style.opacity = '1';
  }
});
```

### 问题 6: 拖拽时频繁 dispatch（High）

**现状：** `onMouseMove` 中每次鼠标移动都 dispatch StateEffect，触发 CM6 重新计算 decorations。

**后果：** 快速拖拽时，CM6 可能每秒重渲染 60+ 次，导致卡顿。

**修复建议：** 使用 `requestAnimationFrame` 或 throttle 节流：

```typescript
let pendingWidth: number | null = null;
let rafId: number | null = null;

function onMouseMove(e: MouseEvent) {
  if (!isDragging || dragColIndex < 0) return;
  const delta = e.clientX - startX;
  const newWidth = Math.max(MIN_COL_WIDTH, startWidth + delta);
  pendingWidth = newWidth;

  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (pendingWidth !== null && dragColIndex >= 0) {
        const cfg = view.state.field(columnAlignField);
        const newWidths = [...cfg.widths];
        newWidths[dragColIndex] = pendingWidth;
        view.dispatch({
          effects: setColumnAlign.of({ enabled: cfg.enabled, widths: newWidths }),
        });
        onWidthsChange(newWidths);
        pendingWidth = null;
      }
    });
  }
}

// cleanup 中取消 raf
return () => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  // ... existing cleanup
};
```

### 问题 7: 列宽无法持久化（High）

**现状：** `tabColumnWidthsRef` 是内存中的 ref，页面刷新后丢失。

**后果：** 用户精心调整的列宽在关闭重开编辑器后全部重置为 120px。

**修复建议：** 将列宽存入 localStorage，与 `columnAlignEnabled` 一起持久化：

```typescript
// useEditorStore.ts
interface PersistedSettings {
  // ... existing fields
  columnAlignWidths?: Record<string, number[]>; // tabId -> widths
}

// 或者在 saveSettings 中增加
function saveSettings(state: EditorState & EditorActions) {
  // ...
  // 注意：tabColumnWidths 不在 store 中，需要从外部传入或重构
}
```

更简单的方案：在 `CmEditor.tsx` 中直接用 localStorage：

```typescript
const WIDTHS_KEY = 'te2-column-widths';

// 初始化时读取
const tabColumnWidthsRef = useRef<Record<string, number[]>>(() => {
  try {
    return JSON.parse(localStorage.getItem(WIDTHS_KEY) || '{}');
  } catch { return {}; }
}());

// 拖拽回调中保存
const saveWidths = useCallback((widths: number[]) => {
  tabColumnWidthsRef.current[tabId] = widths;
  localStorage.setItem(WIDTHS_KEY, JSON.stringify(tabColumnWidthsRef.current));
}, [tabId]);
```

### 问题 8: 按钮缺少智能启用判断（High）

**现状：** Toolbar 和 StatusBar 的列对齐按钮始终可点击，不判断当前文件是否含 tab。

**后果：** 用户打开不含 tab 的文件（如纯文本、JSON），点击按钮后没有任何变化，会困惑功能是否正常工作。

**修复建议：**

```typescript
// CmEditor.tsx 中增加检测
const hasTabs = view.state.doc.toString().includes('\t');

// 或者通过 store 传递
const [canColumnAlign, setCanColumnAlign] = useState(false);

useEffect(() => {
  const view = viewRef.current;
  if (!view) return;
  setCanColumnAlign(view.state.doc.toString().includes('\t'));
}, [tabId, initialContent]);
```

但注意：文档内容会变化，需要监听 doc changes。更简单的方式是在 `build()` 中检测到 tab 时设置一个 flag。

---

## 4. 建议修复优先级

1. **Critical — Viewport 外失效**：确认是否需要增加 `viewportMargin`
2. **High — 拖拽线不可见**：添加 subtle 默认背景色
3. **High — 拖拽节流**：使用 `requestAnimationFrame` 节流 dispatch
4. **High — 列宽持久化**：localStorage 存储 per-tab 列宽
5. **High — 智能按钮状态**：检测当前文档是否含 tab，无 tab 时按钮 disabled 或提示
6. **Medium — 测试改进**：导出 plugin、增强断言
7. **Low — 快捷键**：为命令面板添加 `Ctrl+Shift+T`
