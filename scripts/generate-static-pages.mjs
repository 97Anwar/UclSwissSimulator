#!/usr/bin/env node
// ============================================================================
// Static page generator — matchday pages, team pages, and the scenario
// summaries embedded in each.
// ============================================================================
// Runs in the same GitHub Action as fetch-results.mjs, right after it, so
// generated pages are always built from the latest synced real data. Does
// NOT run in the browser — this is a build step, not client-side code.
//
// Design decisions worth knowing about:
//
// - Pages are only generated once REAL fixtures exist. The 27 Aug 2026
//   pot draw is complete, but the specific matchday-by-matchday schedule
//   was still pending publication as of this update — this script simply
//   starts generating pages the first time the sync job finds real
//   fixtures with matchday numbers attached, no code change needed.
//   Hypothetical-mode draws are random per visitor and per session, so
//   pre-rendering one for SEO would be actively misleading — a crawler
//   would index one random draw as if it were canonical. If
//   real-results.json still has zero fixtures, this script logs why and
//   exits cleanly rather than generating anything.
//
// - Scenario text is deliberately conservative. It states facts directly
//   computable from the standings (current rank, zone, points, next
//   opponent) rather than claiming things like "a win guarantees top 8,"
//   which would require simulating every remaining permutation correctly.
//   Getting that wrong and publishing it would be worse than not having it.
//
// - Every generated page shares the same js/app.js bundle for interactivity
//   (predictions, live standings) — the pre-rendered HTML in each file is
//   there for fast paint and crawlability, not a separate code path.
// ============================================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TEAMS_DATA, DATA_IS_FINAL } from '../js/data/teams.js';
import { computeStandings } from '../js/engine/standings.js';
import { analyzeQualification } from '../js/engine/qualification.js';
import { TEAM_FACTS, HONOUR_ICON } from './team-facts.mjs';

function writeFileIfChanged(filePath, content) {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing === content) return false;
  }
  writeFileSync(filePath, content);
  return true;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE_URL = 'https://swissformatsim.com';

