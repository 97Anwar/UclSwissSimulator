import { TEAMS_DATA } from '../data/teams.js';
import { getEffectiveScore } from '../engine/effective-score.js';

const TEAM_BY_ID = Object.fromEntries(TEAMS_DATA.map(t => [t.id, t]));

function teamBadge(team) {
  if (team.confirmed) return '';
  return `<span title="Provisional — pending Aug 27 draw" class="ml-1 text-[9px] px-1 py-0.5 rounded bg-gold-500/20 text-gold-600 dark:text-gold-400 font-bold align-middle">TBD</span>`;
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
          <span>${home.country}</span>
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
          <span>${away.country}</span>
          <span class="truncate">${teamBadge(away)}${away.name}</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.score-input').forEach(input => {
    // Deliberately 'change' (fires on blur/Enter, and on each arrow-key
    // press), not 'input' (fires on every keystroke). The previous version
    // used 'input' and rebuilt the whole fixtures list on every keystroke,
    // which fights the browser's native typing and caused digits to not
    // visibly appear until a second field was touched. Recalculating only
    // once the user leaves the field avoids that entirely, and matches the
    // "type freely, then click away to see it calculate" behavior asked for.
    input.addEventListener('change', (e) => {
      const fid = e.target.dataset.id;
      const side = e.target.dataset.side;
      const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
      onScoreChange(fid, side, val);
    });
  });
}

function zoneStyle(rank) {
  if (rank <= 8) return { bar: 'bg-pitch-500 dark:bg-pitch-400', rank: 'text-pitch-600 dark:text-pitch-300' };
  if (rank <= 24) return { bar: 'bg-blue-500', rank: 'text-blue-600 dark:text-blue-300' };
  return { bar: 'bg-red-500', rank: 'text-red-500 dark:text-red-400' };
}

// Fixed hex version for the export card, which is always rendered on a
// solid white background regardless of the site's current theme, so it
// can't rely on Tailwind's dark: variant.
function zoneStyleHex(rank) {
  if (rank <= 8) return { bar: '#0B6E4F', rank: '#0A5F45' };
  if (rank <= 24) return { bar: '#2563EB', rank: '#1D4ED8' };
  return { bar: '#EF4444', rank: '#DC2626' };
}

export function renderStandingsTable(container, standings) {
  container.innerHTML = standings.map((t, idx) => {
    const rank = idx + 1;
    const z = zoneStyle(rank);
    const gdFormatted = t.gd > 0 ? `+${t.gd}` : t.gd;

    return `
      <div class="flex items-stretch gap-2 py-1 pr-2 rounded-lg hover:bg-ink-900/5 dark:hover:bg-ink-50/5 transition">
        <span class="zone-bar ${z.bar}"></span>
        <div class="grid grid-cols-12 items-center flex-1 text-xs py-1">
          <div class="col-span-1 text-left font-bold tabular ${z.rank}">${rank}</div>
          <div class="col-span-5 text-left font-medium truncate flex items-center space-x-1.5">
            <span>${t.country}</span>
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
// Export card — a purpose-built, always-complete, non-scrolling render used
// only for the downloadable/shareable image. It never reads from the live
// scrollable standings panel (which is what caused the old "half cut, only
// visible rows" export bug) and avoids backdrop-blur, which html2canvas
// renders incorrectly — every color here is a flat, solid value.
// ============================================================================

export function renderExportCard(container, standings, meta) {
  const rows = standings.map((t, idx) => {
    const rank = idx + 1;
    const z = zoneStyleHex(rank);
    const gdFormatted = t.gd > 0 ? `+${t.gd}` : t.gd;
    return `
      <div style="display:flex; align-items:stretch; gap:8px; padding:4px 8px 4px 0;">
        <span style="width:4px; border-radius:3px; flex-shrink:0; background:${z.bar};"></span>
        <div style="display:grid; grid-template-columns: 24px 1fr 40px 40px 44px; align-items:center; flex:1; font-size:12px; line-height:1.4;">
          <div style="font-weight:700; line-height:1.4; color:${z.rank};">${rank}</div>
          <div style="font-weight:600; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t.country} ${t.name}</div>
          <div style="text-align:center; line-height:1.4; opacity:0.55;">${t.played}</div>
          <div style="text-align:center; line-height:1.4;">${gdFormatted}</div>
          <div style="text-align:center; line-height:1.4; font-weight:800; color:#0B6E4F;">${t.points}</div>
        </div>
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
      <div style="display:grid; grid-template-columns: 24px 1fr 40px 40px 44px; font-size:9px; line-height:1.4; font-weight:700; text-transform:uppercase; opacity:0.4; padding:0 0 4px 12px;">
        <div>#</div><div>Club</div><div style="text-align:center;">PL</div><div style="text-align:center;">GD</div><div style="text-align:center;">PTS</div>
      </div>
      ${rows}
      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; margin-top:8px; border-top:1px solid #E5E7E0; font-size:9px; line-height:1.4; opacity:0.45;">
        <span>Generated ${stamp} · ucl-swiss-simulator</span>
        <span>Unofficial fan tool — not affiliated with UEFA</span>
      </div>
    </div>
  `;
}
