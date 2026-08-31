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
// Where it's NOT available (most desktop browsers), we fall back honestly:
// download the image, and open a platform intent pre-filled with text and
// a link, with a clear note that the image needs to be attached manually.
// We do not pretend this fallback attaches the image — that would be a
// silent lie about what the button does.
// ============================================================================

const SITE_URL = 'https://swissformatsim.com';
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

const PLATFORM_INTENTS = {
  x: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  whatsapp: (text, url) => `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`,
  reddit: (text, url) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  facebook: (text, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
};

/**
 * Renders the share button row. `getImageBlob` is called lazily (only when
 * a button is clicked) so we don't re-render the export card until needed.
 */
export function renderShareButtons(container, getImageBlob) {
  const buttons = [
    { key: 'x', label: 'X', icon: '𝕏' },
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
    { key: 'reddit', label: 'Reddit', icon: '👽' },
    { key: 'facebook', label: 'Facebook', icon: '📘' },
  ];

  container.innerHTML = buttons.map(b => `
    <button data-platform="${b.key}" class="share-btn px-3 py-1.5 rounded-full border border-ink-900/15 dark:border-ink-50/15 hover:bg-ink-900/5 dark:hover:bg-ink-50/10 text-xs font-semibold transition flex items-center gap-1.5">
      <span>${b.icon}</span><span>${b.label}</span>
    </button>
  `).join('') + `
    <button id="btn-native-share" class="share-btn px-3 py-1.5 rounded-full bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 text-xs font-bold transition flex items-center gap-1.5 ${canShareFiles() ? '' : 'hidden'}">
      <span>📤</span><span>Share Image</span>
    </button>
  `;

  const nativeBtn = container.querySelector('#btn-native-share');
  if (nativeBtn) {
    nativeBtn.addEventListener('click', async () => {
      const blob = await getImageBlob();
      if (!blob) return;
      const ok = await shareViaWebShareAPI(blob, 'ucl-swiss-standings.png');
      if (!ok) downloadBlob(blob, 'ucl-swiss-standings.png'); // last-resort fallback
    });
  }

  container.querySelectorAll('.share-btn[data-platform]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const platform = btn.dataset.platform;
      const blob = await getImageBlob();
      if (blob) downloadBlob(blob, 'ucl-swiss-standings.png');
      const intentUrl = PLATFORM_INTENTS[platform](SHARE_TEXT, SITE_URL);
      window.open(intentUrl, '_blank', 'noopener,noreferrer');
      if (blob) {
        showToast(container, 'Image downloaded — attach it to your post (most platforms don\'t accept images via link).');
      }
    });
  });
}

function showToast(container, message) {
  const toast = document.createElement('div');
  toast.className = 'mt-2 text-[11px] text-ink-900/60 dark:text-ink-50/60 bg-ink-900/5 dark:bg-ink-50/5 rounded-lg px-2.5 py-1.5';
  toast.textContent = message;
  container.parentElement.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}
