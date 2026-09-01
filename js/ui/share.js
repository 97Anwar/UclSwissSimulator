// ============================================================================
// Sharing the exported standings image
// ============================================================================
// Reality check on what's actually possible: most social platforms' web
// "share intent" URLs (twitter.com/intent/tweet, wa.me, reddit.com/submit)
// only accept text + a link — they do NOT accept an arbitrary image by URL,
// for security reasons, and we have no server to upload the image to for a
// public URL to hand them.
//
// The one thing that DOES let you attach the actual image file is the
// browser's native Web Share API (navigator.share with a `files` array) —
// supported on most mobile browsers (Chrome/Safari on Android/iOS) and some
// desktop browsers. Where it's available, this opens the OS share sheet
// with the image genuinely attached, and the person picks WhatsApp/X/
// Instagram/etc. from there.
//
// Where it's NOT available (most desktop browsers), we show no share button
// at all and let the "Download PNG" action carry sharing — the user saves
// the image and posts it manually. We don't fake per-platform "share" links
// that can't actually attach the image.
// ============================================================================

const SHARE_TEXT = 'My UEFA Champions League Swiss-phase predicted table 👇';

export function canShareFiles() {
  return !!(navigator.canShare && navigator.share);
}

export async function shareViaWebShareAPI(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (!navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({
      files: [file],
      title: 'UCL Swiss Phase Standings',
      text: SHARE_TEXT,
    });
    return true;
  } catch (e) {
    if (e.name === 'AbortError') return true; // user cancelled the share sheet, not an error
    console.warn('Web Share API failed:', e);
    return false;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Renders the single native "Share Image…" button, which attaches the actual
 * PNG via the Web Share API so the OS share sheet offers every installed app
 * (WhatsApp, X, Instagram, Telegram, …). Where file-sharing isn't supported
 * (most desktop browsers) nothing is rendered — "Download PNG" covers it.
 * `getImageBlob` is called lazily (only on click) so the export card isn't
 * rebuilt until needed.
 */
export function renderShareButtons(container, getImageBlob) {
  if (!container) return;

  if (!canShareFiles()) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <button id="btn-native-share" class="w-full px-4 py-2.5 rounded-full border-2 border-pitch-500 dark:border-pitch-400 text-pitch-600 dark:text-pitch-300 hover:bg-pitch-500/10 dark:hover:bg-pitch-400/10 font-bold text-sm transition flex items-center justify-center gap-2">
      <span>📤</span><span>Share Image…</span>
    </button>
  `;

  const btn = container.querySelector('#btn-native-share');
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('opacity-70', 'cursor-wait');
    btn.innerHTML = '<span>⏳</span><span>Preparing…</span>';
    try {
      const blob = await getImageBlob();
      if (!blob) { showToast(container, "Couldn't generate the image — please try again."); return; }
      const ok = await shareViaWebShareAPI(blob, 'ucl-swiss-standings.png');
      if (!ok) downloadBlob(blob, 'ucl-swiss-standings.png'); // sharing itself failed — at least save the file
    } catch (e) {
      console.error('Share failed:', e);
      showToast(container, "Couldn't share the image — please try again.");
    } finally {
      btn.disabled = false;
      btn.classList.remove('opacity-70', 'cursor-wait');
      btn.innerHTML = original;
    }
  });
}

function showToast(container, message) {
  const toast = document.createElement('div');
  toast.className = 'mt-2 text-[11px] text-ink-900/60 dark:text-ink-50/60 bg-ink-900/5 dark:bg-ink-50/5 rounded-lg px-2.5 py-1.5';
  toast.textContent = message;
  container.parentElement.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}