function loadSquadsData() {
  try {
    const raw = readFileSync(join(ROOT, 'data/squads.json'), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}
const SQUADS_DATA = loadSquadsData();

async function loadRealResultsAsync() {
  const { readFileSync } = await import('fs');
  try {
    const raw = readFileSync(join(ROOT, 'data/real-results.json'), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function fixturesToAppFormat(realJson) {
  return realJson.fixtures.map((rf, i) => ({
    id: `REAL_${rf.externalId ?? i}`,
    matchday: rf.matchday,
    homeId: rf.homeId,
    awayId: rf.awayId,
    homeScore: null,
    awayScore: null,
    realHomeScore: rf.homeScore,
    realAwayScore: rf.awayScore,
    realStatus: rf.status,
  }));
}

function teamById(id) {
  return TEAMS_DATA.find(t => t.id === id);
}

function humanStamp(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

// Set once per run from real-results.json checkedAt.
let lastCheckedHuman = '';

// "Last changed" and "last checked" are different claims and are shown as
// such — the sync runs on every matchday and weekly, but the results stamp
// only moves when the data actually changed.
function freshnessText(lastUpdatedHuman) {
  if (!lastUpdatedHuman) return '';
  const changed = `Results last changed ${escapeHtml(lastUpdatedHuman)}.`;
  return lastCheckedHuman
    ? `${changed} Data last checked ${escapeHtml(lastCheckedHuman)}.`
    : changed;
}

function zoneLabel(rank) {
  if (rank <= 8) return { label: 'Round of 16 (direct qualification)', zone: 'top8' };
  if (rank <= 24) return { label: 'Knockout play-off round', zone: 'playoff' };
  return { label: 'Eliminated', zone: 'out' };
}

// --- Scenario text: conservative, fact-based, no unverified permutation claims ---
function buildTeamScenario(team, standingsRow, fixtures, seasonStarted) {
  const played = standingsRow.played;
  const remaining = 8 - played;

  const nextFixture = fixtures
    .filter(f => (f.homeId === team.id || f.awayId === team.id))
    .filter(f => f.realHomeScore === null || f.realAwayScore === null)
    .sort((a, b) => a.matchday - b.matchday)[0];

  let nextLine = '';
  if (nextFixture) {
    const opponentId = nextFixture.homeId === team.id ? nextFixture.awayId : nextFixture.homeId;
    const opponent = teamById(opponentId);
    const venue = nextFixture.homeId === team.id ? 'home to' : 'away at';
    nextLine = opponent
      ? ` Next up: Matchday ${nextFixture.matchday}, ${venue} ${opponent.name}.`
      : '';
  }

  // Pre-season: no match has been played anywhere, so every club is level on
  // 0 points and there is no real ranking or qualification zone to state yet.
  if (!seasonStarted) {
    return `The 2026/27 league phase has not kicked off yet, so ${team.name} are not ranked — ` +
      `all 36 clubs start level on 0 points. Their eight-match league-phase schedule is set, and a live ` +
      `position and qualification zone will appear here as soon as results come in.${nextLine}`;
  }

  const { label } = zoneLabel(standingsRow.rank);
  return `${team.name} currently sit ${ordinal(standingsRow.rank)} in the 36-team table with ` +
    `${standingsRow.points} points from ${played} match${played === 1 ? '' : 'es'} played ` +
    `(${remaining} remaining). That position is currently in the "${label}" zone.${nextLine}`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// --- HTML shell shared by generated pages (kept intentionally close to
// index.html's head/nav/footer so the site feels like one product, not a
// bolted-on SEO farm) ---
function pageShell({ title, description, canonical, bodyContent, jsonLd }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Consent Mode v2 defaults (denied until the visitor chooses) -->
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      analytics_storage: 'denied', wait_for_update: 500
    });
  </script>
  <!-- Google Analytics (GA4) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-MEK370XD0N"></script>
  <script>
    gtag('js', new Date());
    gtag('config', 'G-MEK370XD0N');
  </script>
  <!-- Google AdSense -->
  <meta name="google-adsense-account" content="ca-pub-2136418741118263">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2136418741118263" crossorigin="anonymous"></script>
  <script src="/js/consent.js" defer></script>

  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="Swiss Format Simulator">
  <meta property="og:image" content="${SITE_URL}/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${SITE_URL}/og-image.png">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚽</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/tailwind.css">
  <script src="/js/theme.js"></script>
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body class="min-h-screen flex flex-col antialiased bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50 transition-colors">

  <header class="sticky top-0 z-50 bg-ink-50/95 dark:bg-ink-950/95 border-b-2 border-pitch-500 dark:border-pitch-400 shadow-sm">
    <div class="max-w-7xl mx-auto px-3 sm:px-6">
      <div class="flex items-center justify-between py-2.5 gap-2">
        <a href="/" class="flex items-center space-x-2.5 shrink-0">
          <div class="w-8 h-8 rounded-full bg-pitch-500 dark:bg-pitch-400 flex items-center justify-center text-ink-50 dark:text-ink-950 font-display font-bold text-sm">26</div>
          <div class="leading-none">
            <div class="font-display font-bold text-base sm:text-lg tracking-tight uppercase">Swiss Format <span class="text-pitch-600 dark:text-pitch-300">Simulator</span></div>
            <div class="text-[10px] text-ink-900/70 dark:text-ink-50/70 font-medium hidden sm:block">Champions League 2026/27</div>
          </div>
        </a>
        <nav class="hidden md:flex items-center space-x-5 text-sm font-semibold">
          <a href="/" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Simulator</a>
          <a href="/guide/champions-league-swiss-format-explained.html" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Guides</a>
          <a href="/stats.html" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Stats</a>
          <a href="/qualification.html" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Qualification</a>
          <a href="/about.html" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">About</a>
        </nav>

        <div class="flex items-center space-x-1.5">
          <button id="btn-theme-toggle" aria-label="Toggle dark mode" class="p-2 rounded-full border border-ink-900/15 dark:border-ink-50/15 hover:bg-ink-900/5 dark:hover:bg-ink-50/10 transition text-sm">
            <span id="theme-icon">🌙</span>
          </button>
          <a href="/" class="px-3 py-1.5 bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 font-bold text-xs rounded-full shadow-sm transition">⚡ Simulate</a>
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-3 sm:px-6 py-6 w-full flex-grow">
    ${bodyContent}
  </main>

  <footer class="border-t-2 border-pitch-500 dark:border-pitch-400 mt-8 bg-white dark:bg-ink-900">
    <div class="max-w-7xl mx-auto px-3 sm:px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs">
      <div class="col-span-2 sm:col-span-1">
        <div class="font-display font-bold text-sm uppercase mb-2">Swiss Format Simulator</div>
        <p class="text-ink-900/70 dark:text-ink-50/70 leading-relaxed">An independent, fan-made league-phase simulator. Not affiliated with or endorsed by UEFA.</p>
      </div>
      <div>
        <div class="font-bold uppercase text-[10px] tracking-wider text-ink-900/65 dark:text-ink-50/65 mb-2">Tool</div>
        <ul class="space-y-1.5">
          <li><a href="/" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">Simulator</a></li>
          <li><a href="/stats.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">Stats &amp; Records</a></li>
          <li><a href="/qualification.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">Qualification</a></li>
          <li><a href="/about.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">About</a></li>
        </ul>
      </div>
      <div>
        <div class="font-bold uppercase text-[10px] tracking-wider text-ink-900/65 dark:text-ink-50/65 mb-2">Legal</div>
        <ul class="space-y-1.5">
          <li><a href="/privacy.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">Privacy</a></li>
          <li><a href="/terms.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">Terms</a></li>
        </ul>
      </div>
      <div>
        <div class="font-bold uppercase text-[10px] tracking-wider text-ink-900/65 dark:text-ink-50/65 mb-2">Data</div>
        <p class="text-ink-900/70 dark:text-ink-50/70 leading-relaxed mb-1.5">Results sync automatically from public match data as the season progresses.</p>
        <a href="/data-sources.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition font-semibold">Sources &amp; methodology &rarr;</a>
      </div>
    </div>
    <div class="border-t border-ink-900/10 dark:border-ink-50/10 py-3 text-center text-[11px] text-ink-900/65 dark:text-ink-50/65">
      Built for fans of the format, not for UEFA.
    </div>
  </footer>
</body>
</html>
`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function breadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

// Mirrors the app's teamCrest(): a club logo (local, same-origin) layered over
// a colored monogram fallback that shows if the logo file isn't present.
function crestColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 55%, 42%)`;
}

function logoImg(team, size = 22) {
  const fontSize = Math.round(size * 0.4);
  const file = team.id.toLowerCase();
  return `<span aria-hidden="true" style="position:relative; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; vertical-align:middle; width:${size}px; height:${size}px; border-radius:50%; overflow:hidden; background:${crestColor(team.id)};"><span style="color:#fff; font-size:${fontSize}px; font-weight:700; letter-spacing:-0.02em; line-height:1;">${team.id}</span><img src="/assets/logos/${file}.png" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.remove()" style="position:absolute; inset:0; width:100%; height:100%; object-fit:contain; background:#fff;"></span>`;
}

function scoreCell(fixture) {
  const played = fixture.realHomeScore !== null && fixture.realAwayScore !== null;
  if (played) return `<span class="font-bold text-pitch-700 dark:text-pitch-300 tabular">${fixture.realHomeScore} – ${fixture.realAwayScore}</span>`;
  return `<span class="text-ink-900/65 dark:text-ink-50/65">vs</span>`;
}

// Internal link to a club page, logo + name (crawlable link graph between clubs).
function teamLink(team, size = 20) {
  return `<a href="/teams/${team.id.toLowerCase()}.html" class="inline-flex items-center gap-1.5 hover:text-pitch-600 dark:hover:text-pitch-300 transition">${logoImg(team, size)}<span>${escapeHtml(team.name)}</span></a>`;
}

// A team's played results, computed from real scores only (never predictions).
function teamResults(team, teamFixtures) {
  const out = [];
  for (const f of teamFixtures) {
    if (f.realHomeScore === null || f.realAwayScore === null) continue;
    const isHome = f.homeId === team.id;
    const gf = isHome ? f.realHomeScore : f.realAwayScore;
    const ga = isHome ? f.realAwayScore : f.realHomeScore;
    out.push({ matchday: f.matchday, isHome, oppId: isHome ? f.awayId : f.homeId, gf, ga, outcome: gf > ga ? 'W' : gf < ga ? 'L' : 'D' });
  }
  return out;
}

function outcomeBadge(o) {
  const cls = o === 'W' ? 'bg-pitch-500 text-white' : o === 'L' ? 'bg-red-500 text-white' : 'bg-ink-900/25 dark:bg-ink-50/25 text-ink-900 dark:text-ink-50';
  return `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${cls}">${o}</span>`;
}

// Qualification-zone colour helpers (mirror the live table's zoneStyle).
function zoneBarClass(rank) {
  if (rank <= 8) return 'bg-pitch-500 dark:bg-pitch-400';
  if (rank <= 24) return 'bg-blue-500';
  return 'bg-red-500';
}
function zoneTextClass(rank) {
  if (rank <= 8) return 'text-pitch-600 dark:text-pitch-300';
  if (rank <= 24) return 'text-blue-600 dark:text-blue-300';
  return 'text-red-500 dark:text-red-400';
}

// A full 36-row standings snapshot, styled like the live table. `seasonStarted`
// false (no match played yet) shows "—" ranks and neutral bars instead of
// implying a real order — same rule the simulator uses.
function renderStandingsSnapshot(rows, seasonStarted) {
  const body = rows.map(t => {
    const gd = t.gd > 0 ? `+${t.gd}` : t.gd;
    return `
      <div class="flex items-stretch gap-2 py-1 pr-2 rounded-lg">
        <span class="zone-bar ${seasonStarted ? zoneBarClass(t.rank) : 'bg-ink-900/15 dark:bg-ink-50/15'}"></span>
        <div class="grid grid-cols-12 items-center flex-1 text-xs py-1">
          <div class="col-span-1 text-left font-bold tabular ${seasonStarted ? zoneTextClass(t.rank) : 'text-ink-900/65 dark:text-ink-50/65'}">${seasonStarted ? t.rank : '&mdash;'}</div>
          <div class="col-span-5 text-left font-medium truncate flex items-center gap-1.5">${logoImg(teamById(t.id), 18)}<a href="/teams/${t.id.toLowerCase()}.html" class="truncate hover:text-pitch-600 dark:hover:text-pitch-300 transition">${escapeHtml(t.name)}</a></div>
          <div class="col-span-1 text-center text-ink-900/70 dark:text-ink-50/70 tabular">${t.played}</div>
          <div class="col-span-1 text-center font-semibold text-pitch-700 dark:text-pitch-300 tabular">${t.won}</div>
          <div class="col-span-2 text-center tabular text-[11px]">${gd}</div>
          <div class="col-span-2 text-center font-extrabold text-pitch-600 dark:text-pitch-300 tabular">${t.points}</div>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 p-3 rounded-2xl mb-6">
      <div class="grid grid-cols-3 gap-1.5 text-[10px] font-bold text-center mb-2">
        <div class="flex items-center justify-center gap-1.5 py-1 px-1 rounded-lg bg-pitch-500/10 text-pitch-700 dark:text-pitch-300"><span class="w-1.5 h-3.5 rounded-sm bg-pitch-500 dark:bg-pitch-400"></span>1&ndash;8: R16</div>
        <div class="flex items-center justify-center gap-1.5 py-1 px-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300"><span class="w-1.5 h-3.5 rounded-sm bg-blue-500"></span>9&ndash;24: Play-offs</div>
        <div class="flex items-center justify-center gap-1.5 py-1 px-1 rounded-lg bg-red-500/10 text-red-700 dark:text-red-300"><span class="w-1.5 h-3.5 rounded-sm bg-red-500"></span>25&ndash;36: Out</div>
      </div>
      <div class="grid grid-cols-12 text-[10px] font-bold text-ink-900/65 dark:text-ink-50/65 py-1.5 px-2 uppercase text-center border-b border-ink-900/10 dark:border-ink-50/10">
        <div class="col-span-1 text-left">#</div>
        <div class="col-span-5 text-left">Club</div>
        <div class="col-span-1">Pld</div>
        <div class="col-span-1 font-semibold text-pitch-600 dark:text-pitch-300">W</div>
        <div class="col-span-2">GD</div>
        <div class="col-span-2 text-pitch-600 dark:text-pitch-300">Pts</div>
      </div>
      ${body}
    </div>`;
}

// Which clubs crossed a qualification boundary between two standings snapshots.
function computeZoneMovers(afterRows, prevRows) {
  const prevRank = Object.fromEntries(prevRows.map(r => [r.id, r.rank]));
  const intoTop8 = [], outOfTop8 = [], intoDropZone = [];
  afterRows.forEach(r => {
    const was = prevRank[r.id];
    if (was === undefined) return;
    if (r.rank <= 8 && was > 8) intoTop8.push(r);
    if (r.rank > 8 && was <= 8) outOfTop8.push(r);
    if (r.rank > 24 && was <= 24) intoDropZone.push(r);
  });
  return { intoTop8, outOfTop8, intoDropZone };
}

// Single-matchday stats (goals, biggest win, highest-scoring match, clean
// sheets) — scoped to just that round, distinct from the season-wide numbers
// on stats.html. Reuses statCard(), defined further down this file (hoisted).
function computeMatchdayStats(mdFixtures) {
  const played = mdFixtures.filter(f => f.realHomeScore !== null && f.realAwayScore !== null);
  if (!played.length) return null;
  let biggestWin = null, highestScoring = null, totalGoals = 0, cleanSheets = 0;
  played.forEach(f => {
    const total = f.realHomeScore + f.realAwayScore;
    totalGoals += total;
    if (f.realHomeScore === 0 || f.realAwayScore === 0) cleanSheets += 1;
    const margin = Math.abs(f.realHomeScore - f.realAwayScore);
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin)) biggestWin = { ...f, margin };
    if (!highestScoring || total > highestScoring.total) highestScoring = { ...f, total };
  });
  return { matchesPlayed: played.length, totalGoals, avgGoalsPerMatch: totalGoals / played.length, cleanSheets, biggestWin, highestScoring };
}

function renderMatchdaySnapshot(stats) {
  if (!stats) return '';
  const matchLine = (f) => {
    const home = teamById(f.homeId);
    const away = teamById(f.awayId);
    if (!home || !away) return '';
    return `${teamLink(home, 16)} <span class="font-bold tabular">${f.realHomeScore}&ndash;${f.realAwayScore}</span> ${teamLink(away, 16)}`;
  };
  const cards = [
    statCard('⚽', 'Goals this matchday', `${stats.totalGoals} goals &middot; ${stats.avgGoalsPerMatch.toFixed(2)}/match`),
    stats.biggestWin ? statCard('💥', 'Biggest win margin', matchLine(stats.biggestWin)) : '',
    stats.highestScoring ? statCard('🎯', 'Highest-scoring match', `${matchLine(stats.highestScoring)} <span class="text-ink-900/65 dark:text-ink-50/65 text-xs block mt-1">${stats.highestScoring.total} goals</span>`) : '',
    statCard('🧤', 'Clean sheets', `${stats.cleanSheets} of ${stats.matchesPlayed} matches`),
  ].filter(Boolean).join('');
  return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Matchday page generation
// ---------------------------------------------------------------------------
function generateMatchdayPage(md, fixtures, standingsRows, lastUpdatedHuman, lastUpdatedIso) {
  const mdFixtures = fixtures.filter(f => f.matchday === md).sort((a, b) => a.id.localeCompare(b.id));

  const rows = mdFixtures.map(f => {
    const home = teamById(f.homeId);
    const away = teamById(f.awayId);
    if (!home || !away) return '';
    return `
      <div class="flex items-center justify-between py-2.5 px-3 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl text-sm">
        <a href="/teams/${home.id.toLowerCase()}.html" class="w-5/12 text-right font-semibold inline-flex items-center justify-end gap-2 hover:text-pitch-600 dark:hover:text-pitch-300 transition"><span class="truncate">${escapeHtml(home.name)}</span> ${logoImg(home)}</a>
        <span class="w-2/12 text-center">${scoreCell(f)}</span>
        <a href="/teams/${away.id.toLowerCase()}.html" class="w-5/12 text-left font-semibold inline-flex items-center gap-2 hover:text-pitch-600 dark:hover:text-pitch-300 transition">${logoImg(away)} <span class="truncate">${escapeHtml(away.name)}</span></a>
      </div>`;
  }).join('');

  const playedCount = mdFixtures.filter(f => f.realHomeScore !== null && f.realAwayScore !== null).length;
  const mdTotal = mdFixtures.length;
  const hasResults = playedCount > 0;

  // Standings as they stood after this matchday (and after the previous one,
  // to describe what changed). computeStandings reads real results only.
  const upToMd = fixtures.filter(f => f.matchday <= md);
  const { sortedStandings: afterRows, seasonStarted } = computeStandings(TEAMS_DATA, upToMd);
  const prevRows = md > 1
    ? computeStandings(TEAMS_DATA, fixtures.filter(f => f.matchday <= md - 1)).sortedStandings
    : null;

  const mdComplete = mdTotal > 0 && playedCount === mdTotal;
  const mdStats = computeMatchdayStats(mdFixtures);
  const snapshotHtml = renderMatchdaySnapshot(mdStats);
  const snapshotHeading = mdComplete
    ? `Standings after Matchday ${md}`
    : hasResults ? `Standings — Matchday ${md} in progress` : 'Standings so far';
  const standingsSection = seasonStarted
    ? `<h2 class="font-display font-bold text-base uppercase mb-2">${snapshotHeading}</h2>${renderStandingsSnapshot(afterRows, seasonStarted)}`
    : '';

  // "What changed" — only meaningful once this matchday has results to compare.
  let moversSection = '';
  if (prevRows && hasResults) {
    const { intoTop8, outOfTop8, intoDropZone } = computeZoneMovers(afterRows, prevRows);
    const line = (label, arr) => arr.length
      ? `<p class="text-sm mb-1"><span class="font-semibold">${label}:</span> ${arr.map(r => teamLink(teamById(r.id), 18)).join(', ')}</p>`
      : '';
    const moverLines = [
      line('Climbed into the top 8', intoTop8),
      line('Dropped out of the top 8', outOfTop8),
      line('Fell into the elimination zone', intoDropZone),
    ].filter(Boolean).join('');
    if (moverLines) {
      moversSection = `<h2 class="font-display font-bold text-base uppercase mb-2">What changed on Matchday ${md}</h2><div class="mb-6">${moverLines}</div>`;
    }
  }

  const h1 = hasResults
    ? `Champions League Standings After Matchday ${md} — 2026/27`
    : `Matchday ${md} — Champions League 2026/27`;
  const intro = hasResults
    ? `The 36-team Champions League table after Matchday ${md} of the 2026/27 league phase, plus every result. ${playedCount} of ${mdTotal} matches played — see who moved into the top 8, the play-off places and the elimination zone.`
    : `All ${mdTotal} fixtures for Matchday ${md} of the 2026/27 UEFA Champions League 36-team league phase. Each club plays once per matchday. Click any club to see its full journey, or open the simulator to predict the rest.`;

  const bodyContent = `
    <nav class="text-[11px] text-ink-900/65 dark:text-ink-50/65 mb-3"><a href="/" class="hover:text-pitch-600 dark:hover:text-pitch-300">Home</a> &rsaquo; Matchday ${md}</nav>
    <h1 class="font-display font-bold text-2xl uppercase mb-1">${h1}</h1>
    <p class="text-sm text-ink-900/75 dark:text-ink-50/75 mb-1">${intro}</p>
    ${lastUpdatedHuman ? `<p class="text-[11px] text-ink-900/65 dark:text-ink-50/65 mb-6">${freshnessText(lastUpdatedHuman)}</p>` : '<div class="mb-6"></div>'}

    ${snapshotHtml}
    ${moversSection}
    ${standingsSection}

    <h2 class="font-display font-bold text-base uppercase mb-2">Matchday ${md} ${hasResults ? 'results' : 'fixtures'}</h2>
    <div class="space-y-2 mb-8">${rows}</div>

    <a href="/?md=${md}" class="inline-block px-4 py-2 rounded-full bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 font-bold text-sm transition">
      Open in the full simulator →
    </a>

    <div class="mt-10 pt-6 border-t border-ink-900/10 dark:border-ink-50/10">
      <h2 class="font-display font-bold text-sm uppercase text-ink-900/70 dark:text-ink-50/70 mb-3">Other matchdays</h2>
      <div class="flex flex-wrap gap-2">
        ${[1,2,3,4,5,6,7,8].map(n => `<a href="/matchday-${n}.html" class="px-3 py-1.5 rounded-full text-xs font-bold transition ${n === md ? 'bg-pitch-500 dark:bg-pitch-400 text-white dark:text-ink-950' : 'bg-ink-900/5 dark:bg-ink-50/5 border border-ink-900/10 dark:border-ink-50/10 hover:bg-ink-900/10'}">MD ${n}</a>`).join('')}
      </div>
    </div>
  `;

  const title = hasResults
    ? `Champions League Standings After Matchday ${md} — 2026/27 League Phase`
    : `Matchday ${md} Fixtures & Results — Champions League 2026/27`;
  const description = hasResults
    ? `The Champions League 36-team standings after Matchday ${md} of the 2026/27 league phase, with every result — who's in the top 8, the play-off places and the elimination zone.`
    : `Matchday ${md} fixtures and results for the 2026/27 UEFA Champions League 36-team league phase. Predict the remaining matches and see the live standings.`;

  return pageShell({
    title,
    description,
    canonical: `${SITE_URL}/matchday-${md}.html`,
    bodyContent,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: `UEFA Champions League Matchday ${md} — 2026/27 League Phase`,
        startDate: mdFixtures[0]?.utcDate || undefined,
        ...(lastUpdatedIso ? { dateModified: lastUpdatedIso } : {}),
      },
      breadcrumb([
        { name: 'Home', url: `${SITE_URL}/` },
        { name: `Matchday ${md}`, url: `${SITE_URL}/matchday-${md}.html` },
      ]),
    ],
  });
}

// ---------------------------------------------------------------------------
// Team page generation
// ---------------------------------------------------------------------------

// One line describing a club's standing in a qualification zone, chosen from
// the engine's verdict. `pts` is the fewest further points that guarantee the
// zone (null when already impossible or not yet guaranteeable).
function qualZoneLine(status, pts, remaining, opts) {
  if (status === 'clinched') return opts.clinched;
  if (status === 'eliminated') return opts.eliminated;
  if (pts !== null && remaining > 0) return opts.guarantee(pts, remaining);
  return opts.possible;
}

// "Can <team> still qualify?" block, built from the deterministic engine. Only
// rendered once the league phase has started (caller passes seasonStarted).
function renderQualificationSection(team, qual) {
  if (!qual) return '';
  const { bestRank, worstRank, remaining, top8, top24, pointsToClinchTop8, pointsToClinchTop24 } = qual;
  const rankLine = bestRank === worstRank
    ? `${escapeHtml(team.name)} can now only finish <strong>${ordinal(bestRank)}</strong>.`
    : `${escapeHtml(team.name)} can still finish anywhere from <strong>${ordinal(bestRank)}</strong> to <strong>${ordinal(worstRank)}</strong> in the 36-team table.`;

  const top8Line = qualZoneLine(top8, pointsToClinchTop8, remaining, {
    clinched: '<span class="text-pitch-600 dark:text-pitch-300 font-semibold">Secured</span> — through to the round of 16.',
    eliminated: '<span class="text-red-500 font-semibold">No longer possible</span> — cannot finish in the top 8.',
    guarantee: (n, r) => `In contention — <strong>${n} more point${n === 1 ? '' : 's'}</strong> from the remaining ${r} game${r === 1 ? '' : 's'} would guarantee a top-8 finish.`,
    possible: 'In contention — a top-8 finish is still mathematically possible.',
  });
  const top24Line = qualZoneLine(top24, pointsToClinchTop24, remaining, {
    clinched: '<span class="text-pitch-600 dark:text-pitch-300 font-semibold">Safe</span> — guaranteed at least a knockout play-off place.',
    eliminated: '<span class="text-red-500 font-semibold">Eliminated</span> — cannot finish in the top 24 and is out of the competition.',
    guarantee: (n, r) => `<strong>${n} more point${n === 1 ? '' : 's'}</strong> from the remaining ${r} game${r === 1 ? '' : 's'} would guarantee avoiding elimination.`,
    possible: 'Avoiding elimination is still mathematically possible.',
  });

  return `
    <h2 id="qualification" class="font-display font-bold text-base uppercase mb-3">Can ${escapeHtml(team.name)} still qualify?</h2>
    <div class="mb-8 p-4 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl space-y-2 text-sm text-ink-900/80 dark:text-ink-50/80">
      <p>${rankLine}</p>
      <p><span class="font-semibold">Direct to the round of 16 (top 8):</span> ${top8Line}</p>
      <p><span class="font-semibold">Avoiding elimination (top 24):</span> ${top24Line}</p>
      <p class="text-xs text-ink-900/65 dark:text-ink-50/65">Based only on points still mathematically reachable — a “guarantee” holds even if every rival wins all its remaining games. Try your own results in the <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">simulator</a>.</p>
    </div>`;
}

// Records & streaks, derived entirely from this team's own played results —
// no external facts, so there's nothing here that can go stale or be wrong.
function computeTeamRecords(results) {
  if (!results.length) return null;
  const last = results[results.length - 1];
  let streakCount = 1;
  for (let i = results.length - 2; i >= 0 && results[i].outcome === last.outcome; i--) streakCount++;

  let biggestWin = null, biggestLoss = null, highestScoring = null, cleanSheets = 0;
  results.forEach(r => {
    if (r.ga === 0) cleanSheets++;
    const total = r.gf + r.ga;
    if (!highestScoring || total > highestScoring.total) highestScoring = { ...r, total };
    if (r.outcome === 'W') {
      const margin = r.gf - r.ga;
      if (!biggestWin || margin > biggestWin.margin) biggestWin = { ...r, margin };
    } else if (r.outcome === 'L') {
      const margin = r.ga - r.gf;
      if (!biggestLoss || margin > biggestLoss.margin) biggestLoss = { ...r, margin };
    }
  });
  return { streakOutcome: last.outcome, streakCount, biggestWin, biggestLoss, highestScoring, cleanSheets };
}

function streakPhrase(outcome, count) {
  const noun = outcome === 'W' ? 'win' : outcome === 'D' ? 'draw' : 'loss';
  const plural = outcome === 'L' ? 'losses' : `${noun}s`;
  return count === 1 ? `1 ${noun}` : `${count} ${plural} in a row`;
}

function matchDesc(r) {
  const opp = teamById(r.oppId);
  const venue = r.isHome ? 'home to' : 'away at';
  return `${r.gf}&ndash;${r.ga} ${venue} ${opp ? teamLink(opp, 16) : 'an opponent'} (MD${r.matchday})`;
}

function renderRecordsSection(team, records) {
  if (!records) return '';
  const { streakOutcome, streakCount, biggestWin, biggestLoss, highestScoring, cleanSheets } = records;
  const rows = [
    `<div><span class="font-semibold">Current run:</span> ${streakPhrase(streakOutcome, streakCount)}</div>`,
    biggestWin ? `<div><span class="font-semibold">Biggest win:</span> ${matchDesc(biggestWin)}</div>` : '',
    biggestLoss ? `<div><span class="font-semibold">Heaviest defeat:</span> ${matchDesc(biggestLoss)}</div>` : '',
    highestScoring ? `<div><span class="font-semibold">Highest-scoring match:</span> ${matchDesc(highestScoring)} &mdash; ${highestScoring.total} goals</div>` : '',
    `<div><span class="font-semibold">Clean sheets:</span> ${cleanSheets}</div>`,
  ].filter(Boolean).join('');

  return `
    <h2 id="records" class="font-display font-bold text-base uppercase mb-2">${escapeHtml(team.name)} records this campaign</h2>
    <div class="mb-8 p-4 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-ink-900/80 dark:text-ink-50/80">
      ${rows}
    </div>`;
}

// Team-specific FAQ, answers computed from the same deterministic
// qualification engine as the section above — doubles as visible content and
// an FAQPage rich-result candidate (plain-text answers, no markup).
function renderTeamFaq(team, row, qual) {
  if (!qual) return null;
  const { top8, top24, pointsToClinchTop8, pointsToClinchTop24, remaining } = qual;
  const name = team.name;

  const top8Answer = top8 === 'clinched'
    ? `Yes — ${name} have already secured a top-8 finish and go straight to the round of 16.`
    : top8 === 'eliminated'
      ? `No — ${name} can no longer finish in the top 8 of the 2026/27 league phase.`
      : pointsToClinchTop8 !== null
        ? `Not yet. ${name} are still in contention — ${pointsToClinchTop8} more point${pointsToClinchTop8 === 1 ? '' : 's'} from their remaining ${remaining} game${remaining === 1 ? '' : 's'} would guarantee it.`
        : `Not yet, but a top-8 finish is still mathematically possible for ${name}.`;

  const top24Answer = top24 === 'clinched'
    ? `No — ${name} have already secured at least a knockout play-off place and cannot be eliminated.`
    : top24 === 'eliminated'
      ? `Yes — ${name} have been eliminated and cannot finish in the top 24.`
      : pointsToClinchTop24 !== null
        ? `Not yet. ${pointsToClinchTop24} more point${pointsToClinchTop24 === 1 ? '' : 's'} from the remaining ${remaining} game${remaining === 1 ? '' : 's'} would guarantee ${name} avoid elimination.`
        : `Not yet — avoiding elimination is still mathematically possible for ${name}.`;

  const pointsAnswer = `${name} have ${row.points} point${row.points === 1 ? '' : 's'} from ${row.played} match${row.played === 1 ? '' : 'es'} played, ranked ${ordinal(row.rank)} of 36 in the 2026/27 Champions League league phase.`;

  const qas = [
    { q: `Is ${name} through to the Champions League round of 16?`, a: top8Answer },
    { q: `Can ${name} be eliminated from the Champions League already?`, a: top24Answer },
    { q: `How many points does ${name} have in the Champions League 2026/27 league phase?`, a: pointsAnswer },
  ];

  const html = `
    <h2 id="faq" class="font-display font-bold text-base uppercase mb-2">${escapeHtml(name)} Champions League FAQ</h2>
    <div class="mb-8 space-y-2">
      ${qas.map(({ q, a }) => `
      <details class="p-3 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl">
        <summary class="text-sm font-semibold cursor-pointer">${escapeHtml(q)}</summary>
        <p class="text-sm text-ink-900/70 dark:text-ink-50/70 mt-2">${escapeHtml(a)}</p>
      </details>`).join('')}
    </div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qas.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  return { html, jsonLd };
}

// Real-world club facts (founded, stadium, honours) — only rendered for the
// subset of clubs with a verified entry in team-facts.mjs; everything else is
// silently omitted rather than guessed.
function renderHonoursList(honours) {
  if (!honours || !honours.length) return '';
  const rows = honours.map(h => {
    const icon = HONOUR_ICON[h.type] || HONOUR_ICON.cup;
    const yearsText = h.years && h.years.length ? ` <span class="text-ink-900/65 dark:text-ink-50/65">(${h.years.map(escapeHtml).join(', ')})</span>` : '';
    return `<li class="flex items-center gap-2 py-0.5"><span aria-hidden="true" class="text-base shrink-0">${icon}</span><span class="font-bold tabular shrink-0">${h.count}\u00d7</span><span>${escapeHtml(h.competition)}${yearsText}</span></li>`;
  }).join('');
  return `<ul class="space-y-0.5 text-sm" role="list">${rows}</ul>`;
}

function renderClubProfileSection(team, facts) {
  if (!facts) return '';
  return `
    <h2 id="profile" class="font-display font-bold text-base uppercase mb-2">${escapeHtml(team.name)} club profile</h2>
    <div class="mb-8 p-4 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm text-ink-900/80 dark:text-ink-50/80">
      <div><span class="font-semibold">Founded:</span> ${facts.founded}</div>
      <div><span class="font-semibold">Stadium:</span> ${escapeHtml(facts.stadium)}${facts.stadiumCity ? `, ${escapeHtml(facts.stadiumCity)}` : ''}</div>
      <div><span class="font-semibold">Capacity:</span> ${facts.capacity.toLocaleString()}</div>
      <div class="sm:col-span-3">
        <span class="font-semibold block mb-1">Honours</span>
        ${renderHonoursList(facts.honours)}
        ${facts.honoursNote ? `<p class="text-xs text-ink-900/70 dark:text-ink-50/70 mt-2">${escapeHtml(facts.honoursNote)}</p>` : ''}
      </div>
      <div class="sm:col-span-3 text-xs text-ink-900/65 dark:text-ink-50/65">Source: Wikipedia, cross-checked 12 Oct 2026. See <a href="/data-sources.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Data Sources</a>.</div>
    </div>`;
}

function playerAvatar(player, teamId, size = 36, teamName = '') {
  const initials = (player.name || '')
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'P';
  const fontSize = Math.round(size * 0.36);
  const bg = crestColor(player.name + teamId);
  const photo = player.photo ? escapeHtml(player.photo) : null;
  const altText = `${escapeHtml(player.name)}${teamName ? ` - ${escapeHtml(teamName)}` : ''} ${escapeHtml(player.position)}`;
  return `<span style="position:relative; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; width:${size}px; height:${size}px; border-radius:50%; overflow:hidden; background:${bg};"><span aria-hidden="true" style="color:#fff; font-size:${fontSize}px; font-weight:700; line-height:1;">${initials}</span>${photo ? `<img src="${photo}" alt="${altText}" width="${size}" height="${size}" loading="lazy" onerror="this.remove()" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">` : ''}</span>`;
}

const SQUAD_POSITION_GROUPS = [
  { role: 'Goalkeeper', label: 'Goalkeepers', icon: '🧤' },
  { role: 'Defender',   label: 'Defenders',   icon: '🛡️' },
  { role: 'Midfielder', label: 'Midfielders', icon: '⚙️' },
  { role: 'Forward',    label: 'Forwards',    icon: '⚡' },
];

function renderSquadSection(team) {
  const squad = SQUADS_DATA[team.id] || [];
  if (!squad.length) return '';

  const captain = squad.find(p => p.captain);
  const gkCount = squad.filter(p => p.position === 'Goalkeeper').length;
  const defCount = squad.filter(p => p.position === 'Defender').length;
  const midCount = squad.filter(p => p.position === 'Midfielder').length;
  const fwdCount = squad.filter(p => p.position === 'Forward').length;

  const captainProse = captain ? `, captained by ${escapeHtml(captain.name)}` : '';
  const compositionProse = `The roster features ${gkCount} goalkeeper${gkCount === 1 ? '' : 's'}, ${defCount} defender${defCount === 1 ? '' : 's'}, ${midCount} midfielder${midCount === 1 ? '' : 's'}, and ${fwdCount} forward${fwdCount === 1 ? '' : 's'}.`;

  const groupsHtml = SQUAD_POSITION_GROUPS.map(({ role, label, icon }) => {
    const players = squad.filter(p => p.position === role);
    if (!players.length) return '';

    const cards = players.map(player => `
      <li class="flex items-center gap-3 p-2.5 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl">
        ${playerAvatar(player, team.id, 36, team.name)}
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 leading-tight">
            <span class="font-semibold text-sm truncate text-ink-900 dark:text-ink-50">${escapeHtml(player.name)}</span>
            ${player.captain ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-pitch-500/15 dark:bg-pitch-400/20 text-pitch-700 dark:text-pitch-300" title="Team Captain">C</span>` : ''}
          </div>
          <div class="flex items-center gap-1.5 text-xs text-ink-900/70 dark:text-ink-50/70 mt-0.5">
            ${player.number ? `<span class="font-bold tabular">#${player.number}</span> &middot;` : ''}
            <span>${escapeHtml(player.position)}</span>
            ${player.country ? `<span title="${escapeHtml(player.country)}">${player.country}</span>` : ''}
          </div>
        </div>
      </li>
    `).join('');

    return `
      <div class="mb-6 last:mb-0">
        <h3 class="text-xs font-bold uppercase tracking-wider text-ink-900/70 dark:text-ink-50/70 mb-2.5 flex items-center gap-1.5">
          <span aria-hidden="true">${icon}</span> ${label} (${players.length})
        </h3>
        <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5" role="list">
          ${cards}
        </ul>
      </div>
    `;
  }).join('');

  return `
    <section id="squad" aria-labelledby="squad-heading" class="mb-8">
      <h2 id="squad-heading" class="font-display font-bold text-base uppercase mb-2">${escapeHtml(team.name)} playing squad</h2>
      <p class="text-sm text-ink-900/70 dark:text-ink-50/70 mb-4">The ${escapeHtml(team.name)} confirmed squad for the 2026/27 UEFA Champions League league phase features ${squad.length} registered players${captainProse}. ${compositionProse}</p>
      <div class="p-4 bg-ink-900/[0.02] dark:bg-ink-50/[0.02] border border-ink-900/10 dark:border-ink-50/10 rounded-2xl">
        ${groupsHtml}
      </div>
    </section>
  `;
}

function generateTeamPage(team, fixtures, standingsRows, lastUpdatedHuman, lastUpdatedIso, seasonStarted, qual) {
  const row = standingsRows.find(r => r.id === team.id);
  const teamFixtures = fixtures
    .filter(f => f.homeId === team.id || f.awayId === team.id)
    .sort((a, b) => a.matchday - b.matchday);

  const scenario = buildTeamScenario(team, row, fixtures, seasonStarted);
  const results = teamResults(team, teamFixtures);
  const played = results.length;
  const won = results.filter(r => r.outcome === 'W').length;
  const drawn = results.filter(r => r.outcome === 'D').length;
  const lost = results.filter(r => r.outcome === 'L').length;
  const gf = results.reduce((s, r) => s + r.gf, 0);
  const ga = results.reduce((s, r) => s + r.ga, 0);
  const beaten = results.filter(r => r.outcome === 'W').map(r => teamById(r.oppId)).filter(Boolean);
  const drewWith = results.filter(r => r.outcome === 'D').map(r => teamById(r.oppId)).filter(Boolean);
  const lostTo = results.filter(r => r.outcome === 'L').map(r => teamById(r.oppId)).filter(Boolean);
  const upcoming = teamFixtures.filter(f => f.realHomeScore === null || f.realAwayScore === null);
  const form = results.slice(-5).map(r => outcomeBadge(r.outcome)).join(' ');
  const potName = { 1: 'Pot 1 (top seeds)', 2: 'Pot 2', 3: 'Pot 3', 4: 'Pot 4' }[team.pot] || `Pot ${team.pot}`;
  const nameList = (arr) => arr.map(t => teamLink(t, 18)).join(', ');
  const squad = SQUADS_DATA[team.id] || [];
  const squadHtml = renderSquadSection(team);
  const records = computeTeamRecords(results);
  const recordsHtml = renderRecordsSection(team, records);
  const faq = renderTeamFaq(team, row, qual);
  const facts = TEAM_FACTS[team.id];
  const profileHtml = renderClubProfileSection(team, facts);

  const fixtureRows = teamFixtures.map(f => {
    const isHome = f.homeId === team.id;
    const opponent = teamById(isHome ? f.awayId : f.homeId);
    if (!opponent) return '';
    const isPlayed = f.realHomeScore !== null && f.realAwayScore !== null;
    let badge = '';
    if (isPlayed) {
      const g = isHome ? f.realHomeScore : f.realAwayScore;
      const a = isHome ? f.realAwayScore : f.realHomeScore;
      badge = outcomeBadge(g > a ? 'W' : g < a ? 'L' : 'D');
    }
    return `
      <div class="flex items-center justify-between py-2 px-3 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-lg text-sm">
        <span class="text-ink-900/70 dark:text-ink-50/70 w-14 shrink-0">MD ${f.matchday}</span>
        <span class="flex-1 min-w-0 font-semibold inline-flex items-center gap-1.5"><span class="text-ink-900/65 dark:text-ink-50/65 mr-1">${isHome ? 'vs' : '@'}</span>${teamLink(opponent)}</span>
        <span class="flex items-center gap-2 shrink-0">${badge}${scoreCell(f)}</span>
      </div>`;
  }).join('');

  const { label } = zoneLabel(row.rank);
  const rankDisplay = seasonStarted ? row.rank : '—';
  const zoneDisplay = seasonStarted ? label : 'Not ranked yet';

  // Unique-per-team draw content: the actual eight opponents grouped by pot,
  // with home/away. Genuinely distinct page-to-page (answers "who does X
  // play"), so pre-season pages aren't near-identical templates.
  const drawByPot = { 1: [], 2: [], 3: [], 4: [] };
  const oppProse = [];
  teamFixtures.forEach(f => {
    const isHome = f.homeId === team.id;
    const opp = teamById(isHome ? f.awayId : f.homeId);
    if (!opp) return;
    (drawByPot[opp.pot] || (drawByPot[opp.pot] = [])).push({ opp, isHome });
    oppProse.push(`${escapeHtml(opp.name)} (${isHome ? 'home' : 'away'})`);
  });
  const opponentsProse = oppProse.length
    ? oppProse.slice(0, -1).join(', ') + (oppProse.length > 1 ? ' and ' : '') + oppProse[oppProse.length - 1]
    : '';
  const drawByPotHtml = [1, 2, 3, 4].map(p => {
    const items = drawByPot[p].map(({ opp, isHome }) =>
      `${teamLink(opp, 16)} <span class="text-ink-900/65 dark:text-ink-50/65 text-xs">(${isHome ? 'H' : 'A'})</span>`).join(', ');
    return `<div class="flex gap-2 py-1.5 border-b border-ink-900/5 dark:border-ink-50/5 last:border-0"><span class="w-16 shrink-0 text-xs font-bold uppercase text-ink-900/70 dark:text-ink-50/70 pt-0.5">Pot ${p}</span><span class="text-sm flex-1">${items || '&mdash;'}</span></div>`;
  }).join('');

  let journeyHtml;
  if (played === 0) {
    const next = upcoming[0];
    const nextOpp = next ? teamById(next.homeId === team.id ? next.awayId : next.homeId) : null;
    journeyHtml = `<p class="text-sm text-ink-900/70 dark:text-ink-50/70">${escapeHtml(team.name)} have not yet played a league-phase match. Their campaign begins on Matchday ${next ? next.matchday : 1}${nextOpp ? `, ${next.homeId === team.id ? 'at home to ' : 'away at '}${escapeHtml(nextOpp.name)}` : ''}. Results, form and the clubs they beat will appear here automatically as matchdays are played.</p>`;
  } else {
    journeyHtml = `
      <p class="text-sm text-ink-900/70 dark:text-ink-50/70 mb-3">Across ${played} league-phase match${played === 1 ? '' : 'es'}, ${escapeHtml(team.name)} have won ${won}, drawn ${drawn} and lost ${lost}, scoring ${gf} and conceding ${ga}. They currently sit ${ordinal(row.rank)} of 36 in the &ldquo;${label}&rdquo; zone.</p>
      <div class="flex items-center gap-2 text-sm mb-3"><span class="text-ink-900/70 dark:text-ink-50/70 font-semibold">Recent form:</span> ${form || '&mdash;'}</div>
      ${beaten.length ? `<p class="text-sm mb-1"><span class="font-semibold text-pitch-600 dark:text-pitch-300">Beaten:</span> ${nameList(beaten)}</p>` : ''}
      ${drewWith.length ? `<p class="text-sm mb-1"><span class="font-semibold">Drew with:</span> ${nameList(drewWith)}</p>` : ''}
      ${lostTo.length ? `<p class="text-sm mb-1"><span class="font-semibold text-red-500">Lost to:</span> ${nameList(lostTo)}</p>` : ''}`;
  }

  const bodyContent = `
    <nav class="text-[11px] text-ink-900/65 dark:text-ink-50/65 mb-3"><a href="/" class="hover:text-pitch-600 dark:hover:text-pitch-300">Home</a> &rsaquo; ${escapeHtml(team.name)}</nav>

    <h1 class="font-display font-bold text-2xl uppercase mb-1 inline-flex items-center gap-2">${logoImg(team, 30)} ${escapeHtml(team.name)} — Champions League 2026/27</h1>
    <p class="text-sm text-ink-900/75 dark:text-ink-50/75 mb-1">${escapeHtml(team.name)}'s confirmed playing squad, fixtures, results, current standing and league-phase journey in the 2026/27 UEFA Champions League.</p>
    ${lastUpdatedHuman ? `<p class="text-[11px] text-ink-900/65 dark:text-ink-50/65">${freshnessText(lastUpdatedHuman)}</p>` : ''}

    <nav class="flex flex-wrap gap-2 my-4 text-xs font-semibold" aria-label="Page sections">
      <a href="#standing" class="px-2.5 py-1 rounded-full bg-ink-900/5 dark:bg-ink-50/5 hover:bg-pitch-500/15 text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Standing</a>
      ${facts ? `<a href="#profile" class="px-2.5 py-1 rounded-full bg-ink-900/5 dark:bg-ink-50/5 hover:bg-pitch-500/15 text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Profile</a>` : ''}
      ${seasonStarted ? `<a href="#qualification" class="px-2.5 py-1 rounded-full bg-ink-900/5 dark:bg-ink-50/5 hover:bg-pitch-500/15 text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Qualification</a>` : ''}
      <a href="#opponents" class="px-2.5 py-1 rounded-full bg-ink-900/5 dark:bg-ink-50/5 hover:bg-pitch-500/15 text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Opponents</a>
      <a href="#journey" class="px-2.5 py-1 rounded-full bg-ink-900/5 dark:bg-ink-50/5 hover:bg-pitch-500/15 text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Form &amp; Journey</a>
      ${records ? `<a href="#records" class="px-2.5 py-1 rounded-full bg-ink-900/5 dark:bg-ink-50/5 hover:bg-pitch-500/15 text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Records</a>` : ''}
      <a href="#squad" class="px-2.5 py-1 rounded-full bg-ink-900/5 dark:bg-ink-50/5 hover:bg-pitch-500/15 text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Squad</a>
      <a href="#fixtures" class="px-2.5 py-1 rounded-full bg-ink-900/5 dark:bg-ink-50/5 hover:bg-pitch-500/15 text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Fixtures</a>
      ${faq ? `<a href="#faq" class="px-2.5 py-1 rounded-full bg-ink-900/5 dark:bg-ink-50/5 hover:bg-pitch-500/15 text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">FAQ</a>` : ''}
    </nav>

    <div id="standing" class="my-6 p-4 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl">
      <div class="grid grid-cols-5 gap-2 text-center mb-4">
        <div><div class="text-2xl font-black text-pitch-600 dark:text-pitch-300 tabular">${rankDisplay}</div><div class="text-[10px] uppercase text-ink-900/65 dark:text-ink-50/65">Rank</div></div>
        <div><div class="text-2xl font-black tabular">${row.points}</div><div class="text-[10px] uppercase text-ink-900/65 dark:text-ink-50/65">Points</div></div>
        <div><div class="text-2xl font-black tabular">${row.won}</div><div class="text-[10px] uppercase text-ink-900/65 dark:text-ink-50/65">Won</div></div>
        <div><div class="text-2xl font-black tabular">${row.played}</div><div class="text-[10px] uppercase text-ink-900/65 dark:text-ink-50/65">Played</div></div>
        <div><div class="text-2xl font-black tabular">${(row.gd > 0 ? '+' : '') + row.gd}</div><div class="text-[10px] uppercase text-ink-900/65 dark:text-ink-50/65">GD</div></div>
      </div>
      <p class="text-sm">${escapeHtml(scenario)}</p>
      <p class="text-xs text-ink-900/65 dark:text-ink-50/65 mt-2">Zone: ${zoneDisplay}</p>
    </div>

    ${profileHtml}

    ${seasonStarted ? renderQualificationSection(team, qual) : ''}

    <h2 id="how-they-got-here" class="font-display font-bold text-base uppercase mb-2">How ${escapeHtml(team.name)} got here</h2>
    <p class="text-sm text-ink-900/70 dark:text-ink-50/70 mb-6">${escapeHtml(team.name)} (${team.country}) qualified for the 2026/27 UEFA Champions League and was placed in ${potName} for the league-phase draw. In the 36-team Swiss-style league phase, every club plays eight different opponents — two drawn from each of the four pots — with the top eight going straight to the round of 16, teams 9th&ndash;24th entering the knockout play-offs, and 25th&ndash;36th eliminated. <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">How the league phase works &rarr;</a></p>

    <h2 id="opponents" class="font-display font-bold text-base uppercase mb-2">Who ${escapeHtml(team.name)} play in the league phase</h2>
    <p class="text-sm text-ink-900/70 dark:text-ink-50/70 mb-3">${escapeHtml(team.name)}'s eight league-phase opponents are ${opponentsProse}. Two are drawn from each of the four seeding pots, with four matches at home and four away.</p>
    <div class="mb-8 p-4 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl">${drawByPotHtml}</div>

    <h2 id="journey" class="font-display font-bold text-base uppercase mb-3">${escapeHtml(team.name)}'s league-phase journey</h2>
    <div class="mb-8">${journeyHtml}</div>

    ${recordsHtml}

    ${squadHtml}

    <h2 id="fixtures" class="font-display font-bold text-base uppercase mb-3">All fixtures &amp; results</h2>
    <div class="space-y-2 mb-8">${fixtureRows}</div>

    ${faq ? faq.html : ''}

    <a href="/" class="inline-block px-4 py-2 rounded-full bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 font-bold text-sm transition">Open the full simulator &rarr;</a>

    <div class="mt-10 pt-6 border-t border-ink-900/10 dark:border-ink-50/10 text-xs text-ink-900/70 dark:text-ink-50/70">
      <span class="font-semibold uppercase tracking-wider">Guides:</span>
      <a href="/guide/champions-league-swiss-format-explained.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Swiss format explained</a> &middot;
      <a href="/guide/how-teams-qualify-for-the-champions-league.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">How teams qualify</a> &middot;
      <a href="/guide/champions-league-tiebreakers-explained.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Tiebreakers</a>
    </div>
  `;

  return pageShell({
    title: `${team.name} Champions League 2026/27 — Squad, Fixtures & Table`,
    description: `${team.name}'s 2026/27 UEFA Champions League squad, fixtures, results, table standing and qualification outlook in the 36-team Swiss format.`,
    canonical: `${SITE_URL}/teams/${team.id.toLowerCase()}.html`,
    bodyContent,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        name: team.name,
        sport: 'Association football',
        url: `${SITE_URL}/teams/${team.id.toLowerCase()}.html`,
        logo: `${SITE_URL}/assets/logos/${team.id.toLowerCase()}.png`,
        image: `${SITE_URL}/assets/logos/${team.id.toLowerCase()}.png`,
        memberOf: { '@type': 'SportsOrganization', name: 'UEFA Champions League 2026/27 League Phase' },
        ...(lastUpdatedIso ? { dateModified: lastUpdatedIso } : {}),
        ...(facts ? {
          foundingDate: String(facts.founded),
          location: { '@type': 'StadiumOrArena', name: facts.stadium, ...(facts.stadiumCity ? { address: facts.stadiumCity } : {}) },
        } : {}),
        ...(squad.length ? {
          athlete: squad.map(p => ({
            '@type': 'Person',
            name: p.name,
            jobTitle: p.captain ? `${p.position} (Captain)` : p.position,
            ...(p.photo ? { image: `${SITE_URL}${p.photo}` } : {}),
            knowsAbout: 'UEFA Champions League',
          }))
        } : {}),
      },
      breadcrumb([
        { name: 'Home', url: `${SITE_URL}/` },
        { name: team.name, url: `${SITE_URL}/teams/${team.id.toLowerCase()}.html` },
      ]),
      ...(faq ? [faq.jsonLd] : []),
    ],
  });
}

// ---------------------------------------------------------------------------
// Evergreen guide pages (informational content hub)
// ---------------------------------------------------------------------------
const P = 'class="text-sm text-ink-900/75 dark:text-ink-50/75 leading-relaxed mb-4"';
const H2 = 'class="font-display font-bold text-lg uppercase mt-6 mb-2"';
const H3 = 'class="font-display font-bold text-base uppercase mt-5 mb-2"';
const UL = 'class="text-sm text-ink-900/75 dark:text-ink-50/75 leading-relaxed mb-4 list-disc pl-5 space-y-1"';
const OL = 'class="text-sm text-ink-900/75 dark:text-ink-50/75 leading-relaxed mb-4 list-decimal pl-5 space-y-1"';
const CALLOUT = 'class="text-sm text-ink-900/75 dark:text-ink-50/75 leading-relaxed mb-4 p-4 rounded-xl bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10"';

// Guide FAQs are rendered as visible content and as FAQPage schema from the
// same source, so the two can never drift apart.
function renderGuideFaq(faq) {
  if (!faq || !faq.length) return '';
  const items = faq.map(({ q, a }) => `
      <div class="p-4 rounded-xl bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10">
        <h3 class="font-bold text-sm mb-1">${escapeHtml(q)}</h3>
        <p class="text-sm text-ink-900/75 dark:text-ink-50/75 leading-relaxed">${a}</p>
      </div>`).join('');
  return `
      <h2 ${H2}>Frequently asked questions</h2>
      <div class="space-y-3 mb-4">${items}</div>`;
}

function guideFaqSchema(faq) {
  if (!faq || !faq.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
    })),
  };
}

