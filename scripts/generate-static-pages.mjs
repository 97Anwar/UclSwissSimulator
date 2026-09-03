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

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TEAMS_DATA, DATA_IS_FINAL } from '../js/data/teams.js';
import { computeStandings } from '../js/engine/standings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE_URL = 'https://swissformatsim.com';

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

function zoneLabel(rank) {
  if (rank <= 8) return { label: 'Round of 16 (direct qualification)', zone: 'top8' };
  if (rank <= 24) return { label: 'Knockout play-off round', zone: 'playoff' };
  return { label: 'Eliminated', zone: 'out' };
}

// --- Scenario text: conservative, fact-based, no unverified permutation claims ---
function buildTeamScenario(team, standingsRow, fixtures) {
  const { label, zone } = zoneLabel(standingsRow.rank);
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
  <meta property="og:site_name" content="UCL Swiss Phase Simulator">
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
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: {
        fontFamily: { sans: ['Inter','sans-serif'], display: ['Oswald','sans-serif'] },
        colors: {
          pitch: { 50:'#EFF6F1',100:'#DCEBE0',500:'#0B6E4F',600:'#0A5F45',700:'#084A35',400:'#2FBE8A',300:'#5FD1A8' },
          gold: { 400:'#D8B84A',500:'#C9A227',600:'#A9861D' },
          ink: { 50:'#F6F7F2',100:'#EDEFE7',800:'#1B2A22',900:'#132119',950:'#0D1410' },
        }
      } }
    }
  </script>
  <style>
    body { font-family:'Inter',system-ui,sans-serif; }
    .font-display { font-family:'Oswald',sans-serif; letter-spacing:0.01em; }
    .tabular { font-variant-numeric: tabular-nums; }
    .zone-bar { width:4px; border-radius:3px; flex-shrink:0; }
  </style>
  <link rel="stylesheet" href="/css/styles.css">
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body class="min-h-screen flex flex-col antialiased bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50 transition-colors">

  <header class="sticky top-0 z-50 bg-ink-50/95 dark:bg-ink-950/95 border-b-2 border-pitch-500 dark:border-pitch-400 shadow-sm">
    <div class="max-w-7xl mx-auto px-3 sm:px-6">
      <div class="flex items-center justify-between py-2.5 gap-2">
        <a href="/" class="flex items-center space-x-2.5 shrink-0">
          <div class="w-8 h-8 rounded-full bg-pitch-500 dark:bg-pitch-400 flex items-center justify-center text-ink-50 dark:text-ink-950 font-display font-bold text-sm">26</div>
          <div class="leading-none">
            <div class="font-display font-bold text-base sm:text-lg tracking-tight uppercase">UCL <span class="text-pitch-600 dark:text-pitch-300">Swiss Phase</span></div>
          </div>
        </a>
        <nav class="hidden md:flex items-center space-x-5 text-sm font-semibold">
          <a href="/" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Simulator</a>
          <a href="/guide/champions-league-swiss-format-explained.html" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Guides</a>
          <a href="/about.html" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">About</a>
        </nav>
      </div>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-3 sm:px-6 py-6 w-full flex-grow">
    ${bodyContent}
  </main>

  <footer class="border-t-2 border-pitch-500 dark:border-pitch-400 mt-8 bg-white dark:bg-ink-900">
    <div class="max-w-7xl mx-auto px-3 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-ink-900/50 dark:text-ink-50/50">
      <span>Unofficial fan-made tool. Not affiliated with or endorsed by UEFA.</span>
      <nav class="flex items-center gap-4">
        <a href="/about.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">About</a>
        <a href="/privacy.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">Privacy</a>
        <a href="/terms.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">Terms</a>
      </nav>
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
  return `<span class="text-ink-900/40 dark:text-ink-50/40">vs</span>`;
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

  const bodyContent = `
    <h1 class="font-display font-bold text-2xl uppercase mb-1">Matchday ${md} — Champions League Swiss Phase 2026/27</h1>
    <p class="text-sm text-ink-900/60 dark:text-ink-50/60 mb-1">All ${mdFixtures.length} fixtures and results for Matchday ${md} of the 2026/27 UEFA Champions League 36-team league phase. Each club plays once per matchday; ${playedCount} of ${mdFixtures.length} have been played so far. Click any club to see its full journey, or open the simulator to predict the rest.</p>
    ${lastUpdatedHuman ? `<p class="text-[11px] text-ink-900/40 dark:text-ink-50/40 mb-6">Results last updated ${escapeHtml(lastUpdatedHuman)}.</p>` : '<div class="mb-6"></div>'}

    <div class="space-y-2 mb-8">${rows}</div>

    <a href="/?md=${md}" class="inline-block px-4 py-2 rounded-full bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 font-bold text-sm transition">
      Open in the full simulator →
    </a>

    <div class="mt-10 pt-6 border-t border-ink-900/10 dark:border-ink-50/10">
      <h2 class="font-display font-bold text-sm uppercase text-ink-900/50 dark:text-ink-50/50 mb-3">Other matchdays</h2>
      <div class="flex flex-wrap gap-2">
        ${[1,2,3,4,5,6,7,8].map(n => `<a href="/matchday-${n}.html" class="px-3 py-1.5 rounded-full text-xs font-bold transition ${n === md ? 'bg-pitch-500 dark:bg-pitch-400 text-white dark:text-ink-950' : 'bg-ink-900/5 dark:bg-ink-50/5 border border-ink-900/10 dark:border-ink-50/10 hover:bg-ink-900/10'}">MD ${n}</a>`).join('')}
      </div>
    </div>
  `;

  return pageShell({
    title: `Matchday ${md} Fixtures & Results — Champions League Swiss Phase 2026/27`,
    description: `Matchday ${md} fixtures and results for the 2026/27 UEFA Champions League 36-team Swiss-format league phase. Predict remaining matches and see live standings.`,
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
function generateTeamPage(team, fixtures, standingsRows, lastUpdatedHuman, lastUpdatedIso) {
  const row = standingsRows.find(r => r.id === team.id);
  const teamFixtures = fixtures
    .filter(f => f.homeId === team.id || f.awayId === team.id)
    .sort((a, b) => a.matchday - b.matchday);

  const scenario = buildTeamScenario(team, row, fixtures);
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
        <span class="text-ink-900/50 dark:text-ink-50/50 w-14 shrink-0">MD ${f.matchday}</span>
        <span class="flex-1 min-w-0 font-semibold inline-flex items-center gap-1.5"><span class="text-ink-900/40 dark:text-ink-50/40 mr-1">${isHome ? 'vs' : '@'}</span>${teamLink(opponent)}</span>
        <span class="flex items-center gap-2 shrink-0">${badge}${scoreCell(f)}</span>
      </div>`;
  }).join('');

  const { label } = zoneLabel(row.rank);

  let journeyHtml;
  if (played === 0) {
    const next = upcoming[0];
    const nextOpp = next ? teamById(next.homeId === team.id ? next.awayId : next.homeId) : null;
    journeyHtml = `<p class="text-sm text-ink-900/70 dark:text-ink-50/70">${escapeHtml(team.name)} have not yet played a league-phase match. Their campaign begins on Matchday ${next ? next.matchday : 1}${nextOpp ? `, ${next.homeId === team.id ? 'at home to ' : 'away at '}${escapeHtml(nextOpp.name)}` : ''}. Results, form and the clubs they beat will appear here automatically as matchdays are played.</p>`;
  } else {
    journeyHtml = `
      <p class="text-sm text-ink-900/70 dark:text-ink-50/70 mb-3">Across ${played} league-phase match${played === 1 ? '' : 'es'}, ${escapeHtml(team.name)} have won ${won}, drawn ${drawn} and lost ${lost}, scoring ${gf} and conceding ${ga}. They currently sit ${ordinal(row.rank)} of 36 in the &ldquo;${label}&rdquo; zone.</p>
      <div class="flex items-center gap-2 text-sm mb-3"><span class="text-ink-900/50 dark:text-ink-50/50 font-semibold">Recent form:</span> ${form || '&mdash;'}</div>
      ${beaten.length ? `<p class="text-sm mb-1"><span class="font-semibold text-pitch-600 dark:text-pitch-300">Beaten:</span> ${nameList(beaten)}</p>` : ''}
      ${drewWith.length ? `<p class="text-sm mb-1"><span class="font-semibold">Drew with:</span> ${nameList(drewWith)}</p>` : ''}
      ${lostTo.length ? `<p class="text-sm mb-1"><span class="font-semibold text-red-500">Lost to:</span> ${nameList(lostTo)}</p>` : ''}`;
  }

  const bodyContent = `
    <nav class="text-[11px] text-ink-900/40 dark:text-ink-50/40 mb-3"><a href="/" class="hover:text-pitch-600 dark:hover:text-pitch-300">Home</a> &rsaquo; ${escapeHtml(team.name)}</nav>

    <h1 class="font-display font-bold text-2xl uppercase mb-1 inline-flex items-center gap-2">${logoImg(team, 30)} ${escapeHtml(team.name)} — Champions League 2026/27</h1>
    <p class="text-sm text-ink-900/60 dark:text-ink-50/60 mb-1">${escapeHtml(team.name)}'s fixtures, results, current standing and league-phase journey in the 2026/27 UEFA Champions League.</p>
    ${lastUpdatedHuman ? `<p class="text-[11px] text-ink-900/40 dark:text-ink-50/40">Results last updated ${escapeHtml(lastUpdatedHuman)}.</p>` : ''}

    <div class="my-6 p-4 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl">
      <div class="grid grid-cols-4 gap-3 text-center mb-4">
        <div><div class="text-2xl font-black text-pitch-600 dark:text-pitch-300 tabular">${row.rank}</div><div class="text-[10px] uppercase text-ink-900/40 dark:text-ink-50/40">Rank</div></div>
        <div><div class="text-2xl font-black tabular">${row.points}</div><div class="text-[10px] uppercase text-ink-900/40 dark:text-ink-50/40">Points</div></div>
        <div><div class="text-2xl font-black tabular">${row.played}</div><div class="text-[10px] uppercase text-ink-900/40 dark:text-ink-50/40">Played</div></div>
        <div><div class="text-2xl font-black tabular">${(row.gd > 0 ? '+' : '') + row.gd}</div><div class="text-[10px] uppercase text-ink-900/40 dark:text-ink-50/40">GD</div></div>
      </div>
      <p class="text-sm">${escapeHtml(scenario)}</p>
      <p class="text-xs text-ink-900/40 dark:text-ink-50/40 mt-2">Zone: ${label}</p>
    </div>

    <h2 class="font-display font-bold text-base uppercase mb-2">How ${escapeHtml(team.name)} got here</h2>
    <p class="text-sm text-ink-900/70 dark:text-ink-50/70 mb-6">${escapeHtml(team.name)} (${team.country}) qualified for the 2026/27 UEFA Champions League and was placed in ${potName} for the league-phase draw. In the 36-team Swiss-style league phase, every club plays eight different opponents — two drawn from each of the four pots — with the top eight going straight to the round of 16, teams 9th&ndash;24th entering the knockout play-offs, and 25th&ndash;36th eliminated. <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">How the league phase works &rarr;</a></p>

    <h2 class="font-display font-bold text-base uppercase mb-3">${escapeHtml(team.name)}'s league-phase journey</h2>
    <div class="mb-8">${journeyHtml}</div>

    <h2 class="font-display font-bold text-base uppercase mb-3">All fixtures &amp; results</h2>
    <div class="space-y-2 mb-8">${fixtureRows}</div>

    <a href="/" class="inline-block px-4 py-2 rounded-full bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 font-bold text-sm transition">Open the full simulator &rarr;</a>

    <div class="mt-10 pt-6 border-t border-ink-900/10 dark:border-ink-50/10 text-xs text-ink-900/50 dark:text-ink-50/50">
      <span class="font-semibold uppercase tracking-wider">Guides:</span>
      <a href="/guide/champions-league-swiss-format-explained.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Swiss format explained</a> &middot;
      <a href="/guide/how-teams-qualify-for-the-champions-league.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">How teams qualify</a> &middot;
      <a href="/guide/champions-league-tiebreakers-explained.html" class="underline hover:text-pitch-600 dark:hover:text-pitch-300">Tiebreakers</a>
    </div>
  `;

  return pageShell({
    title: `${team.name} Champions League 2026/27 — Fixtures, Results & Table`,
    description: `${team.name}'s 2026/27 UEFA Champions League league-phase fixtures, results, current standing and journey — who they have played, beaten and face next in the 36-team table.`,
    canonical: `${SITE_URL}/teams/${team.id.toLowerCase()}.html`,
    bodyContent,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        name: team.name,
        sport: 'Association football',
        url: `${SITE_URL}/teams/${team.id.toLowerCase()}.html`,
        memberOf: { '@type': 'SportsOrganization', name: 'UEFA Champions League 2026/27 League Phase' },
        ...(lastUpdatedIso ? { dateModified: lastUpdatedIso } : {}),
      },
      breadcrumb([
        { name: 'Home', url: `${SITE_URL}/` },
        { name: team.name, url: `${SITE_URL}/teams/${team.id.toLowerCase()}.html` },
      ]),
    ],
  });
}

