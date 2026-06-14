import { desktopApi } from '../platform/desktop';

/** Write text to clipboard using the desktop bridge when available. */
export async function writeClipboard(text: string): Promise<void> {
  try {
    if (desktopApi.isDesktop()) {
      await desktopApi.writeClipboard(text);
      return;
    }
  } catch {
    // Fall through to the browser API.
  }
  navigator.clipboard.writeText(text).catch(() => {});
}

/** Read text from clipboard using the desktop bridge when available. */
export async function readClipboard(): Promise<string> {
  try {
    if (desktopApi.isDesktop()) {
      return await desktopApi.readClipboard();
    }
  } catch {
    // Fall through to the browser API.
  }
  return navigator.clipboard.readText();
}