// Real pot breakdown from the dataset — powers the seeding guide and links all 36 clubs.
const POT_GROUPS = { 1: [], 2: [], 3: [], 4: [] };
TEAMS_DATA.forEach(t => { if (POT_GROUPS[t.pot]) POT_GROUPS[t.pot].push(t); });
function clubChip(t) {
  return `<a href="/teams/${t.id.toLowerCase()}.html" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 hover:border-pitch-500/50 text-xs font-semibold transition">${logoImg(t, 18)}${escapeHtml(t.name)}</a>`;
}
function potListHtml(pot) {
  return `<div class="flex flex-wrap gap-2 mb-4">${POT_GROUPS[pot].map(clubChip).join('')}</div>`;
}

const GUIDE_LINKS = `
    <div class="mt-10 pt-6 border-t border-ink-900/10 dark:border-ink-50/10 text-sm">
      <span class="font-semibold uppercase tracking-wider text-ink-900/70 dark:text-ink-50/70 text-xs">More guides:</span>
      <a href="/guide/champions-league-swiss-format-explained.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Swiss format</a> &middot;
      <a href="/guide/how-teams-qualify-for-the-champions-league.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">How teams qualify</a> &middot;
      <a href="/guide/champions-league-tiebreakers-explained.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Tiebreakers</a> &middot;
      <a href="/guide/champions-league-knockout-format-explained.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Knockout format</a> &middot;
      <a href="/guide/champions-league-2026-27-pots-and-seeding.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Pots &amp; seeding</a>
      <div class="mt-4"><a href="/" class="inline-block px-4 py-2 rounded-full bg-pitch-500 hover:bg-pitch-600 text-white font-bold text-sm transition">Open the simulator &rarr;</a></div>
    </div>`;