// ---------------------------------------------------------------------------
// Evergreen guide pages (informational content hub)
// ---------------------------------------------------------------------------
const P = 'class="text-sm text-ink-900/75 dark:text-ink-50/75 leading-relaxed mb-4"';
const H2 = 'class="font-display font-bold text-lg uppercase mt-6 mb-2"';

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
      <span class="font-semibold uppercase tracking-wider text-ink-900/50 dark:text-ink-50/50 text-xs">More guides:</span>
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
      <p ${P}>Since 2024/25 the UEFA Champions League has used a <strong>Swiss-style league phase</strong> in place of the old eight groups of four. For 2026/27 it again features <strong>36 clubs in a single combined table</strong>. This guide explains exactly how it works and what each position means.</p>
      <h2 ${H2}>36 teams, one table</h2>
      <p ${P}>All 36 qualified clubs are seeded into four pots of nine by UEFA coefficient. Instead of being split into groups, every club sits in one 36-team table and plays <strong>eight matches</strong> — two opponents from each of the four pots, four at home and four away. No club plays the same opponent twice, and a team can face at most two clubs from any one country.</p>
      <h2 ${H2}>Eight matchdays</h2>
      <p ${P}>The eight fixtures are spread across eight matchdays between September and January. Because it is one shared table, results elsewhere constantly change a club's ranking — which is what makes the final matchday so tense.</p>
      <h2 ${H2}>How clubs advance</h2>
      <p ${P}>After all matches, the single table decides everything:</p>
      <ul class="text-sm text-ink-900/75 dark:text-ink-50/75 leading-relaxed mb-4 list-disc pl-5 space-y-1">
        <li><strong>1st&ndash;8th:</strong> qualify directly for the round of 16.</li>
        <li><strong>9th&ndash;24th:</strong> enter a two-legged knockout play-off round for the remaining round-of-16 places.</li>
        <li><strong>25th&ndash;36th:</strong> are eliminated, with no drop into the Europa League.</li>
      </ul>
      <p ${P}>You can try it yourself in our <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">Champions League simulator</a>: enter scores for any match and watch the 36-team table, top-8 line and play-off cut-off update live. Level teams are separated by a set order of criteria — see our <a href="/guide/champions-league-tiebreakers-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">tiebreakers guide</a>.</p>
      ${GUIDE_LINKS}`,
  },
  {
    slug: 'how-teams-qualify-for-the-champions-league',
    title: 'How Do Teams Qualify for the Champions League? (2026/27)',
    description: 'How the 36 Champions League teams are decided: domestic league places, association coefficients, the champions and league paths, and the European Performance Spots.',
    h1: 'How Teams Qualify for the Champions League',
    body: `
      <p ${P}>The 36 clubs in the Champions League league phase reach it through a mix of automatic domestic places and summer qualifying rounds. Here is how the field is built.</p>
      <h2 ${H2}>Domestic league places</h2>
      <p ${P}>Most places go to clubs based on where they finish in their <strong>domestic league</strong>. How many automatic places each country gets depends on its <strong>UEFA association coefficient</strong> — a rolling five-year measure of that country's clubs in Europe. The strongest leagues (England, Spain, Italy, Germany) receive up to four automatic league-phase places, while smaller associations receive fewer, or none, and must qualify.</p>
      <h2 ${H2}>Champions Path and League Path</h2>
      <p ${P}>Clubs that do not qualify automatically enter <strong>qualifying rounds</strong> over the summer, split into a <strong>Champions Path</strong> (for domestic title winners of lower-ranked associations) and a <strong>League Path</strong> (for high-placed clubs from stronger associations). This keeps more national champions in the competition.</p>
      <h2 ${H2}>The European Performance Spots</h2>
      <p ${P}>Under the current format, the <strong>two associations whose clubs performed best across all UEFA competitions the previous season</strong> each earn one extra Champions League place — the "European Performance Spots". The reigning Champions League and Europa League winners also qualify automatically.</p>
      <p ${P}>Once this settles, the 36 clubs are seeded into four pots and drawn into the league phase. Explore every club in the <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">2026/27 simulator</a>, or read how the <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">Swiss league phase</a> then plays out.</p>
      ${GUIDE_LINKS}`,
  },
  {
    slug: 'champions-league-tiebreakers-explained',
    title: 'Champions League Tiebreakers Explained (League Phase)',
    description: 'The exact order of tiebreakers used to rank teams level on points in the Champions League 36-team league-phase table.',
    h1: 'Champions League Tiebreakers Explained',
    body: `
      <p ${P}>With 36 clubs in one table, teams often finish level on points — and a single place can be the difference between a direct round-of-16 spot, the play-offs, or elimination. UEFA separates level clubs using a fixed order of criteria.</p>
      <h2 ${H2}>The tiebreaker order</h2>
      <p ${P}>When two or more clubs are level on points, they are ranked by, in order:</p>
      <ol class="text-sm text-ink-900/75 dark:text-ink-50/75 leading-relaxed mb-4 list-decimal pl-5 space-y-1">
        <li>Points</li>
        <li>Goal difference</li>
        <li>Goals scored</li>
        <li>Goals scored away from home</li>
        <li>Wins</li>
        <li>Away wins</li>
      </ol>
      <p ${P}>Further criteria (such as disciplinary record and UEFA coefficient) apply only if clubs are still level after all of the above. Our <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">simulator</a> applies criteria 1&ndash;6 automatically as you enter results, so the table always ranks exactly as it would in real life.</p>
      <h2 ${H2}>Why it matters</h2>
      <p ${P}>Because goal difference and goals scored come so early in the order, a heavy win or a late consolation goal can swing a club several places — and across a shared 36-team table, that can decide who reaches the <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">round of 16 directly versus the play-offs</a>.</p>
      ${GUIDE_LINKS}`,
  },
  {
    slug: 'champions-league-knockout-format-explained',
    title: 'Champions League Knockout Stage Explained (Round of 16 & Play-offs)',
    description: 'How the Champions League knockout stage works after the league phase: the play-off round, round of 16 seeding, and the two-legged path to the 2027 final.',
    h1: 'Champions League Knockout Stage Explained',
    body: `
      <p ${P}>Once the 36-team <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">league phase</a> ends, the Champions League switches to a familiar two-legged knockout — but with a twist that rewards finishing high in the table.</p>
      <h2 ${H2}>The knockout play-off round</h2>
      <p ${P}>The eight clubs finishing <strong>1st&ndash;8th</strong> skip this round entirely and go straight to the round of 16. The 16 clubs finishing <strong>9th&ndash;24th</strong> contest a two-legged play-off for the remaining eight round-of-16 places. Finishing 9th&ndash;16th earns a seeding advantage: those clubs are seeded and play the second leg at home against a club that finished 17th&ndash;24th.</p>
      <h2 ${H2}>Round of 16 and beyond</h2>
      <p ${P}>The eight league-phase qualifiers meet the eight play-off winners in the round of 16. From there it is a standard bracket — round of 16, quarter-finals and semi-finals are all two-legged (home and away), and the <strong>final is a single match</strong> at a neutral venue. A club's league-phase ranking also shapes which side of the bracket it lands on, so those top-eight places are worth far more than just skipping a round.</p>
      <h2 ${H2}>Why the top 8 matters so much</h2>
      <p ${P}>Finishing in the top eight means two fewer knockout legs, a kinder seeded path, and no risk of a February exit before the round of 16 even begins. That is exactly the line our <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">simulator</a> highlights as you predict the table.</p>
      ${GUIDE_LINKS}`,
  },
  {
    slug: 'champions-league-2026-27-pots-and-seeding',
    title: 'Champions League 2026/27 Pots & Seeding — All 36 Teams',
    description: 'The four seeding pots for the 2026/27 UEFA Champions League league phase, with all 36 clubs listed by pot and how UEFA coefficient seeding works.',
    h1: 'Champions League 2026/27 Pots & Seeding',
    body: `
      <p ${P}>Before the <a href="/guide/champions-league-swiss-format-explained.html" class="text-pitch-600 dark:text-pitch-300 underline">league-phase draw</a>, the 36 clubs are seeded into four pots of nine, ranked by <strong>UEFA club coefficient</strong>. Pot 1 holds the highest-ranked sides (the reigning champions are placed in Pot 1); Pot 4 the lowest-ranked. In the draw, every club is paired with two opponents from each of the four pots — so even a Pot 1 side still has to face two other Pot 1 clubs.</p>
      <h2 ${H2}>Pot 1</h2>
      ${potListHtml(1)}
      <h2 ${H2}>Pot 2</h2>
      ${potListHtml(2)}
      <h2 ${H2}>Pot 3</h2>
      ${potListHtml(3)}
      <h2 ${H2}>Pot 4</h2>
      ${potListHtml(4)}
      <p ${P}>Because opponents are spread across all four pots, the strongest clubs can meet early and the smallest clubs are guaranteed some heavyweight fixtures. Want to see how the matchups play out? Pick any club above, or head to the <a href="/" class="text-pitch-600 dark:text-pitch-300 underline">full simulator</a> and predict the 36-team table yourself.</p>
      ${GUIDE_LINKS}`,
  },
];

function generateGuidePage(g, lastUpdatedIso) {
  const canonical = `${SITE_URL}/guide/${g.slug}.html`;
  const bodyContent = `
    <nav class="text-[11px] text-ink-900/40 dark:text-ink-50/40 mb-3"><a href="/" class="hover:text-pitch-600 dark:hover:text-pitch-300">Home</a> &rsaquo; Guides &rsaquo; ${escapeHtml(g.h1)}</nav>
    <article>
      <h1 class="font-display font-bold text-2xl sm:text-3xl uppercase mb-4">${escapeHtml(g.h1)}</h1>
      ${g.body}
    </article>`;
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
    ],
  });
}

// ---------------------------------------------------------------------------
// Sitemap generation (kept in sync with whatever pages actually exist)
// ---------------------------------------------------------------------------
function generateSitemap(matchdayCount, teamIds, guideSlugs, lastmod) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', freq: 'daily', lastmod },
    { loc: `${SITE_URL}/about.html`, priority: '0.3', freq: 'yearly' },
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
    urls.push({ loc: `${SITE_URL}/teams/${id.toLowerCase()}.html`, priority: '0.6', freq: 'daily', lastmod });
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
  const { sortedStandings } = computeStandings(TEAMS_DATA, fixtures);

  // Freshness stamp driven by the ~6-hourly results sync (real-results.json
  // generatedAt), used for sitemap <lastmod>, schema dateModified, and the
  // visible "Results last updated" line on every generated page.
  const lastUpdatedIso = realJson.generatedAt || new Date().toISOString();
  const lastmodDate = lastUpdatedIso.slice(0, 10);
  const lastUpdatedHuman = new Date(lastUpdatedIso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';

  // Matchday pages
  const matchdaysPresent = [...new Set(fixtures.map(f => f.matchday))].filter(Boolean).sort((a, b) => a - b);
  matchdaysPresent.forEach(md => {
    const html = generateMatchdayPage(md, fixtures, sortedStandings, lastUpdatedHuman, lastUpdatedIso);
    writeFileSync(join(ROOT, `matchday-${md}.html`), html);
  });
  console.log(`Generated ${matchdaysPresent.length} matchday pages.`);

  // Team pages
  mkdirSync(join(ROOT, 'teams'), { recursive: true });
  TEAMS_DATA.forEach(team => {
    const html = generateTeamPage(team, fixtures, sortedStandings, lastUpdatedHuman, lastUpdatedIso);
    writeFileSync(join(ROOT, 'teams', `${team.id.toLowerCase()}.html`), html);
  });
  console.log(`Generated ${TEAMS_DATA.length} team pages.`);

  // Guide pages (evergreen informational content)
  mkdirSync(join(ROOT, 'guide'), { recursive: true });
  GUIDES.forEach(g => {
    writeFileSync(join(ROOT, 'guide', `${g.slug}.html`), generateGuidePage(g, lastUpdatedIso));
  });
  console.log(`Generated ${GUIDES.length} guide pages.`);

  // Sitemap
  const sitemap = generateSitemap(matchdaysPresent.length, TEAMS_DATA.map(t => t.id), GUIDES.map(g => g.slug), lastmodDate);
  writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);
  console.log('Regenerated sitemap.xml.');

  if (!DATA_IS_FINAL) {
    console.log('Note: teams.js still has provisional (TBD) teams — team pages for those will read oddly until updated post-draw.');
  }
}

main().catch(err => {
  console.error('Static page generation failed:', err);
  process.exit(1);
});
