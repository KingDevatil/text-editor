import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import ThemeEditor from './ThemeEditor';
import { useSettingsStore } from '../hooks/useSettingsStore';

describe('ThemeEditor', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      theme: 'light',
      lightCustomColors: {},
      darkCustomColors: {},
      customColors: {},
      customSyntaxHighlight: 'auto',
    });
  });

  it('defers color picker commits until editing finishes', () => {
    render(<ThemeEditor onClose={vi.fn()} />);

    const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorInput).toBeInTheDocument();

    fireEvent.input(colorInput, { target: { value: '#123456' } });

    expect(colorInput.value).toBe('#123456');
    expect(useSettingsStore.getState().lightCustomColors.bgPrimary).toBeUndefined();

    fireEvent.blur(colorInput);

    expect(useSettingsStore.getState().lightCustomColors.bgPrimary).toBe('#123456');
  });

  it('updates custom syntax highlighting from the custom tab', () => {
    render(<ThemeEditor onClose={vi.fn()} />);

    fireEvent.click(document.querySelectorAll('button')[3]);
    fireEvent.click(document.querySelector('input[value="dark"]') as HTMLInputElement);

    expect(useSettingsStore.getState().customSyntaxHighlight).toBe('dark');
  });
});
