// src/lib/clipboard.js - the ONE place clipboard writes happen.
//
// Every "Copy" button in the app used to call navigator.clipboard.writeText
// without awaiting it or checking the result, then show "Copied!" no matter
// what happened. A browser that blocks or fails the write (no secure context,
// permission denied, an iframe without the clipboard-write feature, an older
// WebView) left the button lying to the donor or nonprofit admin. copyText()
// resolves to a real true/false so every call site can show an honest result,
// with a textarea+execCommand fallback for browsers with no Clipboard API.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error('clipboard api unavailable');
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
