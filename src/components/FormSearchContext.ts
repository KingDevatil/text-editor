import React from 'react';
import type { JSONPath } from '../utils/jsoncParser';

export interface FormSearchState {
  query: string;
  currentPath: JSONPath | null;
  registerRef: (path: JSONPath, el: HTMLElement | null) => void;
}

export const FormSearchContext = React.createContext<FormSearchState | null>(null);
