/** Write text to clipboard — uses Tauri plugin in desktop, falls back to navigator API in browser. */
export async function writeClipboard(text: string): Promise<void> {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    if (isTauri()) {
      try {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(text);
        return;
      } catch {
        // fall through to navigator API
      }
    }
  } catch {
    // module load error (e.g. tests) — fall through
  }
  navigator.clipboard.writeText(text).catch(() => {});
}

/** Read text from clipboard — uses Tauri plugin in desktop, falls back to navigator API in browser. */
export async function readClipboard(): Promise<string> {
  try {
    const { isTauri } = await import('@tauri-apps/api/core');
    if (isTauri()) {
      try {
        const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
        return await readText();
      } catch {
        // fall through to navigator API
      }
    }
  } catch {
    // module load error (e.g. tests) — fall through
  }
  return navigator.clipboard.readText();
}