const GUIDES = [
  {
    slug: 'champions-league-swiss-format-explained',
    title: 'Champions League Swiss Format Explained (2026/27 League Phase)',
    description: 'A clear explanation of the UEFA Champions League Swiss-style league phase: 36 teams, 8 games, one table, and how the top 8, play-off and elimination places work.',
    h1: 'Champions League Swiss Format Explained',
    body: `
      <p ${P}>Since 2024/25 the UEFA Champions League has used a <strong>Swiss-style league phase</strong> in place of the old eight groups of four. For 2026/27 it again features <strong>36 clubs in a single combined table</strong>. It is the biggest structural change the competition has made since the Champions League was created in 1992, and it changes not just the fixture list but the entire logic of how a club progresses. This guide explains exactly how it works, what each position means, and why the format rewards very different things from the old group stage.</p>

      <h2 ${H2}>Why UEFA replaced the group stage</h2>
      <p ${P}>The old format had a predictable flaw: a strong club drawn into a weak group could effectively qualify by October, and the final matchday often featured dead rubbers where nothing was at stake. With only six matches against three opponents, the sample was small and the variety limited — the same handful of fixtures recurred season after season.</p>
      <p ${P}>The Swiss model, borrowed from chess tournaments, addresses both complaints. Every club plays <strong>eight different opponents</strong> instead of three repeated ones, and because all 36 share one table, a result in a match you are not involved in can still move you up or down. There are no dead rubbers in a single table, because there is almost always a place to gain or lose.</p>

      <h2 ${H2}>36 teams, one table</h2>
      <p ${P}>All 36 qualified clubs are seeded into four pots of nine by UEFA club coefficient. Instead of being split into groups, every club sits in one 36-team table and plays <strong>eight matches</strong> — two opponents from each of the four pots, four at home and four away.</p>
      <p ${P}>Two constraints shape the draw. No club plays the same opponent twice, and <strong>no club can face more than two opponents from any single country</strong>. Clubs from the same association are never drawn against each other at all. Because satisfying every constraint by hand would be impractical, UEFA runs the draw with software: a physical ball is drawn for each club, and the system then allocates the eight valid opponents.</p>

      <h2 ${H2}>Eight matchdays, and one synchronised finale</h2>
      <p ${P}>The eight fixtures are spread across eight matchdays between September and January. Matchdays one to seven are split across two nights, typically Tuesday and Wednesday, with matches at staggered kick-off times.</p>
      <p ${P}>The final matchday is different: <strong>all 18 matches kick off simultaneously</strong>. With one shared table, a club can move several places during stoppage time in a game happening hundreds of miles away, and simultaneous kick-offs prevent any side from knowing exactly what result it needs while still playing.</p>

      <h2 ${H2}>How clubs advance</h2>
      <p ${P}>After all 144 matches, the single table decides everything:</p>
      <ul ${UL}>
        <li><strong>1st&ndash;8th:</strong> qualify directly for the round of 16.</li>
        <li><strong>9th&ndash;24th:</strong> enter a two-legged knockout play-off round for the remaining round-of-16 places.</li>
        <li><strong>25th&ndash;36th:</strong> are eliminated, with no drop into the Europa League.</li>
      </ul>
      <p ${CALLOUT}><strong>The most common misconception:</strong> finishing 25th or below does <em>not</em> send a club into the Europa League. Under the old format, third place in a group meant a parachute into the second-tier competition. That no longer exists — in the current structure, elimination from the Champions League league phase means elimination from Europe for that season.</p>

      <h3 ${H3}>Why the top eight is worth so much</h3>
      <p ${P}>The gap between 8th and 9th is the widest in the competition. Finishing eighth means skipping two knockout legs entirely, arriving in the round of 16 rested, and avoiding any chance of a February exit. Finishing ninth means two extra matches against a seeded opponent before the round of 16 even begins. The same one-point margin that separates those two positions can therefore be worth a fortnight of fixtures and a materially easier route.</p>
      <p ${P}>Position also shapes the bracket. Higher-ranked clubs are seeded through the knockout rounds, so a strong league-phase finish keeps a club away from other high seeds for longer. You can read the detail in our <a href="/guide/champions-league-knockout-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">knockout format guide</a>.</p>

      <h2 ${H2}>How many points do you actually need?</h2>
      <p ${P}>Because the table is shared, there is no fixed qualifying score — it depends on how the other 35 clubs perform. As a rough guide from the format's first seasons, <strong>around 16 points has typically been enough for the top eight</strong>, and <strong>around 11 points enough to stay inside the top 24</strong>. Clubs on 8 points or fewer have generally gone out.</p>
      <p ${P}>Those are historical patterns, not rules. Rather than relying on rules of thumb, our <a href="/qualification.html" class="text-pitch-600 dark:text-pitch-300 underline">qualification scenarios page</a> computes the exact figure for every club from the current table: how many further points would mathematically guarantee a top-eight place, and whether a club is already safe or already out.</p>

      <h2 ${H2}>How level clubs are separated</h2>
      <p ${P}>With 36 clubs on one table, points ties are frequent. UEFA separates level clubs by goal difference first, then goals scored, then away goals, then wins, then away wins. Once the phase is complete, a further set of criteria based on the collective strength of each club's eight opponents comes into play.</p>
      <p ${P}>This ordering has a practical consequence: because goal difference sits at the top, a late consolation goal in a lost match can be worth as much as a point come January. Our <a href="/guide/champions-league-tiebreakers-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">tiebreakers guide</a> sets out the full order.</p>

      <h2 ${H2}>Swiss league phase vs the old group stage</h2>
      <ul ${UL}>
        <li><strong>Opponents:</strong> eight different clubs, rather than three played twice.</li>
        <li><strong>Matches:</strong> eight instead of six, so two extra fixtures for every club.</li>
        <li><strong>Table:</strong> one combined table of 36, rather than eight separate tables of four.</li>
        <li><strong>Qualification:</strong> 24 of 36 continue, rather than 16 of 32.</li>
        <li><strong>Safety net:</strong> none — there is no longer a drop into the Europa League.</li>
        <li><strong>Home and away:</strong> each club plays four at home and four away, but never the same opponent twice.</li>
      </ul>

      <p ${P}>The clearest way to understand the format is to play with it. Open the <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">Champions League simulator</a>, enter scores for any match, and watch the 36-team table, the top-eight line and the play-off cut-off move in real time.</p>`,
    faq: [
      {
        q: 'How many games does each team play in the Champions League league phase?',
        a: 'Eight. Every club plays two opponents from each of the four seeding pots — four matches at home and four away — against eight different clubs. No opponent is faced twice.',
      },
      {
        q: 'Do teams eliminated from the Champions League drop into the Europa League?',
        a: 'No. Clubs finishing 25th to 36th are eliminated from European competition for that season. The old third-place parachute into the Europa League no longer exists under this format.',
      },
      {
        q: 'How many points are needed to reach the Champions League round of 16?',
        a: 'There is no fixed total, because the cut-off depends on how all 36 clubs perform. Historically around 16 points has secured a top-eight place and around 11 points has been enough to avoid elimination, but the exact figure is only knowable from the live table.',
      },
      {
        q: 'Why do all the final matchday games kick off at the same time?',
        a: 'Because all 36 clubs share one table, a result in any match can change another club\'s position. Simultaneous kick-offs on the final matchday stop any side from knowing precisely what result it needs while the games are still being played.',
      },
      {
        q: 'Can two clubs from the same country play each other in the league phase?',
        a: 'No. Clubs from the same association are never drawn against one another, and no club can face more than two opponents from any single country.',
      },
    ],
  },
  {
    slug: 'how-teams-qualify-for-the-champions-league',
    title: 'How Do Teams Qualify for the Champions League? (2026/27)',
    description: 'How the 36 Champions League teams are decided: domestic league places, association coefficients, the champions and league paths, and the European Performance Spots.',
    h1: 'How Teams Qualify for the Champions League',
    body: `
      <p ${P}>The 36 clubs in the Champions League league phase reach it through a mix of automatic domestic places and summer qualifying rounds. Roughly four in five arrive automatically by finishing high enough in their own league; the rest fight through up to four qualifying rounds across July and August. Here is how the field is built, and why two clubs finishing in the same league position can end up with completely different European fates.</p>

      <h2 ${H2}>Domestic league places</h2>
      <p ${P}>Most places go to clubs based on where they finish in their <strong>domestic league</strong>. How many automatic places each country gets depends on its <strong>UEFA association coefficient</strong> — a rolling five-year measure of how that country's clubs have performed in Europe.</p>
      <p ${P}>The practical effect is a sliding scale. The strongest associations receive up to four automatic league-phase places, mid-ranked associations receive one or two, and the lowest-ranked receive none at all — their champions must qualify through the summer rounds. This is why finishing fourth in a top-ranked league can be worth more than winning a smaller one.</p>

      <h3 ${H3}>How the association coefficient is calculated</h3>
      <p ${P}>Each season, a country earns points based on the results of all its clubs across the Champions League, Europa League and Conference League. The total is divided by the number of clubs that association entered, so a country is not rewarded simply for entering more teams. The five most recent seasons are summed to give the coefficient used for allocating places.</p>
      <p ${P}>Because it is a five-year rolling measure, it moves slowly. One exceptional season rarely changes a country's allocation, and one poor season rarely costs it — which is deliberate, since clubs need to plan years ahead.</p>

      <h2 ${H2}>Champions Path and League Path</h2>
      <p ${P}>Clubs that do not qualify automatically enter <strong>qualifying rounds</strong> over the summer. These are split into two separate brackets, which is one of the most misunderstood parts of the competition.</p>
      <ul ${UL}>
        <li><strong>Champions Path:</strong> for domestic title winners from lower-ranked associations. They only face other national champions.</li>
        <li><strong>League Path:</strong> for high-placed clubs from stronger associations that did not qualify automatically.</li>
      </ul>
      <p ${P}>Splitting the paths protects smaller nations. Without it, the champions of a modest league would routinely be drawn against the fourth-placed club from a major one and almost never get through. By keeping champions in their own bracket, UEFA guarantees a number of league winners reach the league phase each season — preserving the competition's original idea of being a tournament of champions.</p>

      <h2 ${H2}>The European Performance Spots</h2>
      <p ${P}>Under the current format, the <strong>two associations whose clubs performed best across all UEFA competitions the previous season</strong> each earn one extra Champions League place. These are known as the European Performance Spots, and they are the newest route into the competition.</p>
      <p ${P}>They are awarded on a <em>single</em> season's results, not the five-year coefficient, which makes them unusually volatile. A country whose clubs have an outstanding year in Europe can gain an additional place for the following season even if its long-term ranking has not changed. The extra place goes to the next-best-placed club in that country's league that has not already qualified.</p>

      <h2 ${H2}>The title-holder routes</h2>
      <p ${P}>The reigning <strong>Champions League</strong> and <strong>Europa League</strong> winners both qualify automatically for the following season's league phase, regardless of where they finish domestically. This guarantees the defending champion a chance to defend the trophy, and gives the Europa League a meaningful prize beyond its own silverware.</p>
      <p ${CALLOUT}>If a title-holder also qualifies through its domestic league — which is the usual outcome — the place is not wasted. It passes down, typically to the next-highest-placed club in that country, so the total always comes to 36.</p>

      <h2 ${H2}>Putting the 36 together</h2>
      <p ${P}>The field is therefore assembled from several streams: automatic domestic places allocated by coefficient, the two title-holder places, the two European Performance Spots, and the winners of the Champions Path and League Path qualifiers. Once settled, the 36 clubs are seeded into four pots of nine by club coefficient and drawn into the league phase.</p>
      <p ${P}>You can see this season's full field, sorted by pot, in our <a href="/guide/champions-league-2026-27-pots-and-seeding.html" class="text-pitch-600 dark:text-pitch-300 underline">pots and seeding guide</a> — or explore every club in the <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">2026/27 simulator</a> and read how the <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">Swiss league phase</a> then plays out.</p>`,
    faq: [
      {
        q: 'How many teams qualify for the Champions League from each country?',
        a: 'It depends on the country\'s UEFA association coefficient, a rolling five-year measure of its clubs\' European results. The strongest associations receive up to four automatic league-phase places; the lowest-ranked receive none and must come through qualifying.',
      },
      {
        q: 'What is the difference between the Champions Path and the League Path?',
        a: 'The Champions Path is a separate qualifying bracket for domestic title winners from lower-ranked associations, who only face other champions. The League Path is for high-placed clubs from stronger associations. Splitting them guarantees that a number of national champions reach the league phase each season.',
      },
      {
        q: 'What are the European Performance Spots?',
        a: 'Two extra Champions League places awarded to the associations whose clubs performed best across all UEFA competitions in the previous season. Unlike the standard allocation, they are based on a single season rather than the five-year coefficient.',
      },
      {
        q: 'Does the Europa League winner qualify for the Champions League?',
        a: 'Yes. The reigning Europa League winner qualifies automatically for the following season\'s Champions League league phase, as does the reigning Champions League winner.',
      },
      {
        q: 'What happens if the defending champion also qualifies through its league?',
        a: 'The place is not lost. It passes down, usually to the next-highest-placed club in that country that has not already qualified, so the league phase always contains exactly 36 clubs.',
      },
    ],
  },
  {
    slug: 'champions-league-tiebreakers-explained',
    title: 'Champions League Tiebreakers Explained (League Phase)',
    description: 'The exact order of tiebreakers used to rank teams level on points in the Champions League 36-team league-phase table.',
    h1: 'Champions League Tiebreakers Explained',
    body: `
      <p ${P}>With 36 clubs in one table, teams often finish level on points — and a single place can be the difference between a direct round-of-16 spot, the play-offs, or elimination. In a traditional group of four, ties were rare and usually settled by the head-to-head record. In a 36-team league where most clubs never meet, head-to-head is impossible, so UEFA separates level clubs using a fixed order of criteria applied to the whole table.</p>

      <h2 ${H2}>Why head-to-head cannot be used</h2>
      <p ${P}>This is the single biggest departure from the old format, and it catches people out. Under the group stage, two clubs level on points were separated first by the results of the two matches they played against each other. In the Swiss league phase, each club plays only eight of the other 35, so two clubs tied on points have most likely never faced one another — there is no head-to-head record to consult.</p>
      <p ${P}>UEFA therefore went the other way: every criterion is <strong>table-wide</strong>, measured across all eight of a club's matches. It also means a club cannot engineer its position by targeting one specific rival. Every goal in every match counts the same.</p>

      <h2 ${H2}>The tiebreaker order</h2>
      <p ${P}>UEFA separates level clubs in two stages. <strong>While the league phase is still being played</strong>, only the first five criteria are used, and any clubs still level are shown in alphabetical order:</p>
      <ol ${OL}>
        <li>Goal difference</li>
        <li>Goals scored</li>
        <li>Goals scored away from home</li>
        <li>Wins</li>
        <li>Away wins</li>
      </ol>
      <p ${P}><strong>After the final matchday</strong>, any clubs still level are then separated by five further criteria, in order:</p>
      <ol start="6" ${OL}>
        <li>Highest collective points of a club's eight league-phase opponents</li>
        <li>Best collective goal difference of those opponents</li>
        <li>Most goals scored collectively by those opponents</li>
        <li>Fewest disciplinary points</li>
        <li>Highest UEFA club coefficient</li>
      </ol>

      <h2 ${H2}>What the opponent-strength criteria actually do</h2>
      <p ${P}>Criteria six to eight are the format's fairness mechanism, and they have no equivalent in the old group stage. Because the draw gives every club a different set of eight opponents, two clubs can finish on identical points having faced very different schedules. One might have drawn four Pot 1 sides; another might have had a markedly kinder run.</p>
      <p ${P}>These criteria measure the <strong>collective strength of the opponents each club actually played</strong> — their combined points, goal difference and goals. A club that earned its total against a tougher set of fixtures is ranked above one that did not. They only apply once the phase is complete, because an opponent's final record is not known until then.</p>
      <p ${CALLOUT}>This is why our simulator applies criteria one to five while matches are outstanding, and only brings in the opponent-strength criteria once all 144 matches have a result. Applying them mid-phase would produce rankings that silently change as other clubs played, which would be misleading rather than helpful.</p>

      <h2 ${H2}>Why goal difference matters more than it used to</h2>
      <p ${P}>Because goal difference sits at the very top of the order and head-to-head has been removed entirely, it does more work here than in any previous Champions League format. Across a 36-team table, clubs cluster tightly on points — a single goal can be worth several places.</p>
      <p ${P}>Two practical consequences follow. A late consolation goal in a match already lost has genuine value, and so does continuing to attack when a game is already won. Under the old format a 1–0 win and a 4–0 win were often interchangeable; in this table they frequently are not.</p>

      <h3 ${H3}>Away goals are still a tiebreaker — but not in knockouts</h3>
      <p ${P}>Goals scored away from home appear third in the list, which surprises people who remember UEFA abolishing the away-goals rule in 2021. Both are true: away goals no longer break ties in two-legged knockout matches, but they remain a ranking criterion in the league-phase table, where they reward teams that perform on the road.</p>

      <h2 ${H2}>The two criteria we do not model</h2>
      <p ${P}>Our <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">simulator</a> applies criteria one to eight exactly as UEFA does. The last two — disciplinary points and UEFA club coefficient — are deliberately not modelled, because neither can be derived from a scoreline.</p>
      <p ${P}>Disciplinary points depend on cards and sanctions issued during matches, and the club coefficient is an external ranking published by UEFA. In practice, ties surviving all eight preceding criteria are vanishingly rare. We document this openly in our <a href="/data-sources.html" class="text-pitch-600 dark:text-pitch-300 underline">methodology</a> rather than guessing at numbers we cannot know.</p>

      <h2 ${H2}>Why it matters</h2>
      <p ${P}>Because the table is shared, the tiebreakers decide far more than bragging rights. They determine who takes the eighth place and skips two knockout legs, who lands ninth and faces a seeded play-off, and who finishes 24th rather than 25th — the line between staying in Europe and leaving it. See how those thresholds work in our <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">Swiss format guide</a>, or check what your club still needs on the <a href="/qualification.html" class="text-pitch-600 dark:text-pitch-300 underline">qualification scenarios page</a>.</p>`,
    faq: [
      {
        q: 'Is head-to-head used as a Champions League tiebreaker?',
        a: 'No. In the 36-team league phase each club plays only eight of the other 35, so two clubs level on points have usually never met. All tiebreakers are table-wide, starting with goal difference.',
      },
      {
        q: 'What is the first tiebreaker in the Champions League league phase?',
        a: 'Goal difference, followed by goals scored, goals scored away from home, wins, and then away wins.',
      },
      {
        q: 'What are the opponent-strength tiebreakers?',
        a: 'Once the league phase is complete, clubs still level are separated by the collective points, goal difference and goals of the eight opponents they actually played. This compensates for clubs facing harder or easier sets of fixtures.',
      },
      {
        q: 'Do away goals still count in the Champions League?',
        a: 'Away goals no longer break ties in two-legged knockout matches, but goals scored away from home remain the third tiebreaker in the league-phase table.',
      },
      {
        q: 'What happens if two teams are level on every tiebreaker?',
        a: 'After the opponent-strength criteria, UEFA uses disciplinary points and then the UEFA club coefficient. While the phase is still being played, clubs level on the first five criteria are simply listed alphabetically.',
      },
    ],
  },
  {
    slug: 'champions-league-knockout-format-explained',
    title: 'Champions League Knockout Stage Explained (Round of 16 & Play-offs)',
    description: 'How the Champions League knockout stage works after the league phase: the play-off round, round of 16 seeding, and the two-legged path to the 2027 final.',
    h1: 'Champions League Knockout Stage Explained',
    body: `
      <p ${P}>Once the 36-team <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">league phase</a> ends in late January, the Champions League switches to a familiar two-legged knockout — but with an extra round, and a seeding system that makes your final league position matter long after the table is finished.</p>

      <h2 ${H2}>The knockout play-off round</h2>
      <p ${P}>The eight clubs finishing <strong>1st&ndash;8th</strong> skip this round entirely and go straight to the round of 16. The 16 clubs finishing <strong>9th&ndash;24th</strong> contest a two-legged play-off in February for the remaining eight round-of-16 places.</p>
      <p ${P}>The pairings are seeded by league-phase position. Clubs finishing <strong>9th&ndash;16th</strong> are seeded and face a club that finished <strong>17th&ndash;24th</strong>. Seeded clubs play the <strong>second leg at home</strong> — the advantage of finishing the tie on your own ground, with the tie's decisive moments in front of your own crowd.</p>
      <p ${CALLOUT}>Clubs eliminated in the play-off round are out of Europe altogether. There is no transfer to the Europa League at any stage of the Champions League knockouts.</p>

      <h2 ${H2}>Round of 16 and beyond</h2>
      <p ${P}>The eight league-phase qualifiers meet the eight play-off winners in the round of 16. From there it is a standard bracket: round of 16, quarter-finals and semi-finals are all two-legged home and away, and the <strong>final is a single match</strong> at a neutral venue selected years in advance.</p>
      <p ${P}>League-phase position continues to apply. The clubs that finished 1st&ndash;8th are seeded in the round of 16 and again play the second leg at home. They also cannot face each other in that round, which keeps the highest-ranked sides apart for longer.</p>

      <h3 ${H3}>The bracket is fixed in advance</h3>
      <p ${P}>Unlike the old format, where each round was drawn fresh, the knockout bracket is determined once and then followed through to the final. The path from the round of 16 onwards is therefore known as soon as the play-offs are complete — a club can see its potential quarter-final and semi-final opponents immediately.</p>
      <p ${P}>This is a meaningful change. It rewards finishing high in the league phase twice over: once with a seeding advantage, and again with a bracket position that keeps the other strongest clubs on the opposite side for as long as possible.</p>

      <h2 ${H2}>How extra time and penalties work</h2>
      <p ${P}>Two-legged ties are decided on aggregate score across both matches. If the aggregate is level after the second leg, the tie goes to <strong>extra time</strong>, and then to a <strong>penalty shoot-out</strong> if still level.</p>
      <p ${P}>Away goals do <em>not</em> break ties. UEFA abolished the away-goals rule in 2021, so a 2–1 away win followed by a 1–0 home defeat is simply 2–2 on aggregate and proceeds to extra time. The final, being a single match, goes straight to extra time and penalties if level after 90 minutes.</p>

      <h2 ${H2}>Why the top eight matters so much</h2>
      <p ${P}>The difference between eighth and ninth is the largest single step in the competition. Eighth place means:</p>
      <ul ${UL}>
        <li><strong>Two fewer matches</strong> — no February play-off, in a month already crowded with domestic fixtures.</li>
        <li><strong>A seeded round-of-16 tie</strong>, with the second leg at home.</li>
        <li><strong>No risk of a February exit</strong> before the round of 16 has even started.</li>
        <li><strong>A kinder bracket position</strong>, kept away from the other top seeds.</li>
        <li><strong>Roughly a month of extra recovery</strong> at the sharp end of the domestic season.</li>
      </ul>
      <p ${P}>That is exactly why our <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">simulator</a> marks the top-eight line so prominently, and why the <a href="/qualification.html" class="text-pitch-600 dark:text-pitch-300 underline">qualification scenarios page</a> computes the precise number of points each club still needs to reach it.</p>

      <h2 ${H2}>The knockout calendar</h2>
      <ul ${UL}>
        <li><strong>Knockout play-off round:</strong> February, two legs.</li>
        <li><strong>Round of 16:</strong> March, two legs.</li>
        <li><strong>Quarter-finals:</strong> April, two legs.</li>
        <li><strong>Semi-finals:</strong> late April to early May, two legs.</li>
        <li><strong>Final:</strong> late May or early June, one match at a neutral venue.</li>
      </ul>`,
    faq: [
      {
        q: 'Which teams skip the Champions League knockout play-off round?',
        a: 'The eight clubs finishing 1st to 8th in the league phase go directly to the round of 16. Clubs finishing 9th to 24th contest the two-legged play-off round in February.',
      },
      {
        q: 'Do away goals count in the Champions League knockout stage?',
        a: 'No. UEFA abolished the away-goals rule in 2021. If a two-legged tie is level on aggregate after the second leg, it goes to extra time and then a penalty shoot-out.',
      },
      {
        q: 'Is the Champions League knockout bracket drawn round by round?',
        a: 'No. The bracket is determined once and followed through to the final, so clubs can see their potential quarter-final and semi-final opponents as soon as the play-off round is complete.',
      },
      {
        q: 'What happens to teams knocked out in the Champions League play-off round?',
        a: 'They are eliminated from European competition for that season. There is no transfer into the Europa League at any stage of the Champions League knockouts.',
      },
      {
        q: 'Which team plays the second leg at home in the knockout rounds?',
        a: 'The seeded club, determined by league-phase position. Clubs finishing 9th to 16th are seeded in the play-off round, and clubs finishing 1st to 8th are seeded in the round of 16.',
      },
    ],
  },
  {
    slug: 'champions-league-2026-27-pots-and-seeding',
    title: 'Champions League 2026/27 Pots & Seeding — All 36 Teams',
    description: 'The four seeding pots for the 2026/27 UEFA Champions League league phase, with all 36 clubs listed by pot and how UEFA coefficient seeding works.',
    h1: 'Champions League 2026/27 Pots & Seeding',
    body: `
      <p ${P}>Before the <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">league-phase draw</a>, the 36 clubs are seeded into four pots of nine, ranked by <strong>UEFA club coefficient</strong>. Pot 1 holds the highest-ranked sides; Pot 4 the lowest. In the draw, every club is paired with two opponents from each of the four pots — so even a Pot 1 side still has to face two other Pot 1 clubs.</p>

      <h2 ${H2}>How the pots are decided</h2>
      <p ${P}>Seeding uses the <strong>UEFA club coefficient</strong>, which measures a club's own results in European competition over the previous five seasons — not its domestic league position, and not its reputation. A club that wins its domestic title for the first time in decades will still land in Pot 4 if it has little recent European history.</p>
      <p ${P}>There is one exception: the <strong>reigning Champions League winner is automatically placed in Pot 1</strong>, regardless of coefficient. The remaining Pot 1 places go to the highest-ranked clubs by coefficient.</p>
      <p ${CALLOUT}>Because the coefficient is built from five years of European results, it lags reality. A club in sharp decline can carry a high seeding for a season or two, and a rapidly improving club can be under-seeded. This is why Pot 3 and Pot 4 often contain sides capable of beating Pot 1 opposition.</p>

      <h2 ${H2}>What your pot actually determines</h2>
      <p ${P}>A common misreading is that Pot 1 guarantees an easy draw. It does not. Every club — Pot 1 included — plays <strong>two opponents from each of the four pots</strong>. The real advantage of a high seeding is narrower than it looks: a Pot 1 club faces two other Pot 1 sides, while a Pot 4 club faces two Pot 4 sides, which are on paper the weakest in the competition.</p>
      <p ${P}>So the benefit is at the bottom of your fixture list, not the top. Every club gets heavyweight fixtures; what differs is the quality of the two easiest ones.</p>

      <h2 ${H2}>The draw constraints</h2>
      <ul ${UL}>
        <li>Two opponents from each of the four pots — eight matches in total.</li>
        <li>Four matches at home and four away, with one home and one away fixture against each pot.</li>
        <li>No club may face more than two opponents from the same country.</li>
        <li>Clubs from the same association are never drawn against each other.</li>
      </ul>
      <p ${P}>Satisfying all of these simultaneously across 36 clubs is not feasible by hand, which is why UEFA runs the draw with software: a ball is drawn physically for each club, and the system then allocates a valid set of eight opponents.</p>

      <h2 ${H2}>Pot 1</h2>
      ${potListHtml(1)}
      <h2 ${H2}>Pot 2</h2>
      ${potListHtml(2)}
      <h2 ${H2}>Pot 3</h2>
      ${potListHtml(3)}
      <h2 ${H2}>Pot 4</h2>
      ${potListHtml(4)}

      <p ${P}>Because opponents are spread across all four pots, the strongest clubs can meet early and the smallest clubs are guaranteed some heavyweight fixtures. Pick any club above to see its full fixture list, current position and qualification outlook — or head to the <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">full simulator</a> and predict the 36-team table yourself.</p>`,
    faq: [
      {
        q: 'How are Champions League pots decided?',
        a: 'By UEFA club coefficient, which measures each club\'s own results in European competition over the previous five seasons. The reigning Champions League winner is automatically placed in Pot 1 regardless of coefficient.',
      },
      {
        q: 'Does being in Pot 1 mean an easier Champions League draw?',
        a: 'Only slightly. Every club plays two opponents from each of the four pots, so all clubs face Pot 1 opposition. The advantage of a high seeding is that your two easiest fixtures come against Pot 4 clubs.',
      },
      {
        q: 'Can two teams from the same country be drawn together?',
        a: 'No. Clubs from the same association are never drawn against each other, and no club can face more than two opponents from any single country.',
      },
      {
        q: 'How many home and away games does each team get?',
        a: 'Four at home and four away — one home fixture and one away fixture against a club from each of the four pots.',
      },
    ],
  },
];

