import { useEffect, type RefObject } from 'react';
import { create } from 'zustand';
import type { SearchQuery } from '../utils/searchHighlight';

interface MarkdownSearchState {
  query: SearchQuery | null;
  direction: 1 | -1;
  sequence: number;
  matchCount: number;
  currentMatch: number;
  setQuery: (query: SearchQuery | null) => void;
  findNext: () => void;
  findPrevious: () => void;
  setResult: (matchCount: number, currentMatch: number) => void;
}

export const useMarkdownSearchStore = create<MarkdownSearchState>((set) => ({
  query: null,
  direction: 1,
  sequence: 0,
  matchCount: 0,
  currentMatch: 0,
  setQuery: (query) => set({ query, direction: 1, sequence: 0, matchCount: 0, currentMatch: 0 }),
  findNext: () => set((state) => ({
    direction: 1,
    sequence: state.sequence + 1,
    currentMatch: state.matchCount > 0 ? (state.currentMatch % state.matchCount) + 1 : 0,
  })),
  findPrevious: () => set((state) => ({
    direction: -1,
    sequence: state.sequence + 1,
    currentMatch: state.matchCount > 0
      ? ((state.currentMatch + state.matchCount - 2) % state.matchCount) + 1
      : 0,
  })),
  setResult: (matchCount, currentMatch) => set({ matchCount, currentMatch }),
}));

interface MarkdownMatch {
  mark: HTMLElement;
}

function clearHighlights(container: HTMLElement) {
  const marks = Array.from(container.querySelectorAll<HTMLElement>('mark.markdown-search-match'));
  for (const mark of marks) {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ''));
  }
  container.normalize();
}

function createMatcher(query: SearchQuery): RegExp | null {
  if (!query.query) return null;
  try {
    if (query.regexMode) {
      return new RegExp(query.query, query.caseSensitive ? 'g' : 'gi');
    }
    return new RegExp(escapeRegExp(query.query), query.caseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

function collectTextNodes(container: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue) return NodeFilter.FILTER_REJECT;
      if (parent.closest('script, style, textarea, input, mark.markdown-search-match')) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function highlightMatches(container: HTMLElement, query: SearchQuery): MarkdownMatch[] {
  const matcher = createMatcher(query);
  if (!matcher) return [];

  const textNodes = collectTextNodes(container);
  const matches: MarkdownMatch[] = [];

  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? '';
    const fragments: Array<string | HTMLElement> = [];
    let lastIndex = 0;
    matcher.lastIndex = 0;

    for (let match = matcher.exec(text); match; match = matcher.exec(text)) {
      const matchedText = match[0];
      if (!matchedText) {
        matcher.lastIndex++;
        continue;
      }

      if (match.index > lastIndex) {
        fragments.push(text.slice(lastIndex, match.index));
      }

      const mark = document.createElement('mark');
      mark.className = 'markdown-search-match';
      mark.textContent = matchedText;
      fragments.push(mark);
      matches.push({ mark });
      lastIndex = match.index + matchedText.length;
    }

    if (fragments.length === 0) continue;
    if (lastIndex < text.length) {
      fragments.push(text.slice(lastIndex));
    }
    textNode.replaceWith(
      ...fragments.map((fragment) => (
        typeof fragment === 'string' ? document.createTextNode(fragment) : fragment
      ))
    );
  }

  return matches;
}

function setActiveMatch(matches: MarkdownMatch[], index: number) {
  matches.forEach((match, matchIndex) => {
    match.mark.classList.toggle('markdown-search-match-active', matchIndex === index);
  });
  matches[index]?.mark.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function useMarkdownDocumentSearch(containerRef: RefObject<HTMLElement | null>, contentKey: string, enabled = true) {
  const query = useMarkdownSearchStore((state) => state.query);
  const direction = useMarkdownSearchStore((state) => state.direction);
  const sequence = useMarkdownSearchStore((state) => state.sequence);
  const setResult = useMarkdownSearchStore((state) => state.setResult);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    clearHighlights(container);
    if (!query?.query) {
      setResult(0, 0);
      return;
    }

    const matches = highlightMatches(container, query);
    if (matches.length === 0) {
      setResult(0, 0);
      return () => clearHighlights(container);
    }

    const initialDirection = useMarkdownSearchStore.getState().direction;
    const nextIndex = initialDirection === -1 ? matches.length - 1 : 0;
    setActiveMatch(matches, nextIndex);
    setResult(matches.length, nextIndex + 1);

    return () => clearHighlights(container);
  }, [containerRef, contentKey, enabled, query, setResult]);

  useEffect(() => {
    if (!enabled || !query?.query || sequence === 0) return;
    const container = containerRef.current;
    if (!container) return;
    let marks = Array.from(container.querySelectorAll<HTMLElement>('mark.markdown-search-match'));
    if (marks.length === 0) {
      highlightMatches(container, query);
      marks = Array.from(container.querySelectorAll<HTMLElement>('mark.markdown-search-match'));
      if (marks.length === 0) {
        setResult(0, 0);
        return;
      }
    }

    const currentIndex = Math.max(0, marks.findIndex((mark) => mark.classList.contains('markdown-search-match-active')));
    const nextIndex = (currentIndex + direction + marks.length) % marks.length;
    marks.forEach((mark, index) => {
      mark.classList.toggle('markdown-search-match-active', index === nextIndex);
    });
    marks[nextIndex].scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    setResult(marks.length, nextIndex + 1);
  }, [containerRef, direction, enabled, query, sequence, setResult]);
}
