import { TEAMS_DATA } from '../data/teams.js';
import { getEffectiveScore } from '../engine/effective-score.js';

const TEAM_BY_ID = Object.fromEntries(TEAMS_DATA.map(t => [t.id, t]));

function teamBadge(team) {
  if (team.confirmed) return '';
  return `<span title="Provisional — pending Aug 27 draw" class="ml-1 text-[9px] px-1 py-0.5 rounded bg-gold-500/20 text-gold-600 dark:text-gold-400 font-bold align-middle">TBD</span>`;
}

// Deterministic color per club id — used as the monogram fallback shown
// until/unless a real logo PNG is present at /assets/logos/{id}.png.
function crestColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 55%, 42%)`;
}

// Circular club badge: the real logo (local, same-origin so html2canvas-safe)
// layered over a 3-letter monogram. If the logo is missing the <img> removes
// itself on error and the monogram shows through. Fully inline-styled so it
// renders identically on screen and inside the export.
function teamCrest(team, size = 20) {
  const fontSize = Math.round(size * 0.4);
  const file = team.id.toLowerCase();
  return `<span aria-hidden="true" style="position:relative; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; vertical-align:middle; width:${size}px; height:${size}px; border-radius:50%; overflow:hidden; background:${crestColor(team.id)};">`
    + `<span style="color:#fff; font-size:${fontSize}px; font-weight:700; letter-spacing:-0.02em; line-height:1;">${team.id}</span>`
    + `<img src="/assets/logos/${file}.png" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.remove()" style="position:absolute; inset:0; width:100%; height:100%; object-fit:contain; background:#fff;">`
    + `</span>`;
}