function generateGuidePage(g, lastUpdatedIso) {
  const canonical = `${SITE_URL}/guide/${g.slug}.html`;
  const bodyContent = `
    <nav class="text-[11px] text-ink-900/65 dark:text-ink-50/65 mb-3"><a href="/" class="hover:text-pitch-600 dark:hover:text-pitch-300">Home</a> &rsaquo; Guides &rsaquo; ${escapeHtml(g.h1)}</nav>
    <article>
      <h1 class="font-display font-bold text-2xl sm:text-3xl uppercase mb-4">${escapeHtml(g.h1)}</h1>
      ${g.body}
      ${renderGuideFaq(g.faq)}
      ${GUIDE_LINKS}
    </article>`;
  const faqSchema = guideFaqSchema(g.faq);
  return pageShell({
    title: g.title,
    description: g.description,
    canonical,
    bodyContent,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: g.h1,
        description: g.description,
        url: canonical,
        mainEntityOfPage: canonical,
        ...(lastUpdatedIso ? { dateModified: lastUpdatedIso } : {}),
      },
      breadcrumb([
        { name: 'Home', url: `${SITE_URL}/` },
        { name: g.h1, url: canonical },
      ]),
      ...(faqSchema ? [faqSchema] : []),
    ],
  });
}

// ---------------------------------------------------------------------------
// League-wide Stats & Records hub (computed from real results only)
// ---------------------------------------------------------------------------

