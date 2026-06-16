import { hoverTooltip, type Tooltip } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import { useSettingsStore, type CustomColorFormat } from '../hooks/useSettingsStore';

/**
 * Lightweight hover tooltip showing the word/token under cursor.
 * For JSON, also shows the path to the hovered key/value.
 */
/** Check if token is a hex color value and return normalized hex if valid. */
function detectHexColor(token: string): string | null {
  const match = token.match(/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!match) return null;

  const hex = match[1];
  // Normalize short hex to 6-digit
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  if (hex.length === 4) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return token.toLowerCase();
}

/** Check if token matches a custom color format and return normalized hex if valid. */
function detectCustomColor(token: string, format: CustomColorFormat): string | null {
  try {
    const regex = new RegExp(format.pattern);
    const match = token.match(regex);
    if (!match) return null;

    const extractGroup = format.extractGroup ?? 1;
    const hexValue = match[extractGroup];
    if (!hexValue) return null;

    // Normalize the hex value to 6-digit format
    const hex = hexValue.replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex)) {
      return `#${hex.toLowerCase()}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** Scan the line for custom color format matches around the cursor position. */
function findCustomColorMatch(view: EditorView, pos: number): { color: string; from: number; to: number; token: string } | null {
  const settings = useSettingsStore.getState();
  const formats = settings.customColorFormats.filter((f) => f.enabled);
  if (formats.length === 0) return null;

  const line = view.state.doc.lineAt(pos);
  const lineText = line.text;

  for (const format of formats) {
    try {
      const regex = new RegExp(format.pattern, 'g');
      let match;
      while ((match = regex.exec(lineText)) !== null) {
        const matchStart = line.from + match.index;
        const matchEnd = matchStart + match[0].length;
        if (pos >= matchStart && pos <= matchEnd) {
          const color = detectCustomColor(match[0], format);
          if (color) {
            return {
              color,
              from: matchStart,
              to: matchEnd,
              token: match[0],
            };
          }
        }
      }
    } catch {
      // Skip invalid regex patterns
    }
  }
  return null;
}

function buildTooltip(view: EditorView, pos: number): Tooltip | null {
  // First check for custom color formats
  const customColorMatch = findCustomColorMatch(view, pos);
  if (customColorMatch) {
    return {
      pos: customColorMatch.from,
      end: customColorMatch.to,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className = 'cm-hover-tooltip';
        dom.innerHTML = `
          <div class="flex items-center gap-2">
            <div style="width: 24px; height: 24px; border-radius: 4px; background-color: ${customColorMatch.color}; border: 1px solid rgba(128,128,128,0.3);"></div>
            <div>
              <div class="font-mono text-xs">${escapeHtml(customColorMatch.token)}</div>
              <div class="text-[10px] opacity-60">color</div>
            </div>
          </div>
        `;
        return { dom };
      },
    };
  }

  const word = view.state.wordAt(pos);
  if (!word || word.from === word.to) return null;

  let token = view.state.doc.sliceString(word.from, word.to);
  let startPos = word.from;
  let endPos = word.to;
  const line = view.state.doc.lineAt(pos);

  // Expand token to include leading # for hex colors (e.g., #ffea00)
  if (/^[0-9a-fA-F]+$/.test(token) && word.from > line.from) {
    const charBefore = view.state.doc.sliceString(word.from - 1, word.from);
    if (charBefore === '#') {
      startPos = word.from - 1;
      token = '#' + token;
    }
  }

  // Also handle cursor directly on the # character
  const charAtPos = view.state.doc.sliceString(pos, pos + 1);
  if (charAtPos === '#') {
    let hexEnd = pos + 1;
    while (hexEnd < line.to && /[0-9a-fA-F]/.test(view.state.doc.sliceString(hexEnd, hexEnd + 1))) {
      hexEnd++;
    }
    if (hexEnd > pos + 1) {
      startPos = pos;
      endPos = hexEnd;
      token = view.state.doc.sliceString(startPos, endPos);
    }
  }

  // Check for hex color values
  const hexColor = detectHexColor(token);
  if (hexColor) {
    return {
      pos: startPos,
      end: endPos,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className = 'cm-hover-tooltip';
        dom.innerHTML = `
          <div class="flex items-center gap-2">
            <div style="width: 24px; height: 24px; border-radius: 4px; background-color: ${hexColor}; border: 1px solid rgba(128,128,128,0.3);"></div>
            <div>
              <div class="font-mono text-xs">${escapeHtml(token)}</div>
              <div class="text-[10px] opacity-60">color</div>
            </div>
          </div>
        `;
        return { dom };
      },
    };
  }

  // Simple type inference for display
  let typeLabel = 'identifier';
  const lang = (view.state.facet as unknown as { language?: { name: string } })?.language?.name || '';

  if (lang.includes('json')) {
    // Try to build a simple path for JSON
    const path = buildJsonPath(view, pos);
    if (path) {
      return {
        pos: word.from,
        end: word.to,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-hover-tooltip';
          dom.innerHTML = `<div class="font-mono text-xs">${escapeHtml(token)}</div><div class="text-[10px] opacity-70 mt-0.5">${escapeHtml(path)}</div>`;
          return { dom };
        },
      };
    }
  }

  // Detect common patterns
  const lineText = line.text;
  if (/^\s*(const|let|var)\s+/.test(lineText) && lineText.indexOf(token) > lineText.indexOf('const')) {
    typeLabel = 'variable';
  } else if (/^\s*(function)\s+/.test(lineText)) {
    typeLabel = 'function';
  } else if (/^\s*(import)\s+/.test(lineText)) {
    typeLabel = 'module';
  } else if (/^\s*(class)\s+/.test(lineText)) {
    typeLabel = 'class';
  }

  return {
    pos: word.from,
    end: word.to,
    above: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-hover-tooltip';
      dom.innerHTML = `<span class="font-mono text-xs">${escapeHtml(token)}</span><span class="text-[10px] opacity-60 ml-1.5">${typeLabel}</span>`;
      return { dom };
    },
  };
}

/**
 * Walk backwards to build a crude JSON path like `root.arr[0].key`.
 */
function buildJsonPath(view: EditorView, pos: number): string | null {
  const doc = view.state.doc;
  const currentLine = doc.lineAt(pos).number;
  const parts: string[] = [];

  // Find the key on the current line (if any)
  const line = doc.line(currentLine);
  const keyMatch = line.text.match(/"([^"]+)"\s*:/);
  if (keyMatch) {
    parts.unshift(keyMatch[1]);
  }

  // Walk up to find parent contexts
  let bracketDepth = 0;
  for (let i = line.from - 1; i >= 0; i--) {
    const ch = doc.sliceString(i, i + 1);
    if (ch === '}' || ch === ']') bracketDepth++;
    else if (ch === '{' || ch === '[') {
      if (bracketDepth === 0) {
        if (ch === '[') {
          // Count commas between this [ and the target line,
          // but only at depth 0 (ignore commas inside nested objects/arrays)
          let commaCount = 0;
          let nestedDepth = 0;
          for (let j = i + 1; j < pos; j++) {
            const c = doc.sliceString(j, j + 1);
            if (c === '{' || c === '[') nestedDepth++;
            else if (c === '}' || c === ']') nestedDepth--;
            else if (c === ',' && nestedDepth === 0) commaCount++;
          }
          parts.unshift(`[${commaCount}]`);
        }
        // Look for key on the line containing this {
        const parentLine = doc.lineAt(i);
        const parentKey = parentLine.text.match(/"([^"]+)"\s*:/);
        if (parentKey) {
          parts.unshift(parentKey[1]);
        }
      } else {
        bracketDepth--;
      }
    }
  }

  if (parts.length === 0) return null;
  return parts.join('.');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * CM6 hover tooltip extension.
 */
export const hoverInfo = hoverTooltip(
  (view, pos) => {
    return buildTooltip(view, pos);
  },
  {
    hideOnChange: true,
    hoverTime: 400, // ms before tooltip appears
  }
);
