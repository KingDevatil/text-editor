# Column Align Feature - Code Review Summary

## 1. Overall Assessment

The column alignment feature is implemented using a correct CodeMirror 6 architecture:
- `StateField` + `StateEffect` for configuration state
- `ViewPlugin` + `WidgetType` for visual tab-to-spacer replacement
- `Compartment`-based dynamic reconfiguration in `CmEditor.tsx`
- Zustand store integration with localStorage persistence for the toggle state

**Test Coverage:** 8/8 tests pass. Lint clean on new files.

**Main Concerns:**
1. Reliance on CM6 internal DOM selectors (`.cm-content`) and `view.dom` instead of public APIs (`view.contentDOM`, `view.scrollDOM`)
2. Column widths are not isolated per-tab; switching tabs resets widths
3. The `columnAlignEnabled` effect in `CmEditor.tsx` re-runs on `tabId` change, causing unnecessary drag layer teardown/rebuild

---

## 2. Prioritized Fix List

### Critical
_None identified. The feature is functionally correct and safe to use._

### Medium

| # | File | Issue | Impact |
|---|------|-------|--------|
| 1 | `columnAlign.ts:173` | Uses `container.querySelector('.cm-content')` to get content DOM. This relies on CM6 internal class names and may break on upgrades. | Fragile DOM access |
| 2 | `columnAlign.ts:239` | Uses `view.dom.addEventListener('scroll', ...)` instead of `view.scrollDOM`. `view.dom` is the outer wrapper; the actual scrollable element is `view.scrollDOM`. | Scroll events may not fire correctly in all CM6 configurations |
| 3 | `CmEditor.tsx:739-774` | The `useEffect` for column align has `[columnAlignEnabled, tabId]` as dependencies. Switching tabs triggers teardown and rebuild of the drag layer even when `columnAlignEnabled` hasn't changed. | Unnecessary drag layer flicker/rebuild on tab switch |
| 4 | `CmEditor.tsx:750-764` | Column widths (`widths: []`) are reset on every enable. No per-tab width persistence. | User loses manual width adjustments when switching tabs |

### Low

| # | File | Issue | Suggestion |
|---|------|-------|------------|
| 1 | `columnAlign.ts:166` | `line.text.match(/\t/g)` creates a new RegExp on every call | Extract `const TAB_REGEX = /\t/g` as a constant |
| 2 | `columnAlign.test.ts:23` | Tests access `columnAlignExtension[2]` by array index | Export `columnAlignPlugin` directly and reference it by name |
| 3 | `columnAlign.test.ts:119-124` | "respects minimum column width" test only asserts `decorations` is defined, not that width was clamped | Add assertion on widget width or spacer DOM width |
| 4 | `columnAlign.ts:110` | `COL_PADDING = 16` has no comment explaining its purpose | Add comment: spacing between column content and the drag handle |

---

## 3. Code Patches for Medium-Severity Issues

### Patch 1: Use `view.contentDOM` instead of `querySelector('.cm-content')`

**File:** `src/utils/columnAlign.ts`
**Lines:** 172-174

```typescript
// BEFORE:
const contentRect = container.querySelector('.cm-content')?.getBoundingClientRect();
if (!contentRect) return;

let cumulativeX = contentRect.left - container.getBoundingClientRect().left;

// AFTER:
const contentRect = view.contentDOM.getBoundingClientRect();

let cumulativeX = contentRect.left - container.getBoundingClientRect().left;
```

`view.contentDOM` is the public CM6 API for accessing the editable content element. It is stable across versions and does not rely on internal CSS class names.

---

### Patch 2: Use `view.scrollDOM` for scroll events

**File:** `src/utils/columnAlign.ts`
**Lines:** 239, 244

```typescript
// BEFORE (line 239):
view.dom.addEventListener('scroll', updateHandler);

// BEFORE (line 244):
view.dom.removeEventListener('scroll', updateHandler);

// AFTER (line 239):
view.scrollDOM.addEventListener('scroll', updateHandler);

// AFTER (line 244):
view.scrollDOM.removeEventListener('scroll', updateHandler);
```