// Derives every league-wide stat from the standings rows (aggregate totals)
// and the raw fixture list (match-level stats like biggest win margin).
// Reuses teamResults()/computeTeamRecords() so a club's streak/clean-sheet
// figures here are always identical to what its own team page shows.
function computeLeagueStats(fixtures, standingsRows) {
  const played = standingsRows.filter(r => r.played > 0);
  if (!played.length) return null;

  const topN = (arr, cmp, n = 3) => [...arr].sort(cmp).slice(0, n);
  const bestAttack = topN(played, (a, b) => b.goalsFor - a.goalsFor);
  const bestDefense = topN(played, (a, b) => a.goalsAgainst - b.goalsAgainst);
  const mostWins = topN(played, (a, b) => b.won - a.won);

  let longestStreak = null;
  const cleanSheetCounts = [];
  played.forEach(row => {
    const teamFixtures = fixtures.filter(f => f.homeId === row.id || f.awayId === row.id).sort((a, b) => a.matchday - b.matchday);
    const records = computeTeamRecords(teamResults(row, teamFixtures));
    if (!records) return;
    if (records.streakOutcome === 'W' && (!longestStreak || records.streakCount > longestStreak.count)) {
      longestStreak = { team: row, count: records.streakCount };
    }
    if (records.cleanSheets > 0) cleanSheetCounts.push({ team: row, count: records.cleanSheets });
  });
  const cleanSheetLeaders = cleanSheetCounts.sort((a, b) => b.count - a.count).slice(0, 3);

  let biggestWin = null, highestScoring = null, totalGoals = 0, matchesPlayed = 0;
  fixtures.forEach(f => {
    if (f.realHomeScore === null || f.realAwayScore === null) return;
    matchesPlayed += 1;
    const total = f.realHomeScore + f.realAwayScore;
    totalGoals += total;
    const margin = Math.abs(f.realHomeScore - f.realAwayScore);
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin)) biggestWin = { ...f, margin };
    if (!highestScoring || total > highestScoring.total) highestScoring = { ...f, total };
  });

  return {
    bestAttack, bestDefense, mostWins, longestStreak, cleanSheetLeaders, biggestWin, highestScoring,
    totals: { matchesPlayed, totalGoals, avgGoalsPerMatch: matchesPlayed ? totalGoals / matchesPlayed : 0 },
  };
}

