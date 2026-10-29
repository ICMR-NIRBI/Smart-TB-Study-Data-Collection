/**
 * Copies text to the clipboard. `navigator.clipboard` only exists on HTTPS pages, and the app runs on plain
 * HTTP until a domain is set up, so this falls back to the older select-and-copy route. Returns false if both fail.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the older route */
    }
  }

  // Put the textarea next to the button that was tapped, so a dialog's focus trap does not reject it.
  const host = document.activeElement?.parentElement ?? document.body;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px';
  host.appendChild(area);
  const previous = document.activeElement as HTMLElement | null;
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    host.removeChild(area);
    previous?.focus?.();
  }
}