export function renderFixturesList(container, fixtures, activeMatchday, onScoreChange) {
  const currentFixtures = fixtures.filter(f => f.matchday === activeMatchday);

  container.innerHTML = currentFixtures.map(f => {
    const home = TEAM_BY_ID[f.homeId];
    const away = TEAM_BY_ID[f.awayId];
    if (!home || !away) return '';

    const { homeScore, awayScore, source } = getEffectiveScore(f);
    const hVal = homeScore !== null ? homeScore : '';
    const aVal = awayScore !== null ? awayScore : '';

    const isRealUnedited = source === 'real';
    const inputClass = isRealUnedited
      ? "w-9 h-8 bg-gold-500/10 border border-gold-500/50 text-center font-bold text-gold-600 dark:text-gold-400 rounded-lg outline-none text-sm focus:border-pitch-500"
      : "w-9 h-8 bg-ink-900/5 dark:bg-ink-50/5 border border-ink-900/15 dark:border-ink-50/15 focus:border-pitch-500 dark:focus:border-pitch-400 text-center font-bold text-pitch-700 dark:text-pitch-300 rounded-lg outline-none text-sm";
    const badge = isRealUnedited
      ? '<span class="block text-center text-[8px] text-gold-600 dark:text-gold-400 font-bold tracking-wide mt-0.5">OFFICIAL</span>'
      : (source === 'predicted' ? '<span class="block text-center text-[8px] text-pitch-600 dark:text-pitch-300 font-bold tracking-wide mt-0.5">PREDICTED</span>' : '');

    return `
      <div class="fixture-card bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 hover:border-pitch-500/40 p-2.5 rounded-xl flex items-center justify-between text-xs">
        <div class="flex items-center space-x-2 w-5/12 justify-end text-right font-semibold">
          <span class="truncate">${home.name}${teamBadge(home)}</span>
          ${teamCrest(home)}
        </div>

        <div class="flex flex-col items-center w-3/12">
          <div class="flex items-center space-x-1.5 justify-center">
            <input type="number" min="0" max="15" value="${hVal}" data-id="${f.id}" data-side="home"
              class="score-input ${inputClass}" placeholder="0">
            <span class="text-ink-900/30 dark:text-ink-50/30 font-bold">:</span>
            <input type="number" min="0" max="15" value="${aVal}" data-id="${f.id}" data-side="away"
              class="score-input ${inputClass}" placeholder="0">
          </div>
          ${badge}
        </div>

        <div class="flex items-center space-x-2 w-5/12 justify-start font-semibold">
          ${teamCrest(away)}
          <span class="truncate">${teamBadge(away)}${away.name}</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.score-input').forEach(input => {
    // 'input' so the table recalculates live on every keystroke. This is
    // safe (no more lost focus) because a score edit now only re-renders
    // the standings table, never this fixtures list, so the field being
    // typed in is never destroyed mid-edit.
    input.addEventListener('input', (e) => {
      const fid = e.target.dataset.id;
      const side = e.target.dataset.side;
      const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
      onScoreChange(fid, side, val);
    });
  });
}

function zoneStyle(rank, seasonStarted = true) {
  if (!seasonStarted) return { bar: 'bg-ink-900/15 dark:bg-ink-50/15', rank: 'text-ink-900/40 dark:text-ink-50/40' };
  if (rank <= 8) return { bar: 'bg-pitch-500 dark:bg-pitch-400', rank: 'text-pitch-600 dark:text-pitch-300' };
  if (rank <= 24) return { bar: 'bg-blue-500', rank: 'text-blue-600 dark:text-blue-300' };
  return { bar: 'bg-red-500', rank: 'text-red-500 dark:text-red-400' };
}

// Fixed hex version for the export card, which is always rendered on a
// solid white background regardless of the site's current theme, so it
// can't rely on Tailwind's dark: variant.
function zoneStyleHex(rank, seasonStarted = true) {
  if (!seasonStarted) return { bar: '#D1D5DB', rank: '#9CA3AF' };
  if (rank <= 8) return { bar: '#0B6E4F', rank: '#0A5F45' };
  if (rank <= 24) return { bar: '#2563EB', rank: '#1D4ED8' };
  return { bar: '#EF4444', rank: '#DC2626' };
}

export function renderStandingsTable(container, standings, seasonStarted = true) {
  container.innerHTML = standings.map((t, idx) => {
    const rank = idx + 1;
    const z = zoneStyle(rank, seasonStarted);
    const gdFormatted = t.gd > 0 ? `+${t.gd}` : t.gd;

    return `
      <div data-qual-team="${t.id}" role="button" tabindex="0" title="See ${t.name}'s qualification picture" class="flex items-stretch gap-2 py-1 pr-2 rounded-lg cursor-pointer hover:bg-ink-900/5 dark:hover:bg-ink-50/5 transition">
        <span class="zone-bar ${z.bar}"></span>
        <div class="grid grid-cols-12 items-center flex-1 text-xs py-1">
          <div class="col-span-1 text-left font-bold tabular ${z.rank}">${seasonStarted ? rank : '—'}</div>
          <div class="col-span-5 text-left font-medium truncate flex items-center space-x-1.5">
            ${teamCrest(t)}
            <span class="truncate">${t.name}${teamBadge(t)}</span>
          </div>
          <div class="col-span-2 text-center text-ink-900/50 dark:text-ink-50/50 tabular">${t.played}</div>
          <div class="col-span-2 text-center tabular text-[11px]">${gdFormatted}</div>
          <div class="col-span-2 text-center font-extrabold text-pitch-600 dark:text-pitch-300 tabular">${t.points}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// Qualification card — the live "Can your team qualify?" calculator output.
// Mirrors the wording of the static team-page section so the two surfaces
// agree, and reads straight from the deterministic qualification engine.
// ============================================================================

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function qualZoneLine(status, pts, remaining, opts) {
  if (status === 'clinched') return opts.clinched;
  if (status === 'eliminated') return opts.eliminated;
  if (pts !== null && remaining > 0) return opts.guarantee(pts, remaining);
  return opts.possible;
}

function zonePill(status) {
  if (status === 'clinched') return '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-pitch-500/15 text-pitch-700 dark:text-pitch-300">Secured</span>';
  if (status === 'eliminated') return '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400">Out</span>';
  return '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gold-500/20 text-gold-600 dark:text-gold-400">In contention</span>';
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Plain-text, share-friendly one-liner summarising a club's qualification
// verdict (no HTML — this goes into a share sheet / clipboard).
function qualShareText(team, qual) {
  const { remaining, top8, top24, pointsToClinchTop8 } = qual;
  const n = team.name;
  if (top24 === 'eliminated') return `${n} are OUT of the 2026/27 Champions League. 💀 See who's still alive:`;
  if (top8 === 'clinched') return `${n} have SECURED a top-8 finish and a direct place in the Champions League round of 16. ✅`;
  if (top8 === 'eliminated') return `${n} can no longer finish top 8, but can still reach the Champions League knockout play-offs.`;
  if (pointsToClinchTop8 !== null && remaining > 0) return `${n} need ${pointsToClinchTop8} more point${pointsToClinchTop8 === 1 ? '' : 's'} from their last ${remaining} game${remaining === 1 ? '' : 's'} to guarantee a Champions League top-8 spot. Can they do it?`;
  return `Can ${n} finish in the Champions League top 8? I'm predicting the whole league phase 👇`;
}

export function renderQualificationCard(container, team, qual) {
  if (!team || !qual) {
    container.innerHTML = `<p class="text-sm text-ink-900/50 dark:text-ink-50/50 py-2">Choose a club above (or tap any team in the standings) to see whether it can still reach the top 8 — and exactly what it needs.</p>`;
    return;
  }
  const { bestRank, worstRank, remaining, points, played, top8, top24, pointsToClinchTop8, pointsToClinchTop24 } = qual;
  const rankLine = bestRank === worstRank
    ? `Can only finish <strong>${ordinal(bestRank)}</strong> of 36.`
    : `Can still finish anywhere from <strong>${ordinal(bestRank)}</strong> to <strong>${ordinal(worstRank)}</strong> of 36.`;
  const top8Line = qualZoneLine(top8, pointsToClinchTop8, remaining, {
    clinched: 'Secured a direct place in the round of 16.',
    eliminated: `${team.name} can no longer finish in the top 8.`,
    guarantee: (n, r) => `<strong>${n} more point${n === 1 ? '' : 's'}</strong> from the last ${r} game${r === 1 ? '' : 's'} would guarantee it.`,
    possible: 'A top-8 finish is still mathematically possible.',
  });
  const top24Line = qualZoneLine(top24, pointsToClinchTop24, remaining, {
    clinched: 'Guaranteed at least a knockout play-off place.',
    eliminated: `${team.name} is out — cannot finish in the top 24.`,
    guarantee: (n, r) => `<strong>${n} more point${n === 1 ? '' : 's'}</strong> from the last ${r} game${r === 1 ? '' : 's'} would guarantee survival.`,
    possible: 'Avoiding elimination is still mathematically possible.',
  });
  container.innerHTML = `
    <div class="flex items-center gap-2.5 mb-3">
      ${teamCrest(team, 28)}
      <div class="min-w-0">
        <div class="font-display font-bold text-base uppercase leading-none truncate">${team.name}</div>
        <div class="text-[11px] text-ink-900/50 dark:text-ink-50/50 mt-0.5">${points} pts · ${played} played · ${remaining} to play</div>
      </div>
    </div>
    <p class="text-sm mb-3">${rankLine}</p>
    <div class="grid sm:grid-cols-2 gap-2">
      <div class="p-3 rounded-xl bg-ink-900/5 dark:bg-ink-50/5">
        <div class="flex items-center justify-between mb-1"><span class="text-xs font-bold uppercase tracking-wide">Top 8 · Round of 16</span>${zonePill(top8)}</div>
        <p class="text-xs text-ink-900/70 dark:text-ink-50/70">${top8Line}</p>
      </div>
      <div class="p-3 rounded-xl bg-ink-900/5 dark:bg-ink-50/5">
        <div class="flex items-center justify-between mb-1"><span class="text-xs font-bold uppercase tracking-wide">Avoid elimination</span>${zonePill(top24)}</div>
        <p class="text-xs text-ink-900/70 dark:text-ink-50/70">${top24Line}</p>
      </div>
    </div>
    <div class="mt-3 flex items-center gap-2">
      <button data-qual-share data-share-text="${escapeAttr(qualShareText(team, qual))}" class="px-3 py-1.5 rounded-full bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 font-bold text-xs transition inline-flex items-center gap-1.5">
        <span>📤</span><span>Share this verdict</span>
      </button>
      <span data-qual-share-status role="status" aria-live="polite" class="text-[11px] text-pitch-600 dark:text-pitch-300 font-semibold"></span>
    </div>`;
}

// ============================================================================
// Export card — a purpose-built, always-complete, non-scrolling render used
// only for the downloadable/shareable image. It never reads from the live
// scrollable standings panel (which is what caused the old "half cut, only
// visible rows" export bug) and avoids backdrop-blur, which html2canvas
// renders incorrectly — every color here is a flat, solid value.
// ============================================================================

export function renderExportCard(container, standings, meta, seasonStarted = true) {
  const rows = standings.map((t, idx) => {
    const rank = idx + 1;
    const z = zoneStyleHex(rank, seasonStarted);
    const gdFormatted = t.gd > 0 ? `+${t.gd}` : t.gd;
    const rowBg = idx % 2 === 0 ? '#F2F3EE' : '#FFFFFF'; // gray / white zebra striping
    // Pure flexbox (not CSS grid) with align-items:center — html2canvas
    // reliably vertically-centers flex children but mis-aligns grid items.
    return `
      <div style="display:flex; align-items:center; gap:8px; padding:5px 8px 5px 0; background:${rowBg};">
        <span style="width:4px; align-self:stretch; border-radius:3px; flex-shrink:0; background:${z.bar};"></span>
        <div style="width:22px; flex-shrink:0; font-size:12px; font-weight:700; line-height:1.4; color:${z.rank};">${seasonStarted ? rank : '—'}</div>
        <div style="flex:1; min-width:0; display:flex; align-items:center; gap:6px; white-space:nowrap;">${teamCrest(t, 16)}<span style="font-size:12px; font-weight:600; line-height:1.6;">${t.name}</span></div>
        <div style="width:38px; flex-shrink:0; text-align:center; font-size:12px; line-height:1.4; opacity:0.55;">${t.played}</div>
        <div style="width:38px; flex-shrink:0; text-align:center; font-size:12px; line-height:1.4;">${gdFormatted}</div>
        <div style="width:42px; flex-shrink:0; text-align:center; font-size:12px; line-height:1.4; font-weight:800; color:#0B6E4F;">${t.points}</div>
      </div>
    `;
  }).join('');

  const now = new Date();
  const stamp = now.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  // Every text-bearing element below sets an explicit line-height. Without
  // it, html2canvas has been observed to measure certain web fonts
  // (Oswald/Inter here) with a shorter line-box than the glyphs actually
  // need, clipping the top or bottom of every character uniformly across
  // the image — that's the "all rows perfect, all text half cut" bug this
  // fixes. Relying on the browser's default line-height isn't safe inside
  // an html2canvas capture even though it looks fine on-screen normally.
  container.innerHTML = `
    <div class="bg-white text-ink-900" style="font-family:'Inter',sans-serif; line-height:1.4; padding:18px; border-radius:18px; border:2px solid #0B6E4F;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:10px; border-bottom:1px solid #E5E7E0; margin-bottom:8px;">
        <div style="font-family:'Oswald',sans-serif; font-weight:700; line-height:1.4; text-transform:uppercase; font-size:15px;">🏆 36-Team Standings</div>
        <div style="font-size:10px; line-height:1.4; color:#0B6E4F; font-weight:700;">${meta?.subtitle || 'UCL Swiss Phase 2026/27'}</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; font-size:9px; line-height:1.4; font-weight:700; text-transform:uppercase; opacity:0.4; padding:0 8px 4px 0;">
        <span style="width:4px; flex-shrink:0;"></span>
        <div style="width:22px; flex-shrink:0;">#</div>
        <div style="flex:1; min-width:0;">Club</div>
        <div style="width:38px; flex-shrink:0; text-align:center;">PL</div>
        <div style="width:38px; flex-shrink:0; text-align:center;">GD</div>
        <div style="width:42px; flex-shrink:0; text-align:center;">PTS</div>
      </div>
      ${rows}
      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; margin-top:8px; border-top:1px solid #E5E7E0; font-size:9px; line-height:1.4; opacity:0.45;">
        <span>Generated ${stamp} · swissformatsim.com</span>
        <span>Unofficial fan tool — not affiliated with UEFA</span>
      </div>
    </div>
  `;
}