`view.scrollDOM` is the publicly exposed scrollable container in CM6. `view.dom` is the outer wrapper which may or may not be the scrollable element depending on configuration.

---

### Patch 3: Split `columnAlignEnabled` effect to avoid tab-switch rebuild

**File:** `src/components/CmEditor.tsx`
**Lines:** 739-774

```typescript
// BEFORE:
const dragLayerCleanupRef = useRef<(() => void) | null>(null);
useEffect(() => {
  const view = viewRef.current;
  if (!view) return;
  view.dispatch({
    effects: columnAlignCompartment.reconfigure(
      columnAlignEnabled ? columnAlignExtension : []
    ),
  });
  if (columnAlignEnabled) {
    view.dispatch({
      effects: setColumnAlign.of({ enabled: true, widths: [] }),
    });
  }
  setEditorState(tabId, view.state);

  const container = containerRef.current;
  if (columnAlignEnabled && container && view) {
    dragLayerCleanupRef.current = createColumnDragLayer(container, view, (widths) => {
      view.dispatch({
        effects: setColumnAlign.of({ enabled: true, widths }),
      });
    });
  } else {
    dragLayerCleanupRef.current?.();
    dragLayerCleanupRef.current = null;
  }

  return () => {
    dragLayerCleanupRef.current?.();
    dragLayerCleanupRef.current = null;
  };
}, [columnAlignEnabled, tabId]);

// AFTER:
const dragLayerCleanupRef = useRef<(() => void) | null>(null);
const tabColumnWidthsRef = useRef<Record<string, number[]>>({});

// Effect 1: Handle compartment reconfiguration when toggle changes
useEffect(() => {
  const view = viewRef.current;
  if (!view) return;
  view.dispatch({
    effects: columnAlignCompartment.reconfigure(
      columnAlignEnabled ? columnAlignExtension : []
    ),
  });
  if (columnAlignEnabled) {
    const savedWidths = tabColumnWidthsRef.current[tabId] || [];
    view.dispatch({
      effects: setColumnAlign.of({ enabled: true, widths: savedWidths }),
    });
  }
  setEditorState(tabId, view.state);
}, [columnAlignEnabled, tabId]);

// Effect 2: Manage drag layer lifecycle separately
useEffect(() => {
  const view = viewRef.current;
  const container = containerRef.current;
  if (!view || !container) return;

  if (columnAlignEnabled) {
    dragLayerCleanupRef.current = createColumnDragLayer(container, view, (widths) => {
      tabColumnWidthsRef.current[tabId] = widths;
      view.dispatch({
        effects: setColumnAlign.of({ enabled: true, widths }),
      });
    });
  } else {
    dragLayerCleanupRef.current?.();
    dragLayerCleanupRef.current = null;
  }

  return () => {
    dragLayerCleanupRef.current?.();
    dragLayerCleanupRef.current = null;
  };
}, [columnAlignEnabled, tabId]);
```

**Rationale:**
- Separates compartment reconfiguration (cheap) from drag layer DOM manipulation (expensive)
- `tabColumnWidthsRef` caches per-tab widths so switching tabs preserves user adjustments
- Both effects still cleanup on unmount or dependency change, but the separation makes the intent clearer

---

## 4. Files Reviewed

| File | Lines | Notes |
|------|-------|-------|
| `src/utils/columnAlign.ts` | 250 | Core CM6 extension |
| `src/utils/columnAlign.test.ts` | 149 | Unit tests |
| `src/components/CmEditor.tsx` | 1025 | Editor component with compartment integration |
| `src/hooks/useEditorStore.ts` | 528 | Zustand store with persistence |
| `src/components/Toolbar.tsx` | 199 | Toolbar toggle button |
| `src/components/StatusBar.tsx` | 339 | Status bar indicator |
| `src/components/SettingsPanel.tsx` | 366 | Settings panel toggle |
| `src/App.tsx` | 975 | App-level wiring and command palette |
