// ============================================================================
// Shareable-prediction codec
// ============================================================================
// Encodes a user's predicted scores into a short, URL-safe string so a
// prediction can be shared as a link and reopened by anyone.
//
// A prediction is only portable across users if both sides share the SAME
// fixture set — which is true of the real 2026/27 draw (everyone loads the
// same real-results.json) but NOT of the app's random "hypothetical" draw.
// So a fixture is identified by its real, draw-fixed identity
// (matchday, homeId, awayId), never by its runtime `id`, which can differ.
//
// Wire format (bytes, then base64url): [VERSION, idx, packed, idx, packed, …]
//   - idx    = the fixture's position (0-143) in canonical (matchday, home,
//              away) order, shared by encoder and decoder.
//   - packed = (homeScore << 4) | awayScore, so each score is a 0-15 nibble.
// Two bytes per predicted match; a full 144-match table is ~289 bytes ->
// ~386 URL chars, comfortably within browser/URL limits.
// ============================================================================

const VERSION = 1;
const MAX_SCORE = 15; // one nibble; also matches the score input's max

function canonicalOrder(fixtures) {
  return [...fixtures].sort((a, b) =>
    (a.matchday - b.matchday) ||
    a.homeId.localeCompare(b.homeId) ||
    a.awayId.localeCompare(b.awayId));
}

function clampScore(n) {
  return Math.max(0, Math.min(MAX_SCORE, n | 0));
}

function bytesToBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Encodes every user-predicted score in `fixtures` into a URL-safe string.
 * A fixture counts as predicted only when BOTH scores are set. Returns '' when
 * there are no predictions (so callers can skip building an empty link).
 */
export function encodePredictions(fixtures) {
  const ordered = canonicalOrder(fixtures);
  const bytes = [VERSION];
  ordered.forEach((f, i) => {
    if (f.homeScore === null || f.homeScore === undefined) return;
    if (f.awayScore === null || f.awayScore === undefined) return;
    bytes.push(i, (clampScore(f.homeScore) << 4) | clampScore(f.awayScore));
  });
  if (bytes.length === 1) return '';
  return bytesToBase64Url(Uint8Array.from(bytes));
}

/**
 * Decodes a shared code against the current fixture set, returning the scores
 * to apply as [{ id, homeScore, awayScore }]. Unknown/corrupt input yields an
 * empty array rather than throwing, so a bad link never breaks the page.
 */
export function decodePredictions(code, fixtures) {
  if (!code) return [];
  let bytes;
  try { bytes = base64UrlToBytes(code); } catch (e) { return []; }
  if (bytes.length < 3 || bytes[0] !== VERSION) return [];

  const ordered = canonicalOrder(fixtures);
  const out = [];
  for (let i = 1; i + 1 < bytes.length; i += 2) {
    const fixture = ordered[bytes[i]];
    if (!fixture) continue;
    const packed = bytes[i + 1];
    out.push({ id: fixture.id, homeScore: (packed >> 4) & 0xF, awayScore: packed & 0xF });
  }
  return out;
}
