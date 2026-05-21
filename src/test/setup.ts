import '@testing-library/jest-dom/vitest';
import React from 'react';
import { clearAllListeners } from '../hooks/useEditorStatePool';

// Provide React globally for tests using JSX without explicit import
(globalThis as Record<string, unknown>).React = React;

// Ensure localStorage methods exist in jsdom
const store: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const key of Object.keys(store)) delete store[key]; },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length; },
  },
  writable: true,
  configurable: true,
});

// Reset shared global state before each test to prevent cross-test leakage
beforeEach(() => {
  clearAllListeners();
  localStorage.clear();
});