function statCard(icon, label, valueHtml) {
  return `<div class="flex items-start gap-3 p-4 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl">
    <span aria-hidden="true" class="text-2xl shrink-0">${icon}</span>
    <div class="min-w-0 flex-1">
      <div class="text-[11px] font-bold uppercase tracking-wider text-ink-900/65 dark:text-ink-50/65 mb-1.5">${escapeHtml(label)}</div>
      <div class="text-sm">${valueHtml}</div>
    </div>
  </div>`;
}

// rows: array of { team, value } — renders a ranked mini-leaderboard (1-3 clubs).
function leaderList(rows) {
  return rows.map((r, i) => `<div class="flex items-center justify-between gap-2 ${i ? 'mt-1.5 pt-1.5 border-t border-ink-900/5 dark:border-ink-50/5' : ''}">${teamLink(r.team, 18)}<span class="font-bold tabular">${r.value}</span></div>`).join('');
}

function generateStatsPage(fixtures, stats, lastUpdatedHuman, lastUpdatedIso) {
  const canonical = `${SITE_URL}/stats.html`;
  const intro = `
    <nav class="text-[11px] text-ink-900/65 dark:text-ink-50/65 mb-3"><a href="/" class="hover:text-pitch-600 dark:hover:text-pitch-300">Home</a> &rsaquo; Stats &amp; Records</nav>
    <h1 class="font-display font-bold text-2xl uppercase mb-1">Champions League 2026/27 Stats &amp; Records</h1>
    <p class="text-sm text-ink-900/75 dark:text-ink-50/75 mb-1">League-wide statistics for the 36-team 2026/27 Champions League league phase, computed from every real result so far — best attack and defence, biggest wins, streaks and more.</p>
    ${lastUpdatedHuman ? `<p class="text-[11px] text-ink-900/65 dark:text-ink-50/65 mb-6">${freshnessText(lastUpdatedHuman)}</p>` : '<div class="mb-6"></div>'}`;

  if (!stats) {
    const bodyContent = `${intro}<p class="text-sm text-ink-900/70 dark:text-ink-50/70">The 2026/27 league phase hasn't kicked off yet, so there are no results to draw stats from. Check back once Matchday 1 is underway — or explore the <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">simulator</a> in the meantime.</p>`;
    return pageShell({
      title: 'Champions League 2026/27 Stats & Records',
      description: 'League-wide Champions League 2026/27 statistics: best attack, best defence, biggest wins and more, once the league phase begins.',
      canonical,
      bodyContent,
      jsonLd: [breadcrumb([{ name: 'Home', url: `${SITE_URL}/` }, { name: 'Stats & Records', url: canonical }])],
    });
  }

  const { bestAttack, bestDefense, mostWins, longestStreak, cleanSheetLeaders, biggestWin, highestScoring, totals } = stats;
  const matchLine = (f) => {
    const home = teamById(f.homeId);
    const away = teamById(f.awayId);
    if (!home || !away) return '';
    return `${teamLink(home, 16)} <span class="font-bold tabular">${f.realHomeScore}&ndash;${f.realAwayScore}</span> ${teamLink(away, 16)} <span class="text-ink-900/65 dark:text-ink-50/65 text-xs">(MD${f.matchday})</span>`;
  };

  const cards = [
    statCard('⚽', 'Best attack (goals scored)', leaderList(bestAttack.map(r => ({ team: r, value: r.goalsFor })))),
    statCard('🧱', 'Best defence (fewest conceded)', leaderList(bestDefense.map(r => ({ team: r, value: r.goalsAgainst })))),
    statCard('🏆', 'Most wins', leaderList(mostWins.map(r => ({ team: r, value: r.won })))),
    cleanSheetLeaders.length ? statCard('🧤', 'Most clean sheets', leaderList(cleanSheetLeaders.map(r => ({ team: r.team, value: r.count })))) : '',
    longestStreak ? statCard('🔥', 'Longest active winning streak', `${teamLink(longestStreak.team, 18)} <span class="font-bold tabular">${longestStreak.count}</span>`) : '',
    biggestWin ? statCard('💥', 'Biggest win margin', matchLine(biggestWin)) : '',
    highestScoring ? statCard('🎯', 'Highest-scoring match', `${matchLine(highestScoring)} <span class="text-ink-900/65 dark:text-ink-50/65 text-xs block mt-1">${highestScoring.total} goals</span>`) : '',
    statCard('📊', 'League phase so far', `${totals.matchesPlayed} matches played &middot; ${totals.totalGoals} goals &middot; ${totals.avgGoalsPerMatch.toFixed(2)} goals/match`),
  ].filter(Boolean).join('');

  const bodyContent = `${intro}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">${cards}</div>

    <h2 class="font-display font-bold text-base uppercase mb-2">How to read these numbers</h2>
    <div class="bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-2xl p-4 mb-6 text-sm text-ink-900/75 dark:text-ink-50/75 space-y-3">
      <p><strong>Best attack and best defence</strong> count goals scored and conceded across league-phase matches only. They are raw totals, not per-game averages, so early in the phase a club that has played its fixtures against weaker opposition can lead on volume alone. Read them alongside the <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">table</a> rather than on their own.</p>
      <p><strong>Goal difference is not just a curiosity here.</strong> In the 36-team league phase it is the first tiebreaker, ahead of goals scored and away goals, and head-to-head records are not used at all. A club leading the goals-scored chart may therefore be several places higher in the real table than its points alone suggest. The full order is in our <a href="/guide/champions-league-tiebreakers-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">tiebreakers guide</a>.</p>
      <p><strong>Clean sheets</strong> count matches in which a club conceded nothing. With only eight fixtures per club, a single clean sheet is worth proportionally far more than across a 38-game domestic league — which is why the leaderboard tends to move sharply after every matchday.</p>
      <p><strong>The winning streak</strong> counts consecutive league-phase victories that are still running. It resets on a draw or defeat, and ignores domestic results, so a club in excellent league form at home may not appear here at all.</p>
      <p><strong>Biggest win margin and highest-scoring match</strong> are different measures and often different fixtures. A 4&ndash;0 has a larger margin; a 3&ndash;4 has more goals. Both are listed with the matchday they occurred on so you can trace them back.</p>
    </div>

    <h2 class="font-display font-bold text-base uppercase mb-2">Where these figures come from</h2>
    <div class="bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-2xl p-4 mb-6 text-sm text-ink-900/75 dark:text-ink-50/75 space-y-3">
      <p>Every number on this page is computed from <strong>real, official results only</strong>. Predictions entered in the simulator are stored in your own browser and never affect these totals — if they did, the page would describe your guesses rather than the competition.</p>
      <p>Matches that have not been played are excluded entirely rather than counted as 0&ndash;0, which is why the averages stay meaningful mid-phase. Results sync automatically from public match data on a schedule tied to the matchday calendar, so figures can briefly trail a live scoreline. Full detail is in our <a href="/data-sources.html" class="text-pitch-600 dark:text-pitch-300 underline">methodology</a>.</p>
      <p>Want to know what these numbers mean for a specific club's chances? The <a href="/qualification.html" class="text-pitch-600 dark:text-pitch-300 underline">qualification scenarios page</a> turns the same data into the exact points each club still needs for the top eight.</p>
    </div>

    <p class="text-xs text-ink-900/65 dark:text-ink-50/65 mb-6">All figures computed from real results only (never predictions). See <a href="/data-sources.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Data Sources</a> for methodology, or the <a href="/" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">live standings</a> for the full table.</p>`;

  return pageShell({
    title: 'Champions League 2026/27 Stats & Records — Best Attack, Defence & Biggest Wins',
    description: 'League-wide Champions League 2026/27 stats: best attack and defence, most wins, biggest win margin, highest-scoring match and more, computed from every real result.',
    canonical,
    bodyContent,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Champions League 2026/27 Stats & Records', url: canonical, ...(lastUpdatedIso ? { dateModified: lastUpdatedIso } : {}) },
      breadcrumb([{ name: 'Home', url: `${SITE_URL}/` }, { name: 'Stats & Records', url: canonical }]),
    ],
  });
}

// ---------------------------------------------------------------------------
// Homepage no-JS fallback
//
// The simulator fills #fixtures-list, #standings-rows and #qual-team-select
// client-side, so a crawler that doesn't execute JS would see an empty shell.
// Here we inject the real current data between marker comments in index.html.
// The app overwrites all three containers via innerHTML on load, so this is a
// pure progressive-enhancement fallback, never a second source of truth.
// ---------------------------------------------------------------------------
// Lean text link — the fallback deliberately omits the inline-styled crest
// markup the app renders, which would roughly triple the homepage's weight.
function ssrTeamLink(team) {
  return `<a href="/teams/${team.id.toLowerCase()}.html" class="truncate hover:text-pitch-600 dark:hover:text-pitch-300">${escapeHtml(team.name)}</a>`;
}

function ssrStandingsRows(rows, seasonStarted) {
  return rows.map((t, idx) => {
    const rank = idx + 1;
    const bar = !seasonStarted ? 'bg-ink-900/15 dark:bg-ink-50/15' : zoneBarClass(rank);
    const rankColor = !seasonStarted ? 'text-ink-900/65 dark:text-ink-50/65' : zoneTextClass(rank);
    const gd = t.gd > 0 ? `+${t.gd}` : String(t.gd);
    const team = teamById(t.id) || t;
    return `<div class="flex items-stretch gap-2 py-1 pr-2">`
      + `<span class="zone-bar ${bar}"></span>`
      + `<div class="grid grid-cols-12 items-center flex-1 text-xs py-1">`
      + `<div class="col-span-1 font-bold tabular ${rankColor}">${seasonStarted ? rank : '&mdash;'}</div>`
      + `<div class="col-span-5 font-medium truncate">${ssrTeamLink(team)}</div>`
      + `<div class="col-span-1 text-center tabular">${t.played}</div>`
      + `<div class="col-span-1 text-center tabular">${t.won}</div>`
      + `<div class="col-span-2 text-center tabular">${gd}</div>`
      + `<div class="col-span-2 text-center font-extrabold tabular">${t.points}</div>`
      + `</div></div>`;
  }).join('');
}

function ssrFixtureCards(mdFixtures) {
  return mdFixtures.map(f => {
    const home = teamById(f.homeId);
    const away = teamById(f.awayId);
    if (!home || !away) return '';
    const played = f.realHomeScore !== null && f.realAwayScore !== null;
    const score = played
      ? `<span class="font-bold text-gold-600 dark:text-gold-400 tabular">${f.realHomeScore} : ${f.realAwayScore}</span>`
      : `<span class="text-ink-900/30 dark:text-ink-50/30 font-bold">vs</span>`;
    return `<div class="fixture-card bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 p-2.5 rounded-xl flex items-center justify-between text-xs">`
      + `<div class="w-5/12 text-right font-semibold truncate">${ssrTeamLink(home)}</div>`
      + `<div class="w-3/12 text-center">${score}</div>`
      + `<div class="w-5/12 font-semibold truncate">${ssrTeamLink(away)}</div>`
      + `</div>`;
  }).join('');
}

function generateHomepageFallback(fixtures, standingsRows, seasonStarted, lastUpdatedHuman) {
  const file = join(ROOT, 'index.html');
  if (!existsSync(file)) return false;
  let html = readFileSync(file, 'utf8');

  const playedCount = fixtures.filter(f => f.realHomeScore !== null && f.realAwayScore !== null).length;

  const blocks = {
    standings: ssrStandingsRows(standingsRows, seasonStarted),
    fixtures: ssrFixtureCards(fixtures.filter(f => f.matchday === 1).sort((a, b) => a.id.localeCompare(b.id))),
    teams: '<option value="">Choose your club&hellip;</option>'
      + [...TEAMS_DATA].sort((a, b) => a.name.localeCompare(b.name))
        .map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join(''),
    played: `${playedCount} / ${fixtures.length} Played`,
    updated: lastUpdatedHuman ? ` &middot; ${freshnessText(lastUpdatedHuman)}` : '',
  };

  let injected = 0;
  for (const [key, content] of Object.entries(blocks)) {
    const re = new RegExp(`(<!--SSR:${key}-->)[\\s\\S]*?(<!--/SSR:${key}-->)`);
    if (!re.test(html)) {
      console.warn(`index.html is missing the <!--SSR:${key}--> markers — skipping that fallback.`);
      continue;
    }
    html = html.replace(re, `$1${content}$2`);
    injected += 1;
  }

  if (injected) writeFileIfChanged(file, html);
  return injected > 0;
}

// ---------------------------------------------------------------------------
// Qualification scenarios hub
//
// Answers, for all 36 clubs at once, the questions people actually ask
// ("can X still reach the top 8?", "how many points does X need?"). Every
// sentence comes from the deterministic engine, so the page states only what
// is provably true at the current points totals.
// ---------------------------------------------------------------------------
function qualStatusChip(status) {
  if (status === 'clinched') return '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-pitch-500/15 text-pitch-700 dark:text-pitch-300">Qualified</span>';
  if (status === 'eliminated') return '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400">Out</span>';
  return '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300">In contention</span>';
}

// Plain-prose answer, deliberately phrased as a complete sentence so it stands
// on its own when quoted out of context. Always carries this club's own
// numbers — early in the phase every club is still "in contention", and a
// generic sentence repeated 36 times would be worthless.
function qualSentence(name, qual, row) {
  const { top8, top24, pointsToClinchTop8, remaining, bestRank, worstRank, maxPoints } = qual;
  const games = `${remaining} remaining game${remaining === 1 ? '' : 's'}`;
  const standing = `${name} has ${row.points} point${row.points === 1 ? '' : 's'} from ${row.played} game${row.played === 1 ? '' : 's'}`;
  const range = bestRank === worstRank
    ? `can now only finish ${ordinal(bestRank)}`
    : `can still finish anywhere from ${ordinal(bestRank)} to ${ordinal(worstRank)}`;

  if (top24 === 'eliminated') return `${standing} and is mathematically eliminated from the 2026/27 Champions League — it cannot finish in the top 24.`;
  if (top8 === 'clinched') return `${standing} and has mathematically secured a top-8 finish, going straight into the round of 16.`;
  if (top8 === 'eliminated') return `${standing} and ${range}. A top-8 place is no longer reachable, but it can still qualify for the knockout play-off round.`;
  if (pointsToClinchTop8 !== null) return `${standing} and ${range}. ${pointsToClinchTop8} more point${pointsToClinchTop8 === 1 ? '' : 's'} from its ${games} would guarantee a top-8 finish.`;
  return `${standing} and ${range}, with a maximum of ${maxPoints} points still reachable from its ${games} — a top-8 finish remains mathematically possible.`;
}

function generateQualificationPage(standingsRows, qualification, seasonStarted, lastUpdatedHuman, lastUpdatedIso) {
  const canonical = `${SITE_URL}/qualification.html`;

  if (!seasonStarted) {
    return pageShell({
      title: 'Champions League 2026/27 Qualification Scenarios | All 36 Clubs',
      description: 'Mathematical qualification scenarios for all 36 Champions League 2026/27 clubs — who can still reach the top 8, who is eliminated, and the exact points needed.',
      canonical,
      bodyContent: `<nav class="text-[11px] text-ink-900/65 dark:text-ink-50/65 mb-3"><a href="/" class="hover:text-pitch-600 dark:hover:text-pitch-300">Home</a> &rsaquo; Qualification Scenarios</nav>
    <h1 class="font-display font-bold text-2xl uppercase mb-1">Champions League 2026/27 Qualification Scenarios</h1>
    <p class="text-sm text-ink-900/75 dark:text-ink-50/75 mb-6">Scenarios appear once the league phase kicks off. Until then, all 36 clubs start level on zero points.</p>`,
      jsonLd: [breadcrumb([{ name: 'Home', url: `${SITE_URL}/` }, { name: 'Qualification Scenarios', url: canonical }])],
    });
  }

  const rows = standingsRows.map(r => {
    const q = qualification[r.id];
    const team = teamById(r.id);
    if (!q || !team) return '';
    const range = q.bestRank === q.worstRank ? ordinal(q.bestRank) : `${ordinal(q.bestRank)}&ndash;${ordinal(q.worstRank)}`;
    const need = q.top8 === 'clinched' ? '&mdash;'
      : q.top8 === 'eliminated' ? 'Not possible'
        : q.pointsToClinchTop8 !== null ? `${q.pointsToClinchTop8} pts`
          : 'Still possible';
    return `<tr class="border-t border-ink-900/10 dark:border-ink-50/10">
      <td class="py-2 pr-2 text-center tabular font-bold ${zoneTextClass(r.rank)}">${r.rank}</td>
      <td class="py-2 pr-2">${teamLink(team, 18)}</td>
      <td class="py-2 pr-2 text-center tabular">${r.points}</td>
      <td class="py-2 pr-2 text-center tabular">${q.remaining}</td>
      <td class="py-2 pr-2 text-center tabular whitespace-nowrap">${range}</td>
      <td class="py-2 pr-2 text-center whitespace-nowrap">${need}</td>
      <td class="py-2 text-center">${qualStatusChip(q.top8)}</td>
    </tr>`;
  }).join('');

  const counts = standingsRows.reduce((acc, r) => {
    const q = qualification[r.id];
    if (!q) return acc;
    if (q.top8 === 'clinched') acc.clinched += 1;
    else if (q.top24 === 'eliminated') acc.out += 1;
    else acc.live += 1;
    return acc;
  }, { clinched: 0, out: 0, live: 0 });

  // Early in the phase every club is "in contention" with a 1st-36th range, so
  // the per-club prose would be 36 near-identical sentences. Only publish it
  // once the engine actually separates clubs.
  const differentiated = standingsRows.some(r => {
    const q = qualification[r.id];
    return q && (q.top8 !== 'contention' || q.top24 !== 'contention'
      || q.bestRank > 1 || q.worstRank < standingsRows.length
      || q.pointsToClinchTop8 !== null);
  });

  const prose = !differentiated ? '' : standingsRows.map(r => {
    const q = qualification[r.id];
    const team = teamById(r.id);
    if (!q || !team) return '';
    return `<li class="py-1.5 border-t border-ink-900/10 dark:border-ink-50/10">${qualSentence(escapeHtml(team.name), q, r)}</li>`;
  }).join('');

  const proseSection = prose
    ? `<h2 class="font-display font-bold text-base uppercase mb-2">What each club needs, in words</h2>
    <ul class="bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-2xl px-4 py-2 mb-6 text-sm text-ink-900/80 dark:text-ink-50/80">${prose}</ul>`
    : '';

  const faqEntries = !differentiated ? [] : standingsRows.slice(0, 12).map(r => {
    const q = qualification[r.id];
    const team = teamById(r.id);
    if (!q || !team) return null;
    return {
      '@type': 'Question',
      name: `Can ${team.name} still qualify for the Champions League round of 16?`,
      acceptedAnswer: { '@type': 'Answer', text: qualSentence(team.name, q, r) },
    };
  }).filter(Boolean);

  const bodyContent = `<nav class="text-[11px] text-ink-900/65 dark:text-ink-50/65 mb-3"><a href="/" class="hover:text-pitch-600 dark:hover:text-pitch-300">Home</a> &rsaquo; Qualification Scenarios</nav>
    <h1 class="font-display font-bold text-2xl uppercase mb-1">Champions League 2026/27 Qualification Scenarios</h1>
    <p class="text-sm text-ink-900/75 dark:text-ink-50/75 mb-1">Who can still reach the top 8, who is mathematically eliminated, and the exact number of points each of the 36 clubs needs — computed from the current table, not predicted.</p>
    ${lastUpdatedHuman ? `<p class="text-[11px] text-ink-900/65 dark:text-ink-50/65 mb-6">${freshnessText(lastUpdatedHuman)}</p>` : '<div class="mb-6"></div>'}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      ${statCard('✅', 'Secured top 8', `${counts.clinched} club${counts.clinched === 1 ? '' : 's'}`)}
      ${statCard('⚔️', 'Still in contention', `${counts.live} club${counts.live === 1 ? '' : 's'}`)}
      ${statCard('❌', 'Eliminated', `${counts.out} club${counts.out === 1 ? '' : 's'}`)}
    </div>

    <h2 class="font-display font-bold text-base uppercase mb-2">Points needed, club by club</h2>
    <div class="bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-2xl p-3 mb-6 overflow-x-auto">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-[10px] uppercase font-bold text-ink-900/65 dark:text-ink-50/65 text-center">
            <th class="pb-2 pr-2">#</th><th class="pb-2 pr-2 text-left">Club</th><th class="pb-2 pr-2">Pts</th>
            <th class="pb-2 pr-2">Left</th><th class="pb-2 pr-2">Can finish</th><th class="pb-2 pr-2">To clinch top 8</th><th class="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    ${proseSection}
    <h2 class="font-display font-bold text-base uppercase mb-2">How these numbers are calculated</h2>
    <div class="bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-2xl p-4 mb-6 text-sm text-ink-900/75 dark:text-ink-50/75 space-y-2">
      <p>Every verdict here uses points only. A club is called <strong>eliminated</strong> only when the most points it can still reach is lower than the points 24 rivals are already assured of — so the claim holds in every remaining combination of results.</p>
      <p>The &ldquo;points to clinch&rdquo; figure is deliberately pessimistic: it assumes every rival wins all of its remaining matches. Because rivals also play each other and cannot all win, the real figure is often lower. The number shown is a safe upper bound — it will never tell a club it is safe when it is not.</p>
      <p>Tiebreakers such as goal difference only decide order between clubs on equal points, so they can never overturn a points-based verdict. Full detail is in the <a href="/data-sources.html" class="text-pitch-600 dark:text-pitch-300 underline">methodology</a>, and you can test your own results in the <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">simulator</a>.</p>
    </div>`;

  return pageShell({
    title: 'Champions League 2026/27 Qualification Scenarios | All 36 Clubs',
    description: `Mathematical qualification scenarios for all 36 Champions League 2026/27 clubs — ${counts.clinched} secured, ${counts.out} eliminated, ${counts.live} still in contention, with the exact points each club needs.`,
    canonical,
    bodyContent,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Champions League 2026/27 Qualification Scenarios', url: canonical, ...(lastUpdatedIso ? { dateModified: lastUpdatedIso } : {}) },
      breadcrumb([{ name: 'Home', url: `${SITE_URL}/` }, { name: 'Qualification Scenarios', url: canonical }]),
      ...(faqEntries.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqEntries }] : []),
    ],
  });
}

// ---------------------------------------------------------------------------
// Sitemap generation (kept in sync with whatever pages actually exist)
// ---------------------------------------------------------------------------
function generateSitemap(matchdayCount, teamIds, guideSlugs, lastmod) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', freq: 'daily', lastmod },
    { loc: `${SITE_URL}/stats.html`, priority: '0.6', freq: 'daily', lastmod },
    { loc: `${SITE_URL}/qualification.html`, priority: '0.8', freq: 'daily', lastmod },
    { loc: `${SITE_URL}/about.html`, priority: '0.3', freq: 'yearly' },
    { loc: `${SITE_URL}/data-sources.html`, priority: '0.4', freq: 'monthly' },
    { loc: `${SITE_URL}/privacy.html`, priority: '0.1', freq: 'yearly' },
    { loc: `${SITE_URL}/terms.html`, priority: '0.1', freq: 'yearly' },
  ];
  (guideSlugs || []).forEach(slug => {
    urls.push({ loc: `${SITE_URL}/guide/${slug}.html`, priority: '0.5', freq: 'monthly' });
  });
  for (let md = 1; md <= matchdayCount; md++) {
    urls.push({ loc: `${SITE_URL}/matchday-${md}.html`, priority: '0.8', freq: 'daily', lastmod });
  }
  teamIds.forEach(id => {
    urls.push({ loc: `${SITE_URL}/teams/${id.toLowerCase()}.html`, priority: '0.8', freq: 'daily', lastmod });
  });

  const body = urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const realJson = await loadRealResultsAsync();

  if (!realJson || !Array.isArray(realJson.fixtures) || realJson.fixtures.length === 0) {
    console.log('No real fixtures with matchday numbers yet (pot draw is complete, but the matchday-by-matchday schedule is not yet published) — skipping static page generation. This is not an error.');
    return;
  }

  const fixtures = fixturesToAppFormat(realJson);
  const { sortedStandings, seasonStarted } = computeStandings(TEAMS_DATA, fixtures);
  const qualification = analyzeQualification(sortedStandings, fixtures);

  // Two distinct facts, deliberately kept separate: generatedAt moves only on a
  // genuine data change (and so drives sitemap <lastmod> and schema
  // dateModified), while checkedAt records every automated sync.
  const lastUpdatedIso = realJson.generatedAt || new Date().toISOString();
  const lastmodDate = lastUpdatedIso.slice(0, 10);
  const lastUpdatedHuman = humanStamp(lastUpdatedIso);
  lastCheckedHuman = realJson.checkedAt ? humanStamp(realJson.checkedAt) : '';

  // Matchday pages
  const matchdaysPresent = [...new Set(fixtures.map(f => f.matchday))].filter(Boolean).sort((a, b) => a - b);
  matchdaysPresent.forEach(md => {
    const html = generateMatchdayPage(md, fixtures, sortedStandings, lastUpdatedHuman, lastUpdatedIso);
    writeFileIfChanged(join(ROOT, `matchday-${md}.html`), html);
  });
  console.log(`Generated ${matchdaysPresent.length} matchday pages.`);

  // Team pages
  mkdirSync(join(ROOT, 'teams'), { recursive: true });
  TEAMS_DATA.forEach(team => {
    const html = generateTeamPage(team, fixtures, sortedStandings, lastUpdatedHuman, lastUpdatedIso, seasonStarted, qualification[team.id]);
    writeFileIfChanged(join(ROOT, 'teams', `${team.id.toLowerCase()}.html`), html);
  });
  console.log(`Generated ${TEAMS_DATA.length} team pages.`);

  // Guide pages (evergreen informational content)
  mkdirSync(join(ROOT, 'guide'), { recursive: true });
  GUIDES.forEach(g => {
    writeFileIfChanged(join(ROOT, 'guide', `${g.slug}.html`), generateGuidePage(g, lastUpdatedIso));
  });
  console.log(`Generated ${GUIDES.length} guide pages.`);

  // League-wide Stats & Records hub
  const leagueStats = computeLeagueStats(fixtures, sortedStandings);
  writeFileIfChanged(join(ROOT, 'stats.html'), generateStatsPage(fixtures, leagueStats, lastUpdatedHuman, lastUpdatedIso));
  console.log('Generated stats.html.');

  // Qualification scenarios hub
  writeFileIfChanged(join(ROOT, 'qualification.html'), generateQualificationPage(sortedStandings, qualification, seasonStarted, lastUpdatedHuman, lastUpdatedIso));
  console.log('Generated qualification.html.');

  // Homepage crawler fallback (the simulator itself is still JS-driven)
  if (generateHomepageFallback(fixtures, sortedStandings, seasonStarted, lastUpdatedHuman)) {
    console.log('Injected homepage no-JS fallback into index.html.');
  }

  // Sitemap
  const sitemap = generateSitemap(matchdaysPresent.length, TEAMS_DATA.map(t => t.id), GUIDES.map(g => g.slug), lastmodDate);
  writeFileIfChanged(join(ROOT, 'sitemap.xml'), sitemap);
  console.log('Regenerated sitemap.xml.');

  if (!DATA_IS_FINAL) {
    console.log('Note: teams.js still has provisional (TBD) teams — team pages for those will read oddly until updated post-draw.');
  }
}

export {
  loadSquadsData,
  playerAvatar,
  renderSquadSection,
  generateTeamPage,
  SQUADS_DATA,
};

const isDirectExecution = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('generate-static-pages.mjs')
);

if (isDirectExecution) {
  main().catch(err => {
    console.error('Static page generation failed:', err);
    process.exit(1);
  });
}
