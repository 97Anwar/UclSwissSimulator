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
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index, follow">
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
  <link rel="stylesheet" href="css/styles.css">
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body class="min-h-screen flex flex-col antialiased bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50 transition-colors">

  <header class="sticky top-0 z-50 bg-ink-50/95 dark:bg-ink-950/95 border-b-2 border-pitch-500 dark:border-pitch-400 shadow-sm">
    <div class="max-w-7xl mx-auto px-3 sm:px-6">
      <div class="flex items-center justify-between py-2.5 gap-2">
        <a href="index.html" class="flex items-center space-x-2.5 shrink-0">
          <div class="w-8 h-8 rounded-full bg-pitch-500 dark:bg-pitch-400 flex items-center justify-center text-ink-50 dark:text-ink-950 font-display font-bold text-sm">26</div>
          <div class="leading-none">
            <div class="font-display font-bold text-base sm:text-lg tracking-tight uppercase">UCL <span class="text-pitch-600 dark:text-pitch-300">Swiss Phase</span></div>
          </div>
        </a>
        <nav class="hidden md:flex items-center space-x-5 text-sm font-semibold">
          <a href="index.html" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">Simulator</a>
          <a href="about.html" class="text-ink-900/70 dark:text-ink-50/70 hover:text-pitch-600 dark:hover:text-pitch-300 transition">About</a>
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
        <a href="about.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">About</a>
        <a href="privacy.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">Privacy</a>
        <a href="terms.html" class="hover:text-pitch-600 dark:hover:text-pitch-300 transition">Terms</a>
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

function scoreCell(fixture) {
  const played = fixture.realHomeScore !== null && fixture.realAwayScore !== null;
  if (played) return `<span class="font-bold text-pitch-700 dark:text-pitch-300 tabular">${fixture.realHomeScore} – ${fixture.realAwayScore}</span>`;
  return `<span class="text-ink-900/40 dark:text-ink-50/40">vs</span>`;
}

// ---------------------------------------------------------------------------
// Matchday page generation
// ---------------------------------------------------------------------------
function generateMatchdayPage(md, fixtures, standingsRows) {
  const mdFixtures = fixtures.filter(f => f.matchday === md).sort((a, b) => a.id.localeCompare(b.id));

  const rows = mdFixtures.map(f => {
    const home = teamById(f.homeId);
    const away = teamById(f.awayId);
    if (!home || !away) return '';
    return `
      <div class="flex items-center justify-between py-2.5 px-3 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl text-sm">
        <span class="w-5/12 text-right font-semibold">${escapeHtml(home.name)} ${home.country}</span>
        <span class="w-2/12 text-center">${scoreCell(f)}</span>
        <span class="w-5/12 text-left font-semibold">${away.country} ${escapeHtml(away.name)}</span>
      </div>`;
  }).join('');

  const bodyContent = `
    <h1 class="font-display font-bold text-2xl uppercase mb-1">Matchday ${md} — Champions League Swiss Phase 2026/27</h1>
    <p class="text-sm text-ink-900/60 dark:text-ink-50/60 mb-6">Fixtures and results for Matchday ${md} of the 36-team league phase. Enter your own predictions or view the live simulator for the full table.</p>

    <div class="space-y-2 mb-8">${rows}</div>

    <a href="index.html?md=${md}" class="inline-block px-4 py-2 rounded-full bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 font-bold text-sm transition">
      Open in the full simulator →
    </a>

    <div class="mt-10 pt-6 border-t border-ink-900/10 dark:border-ink-50/10">
      <h2 class="font-display font-bold text-sm uppercase text-ink-900/50 dark:text-ink-50/50 mb-3">Other matchdays</h2>
      <div class="flex flex-wrap gap-2">
        ${[1,2,3,4,5,6,7,8].map(n => `<a href="matchday-${n}.html" class="px-3 py-1.5 rounded-full text-xs font-bold transition ${n === md ? 'bg-pitch-500 dark:bg-pitch-400 text-white dark:text-ink-950' : 'bg-ink-900/5 dark:bg-ink-50/5 border border-ink-900/10 dark:border-ink-50/10 hover:bg-ink-900/10'}">MD ${n}</a>`).join('')}
      </div>
    </div>
  `;

  return pageShell({
    title: `Matchday ${md} Fixtures & Results — Champions League Swiss Phase 2026/27`,
    description: `Matchday ${md} fixtures and results for the 2026/27 UEFA Champions League 36-team Swiss-format league phase. Predict remaining matches and see live standings.`,
    canonical: `${SITE_URL}/matchday-${md}.html`,
    bodyContent,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: `UEFA Champions League Matchday ${md} — 2026/27 League Phase`,
      startDate: mdFixtures[0]?.utcDate || undefined,
    },
  });
}

// ---------------------------------------------------------------------------
// Team page generation
// ---------------------------------------------------------------------------
function generateTeamPage(team, fixtures, standingsRows) {
  const row = standingsRows.find(r => r.id === team.id);
  const teamFixtures = fixtures
    .filter(f => f.homeId === team.id || f.awayId === team.id)
    .sort((a, b) => a.matchday - b.matchday);

  const scenario = buildTeamScenario(team, row, fixtures);

  const fixtureRows = teamFixtures.map(f => {
    const isHome = f.homeId === team.id;
    const opponent = teamById(isHome ? f.awayId : f.homeId);
    if (!opponent) return '';
    return `
      <div class="flex items-center justify-between py-2 px-3 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-lg text-sm">
        <span class="text-ink-900/50 dark:text-ink-50/50 w-16">MD ${f.matchday}</span>
        <span class="flex-1 font-semibold">${isHome ? 'vs' : '@'} ${escapeHtml(opponent.name)} ${opponent.country}</span>
        <span>${scoreCell(f)}</span>
      </div>`;
  }).join('');

  const { label } = zoneLabel(row.rank);

  const bodyContent = `
    <h1 class="font-display font-bold text-2xl uppercase mb-1">${escapeHtml(team.name)} ${team.country} — Champions League Swiss Phase 2026/27</h1>
    <p class="text-sm text-ink-900/60 dark:text-ink-50/60 mb-1">Current standing, fixtures, and results in the 2026/27 UEFA Champions League league phase.</p>

    <div class="my-6 p-4 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-xl">
      <div class="grid grid-cols-3 gap-4 text-center mb-4">
        <div><div class="text-2xl font-black text-pitch-600 dark:text-pitch-300 tabular">${row.rank}</div><div class="text-[10px] uppercase text-ink-900/40 dark:text-ink-50/40">Rank</div></div>
        <div><div class="text-2xl font-black tabular">${row.points}</div><div class="text-[10px] uppercase text-ink-900/40 dark:text-ink-50/40">Points</div></div>
        <div><div class="text-2xl font-black tabular">${row.played}</div><div class="text-[10px] uppercase text-ink-900/40 dark:text-ink-50/40">Played</div></div>
      </div>
      <p class="text-sm">${escapeHtml(scenario)}</p>
      <p class="text-xs text-ink-900/40 dark:text-ink-50/40 mt-2">Zone: ${label}</p>
    </div>

    <h2 class="font-display font-bold text-base uppercase mb-3">All fixtures</h2>
    <div class="space-y-2 mb-8">${fixtureRows}</div>

    <a href="index.html" class="inline-block px-4 py-2 rounded-full bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 font-bold text-sm transition">
      Open the full simulator →
    </a>
  `;

  return pageShell({
    title: `${team.name} — Champions League Swiss Phase 2026/27 Standing & Fixtures`,
    description: `${team.name}'s current standing, fixtures, and results in the 2026/27 UEFA Champions League 36-team Swiss-format league phase.`,
    canonical: `${SITE_URL}/teams/${team.id.toLowerCase()}.html`,
    bodyContent,
  });
}

// ---------------------------------------------------------------------------
// Sitemap generation (kept in sync with whatever pages actually exist)
// ---------------------------------------------------------------------------
function generateSitemap(matchdayCount, teamIds) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', freq: 'daily' },
    { loc: `${SITE_URL}/about.html`, priority: '0.3', freq: 'yearly' },
    { loc: `${SITE_URL}/privacy.html`, priority: '0.1', freq: 'yearly' },
    { loc: `${SITE_URL}/terms.html`, priority: '0.1', freq: 'yearly' },
  ];
  for (let md = 1; md <= matchdayCount; md++) {
    urls.push({ loc: `${SITE_URL}/matchday-${md}.html`, priority: '0.8', freq: 'daily' });
  }
  teamIds.forEach(id => {
    urls.push({ loc: `${SITE_URL}/teams/${id.toLowerCase()}.html`, priority: '0.6', freq: 'daily' });
  });

  const body = urls.map(u => `  <url><loc>${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`).join('\n');
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

  // Matchday pages
  const matchdaysPresent = [...new Set(fixtures.map(f => f.matchday))].filter(Boolean).sort((a, b) => a - b);
  matchdaysPresent.forEach(md => {
    const html = generateMatchdayPage(md, fixtures, sortedStandings);
    writeFileSync(join(ROOT, `matchday-${md}.html`), html);
  });
  console.log(`Generated ${matchdaysPresent.length} matchday pages.`);

  // Team pages
  mkdirSync(join(ROOT, 'teams'), { recursive: true });
  TEAMS_DATA.forEach(team => {
    const html = generateTeamPage(team, fixtures, sortedStandings);
    writeFileSync(join(ROOT, 'teams', `${team.id.toLowerCase()}.html`), html);
  });
  console.log(`Generated ${TEAMS_DATA.length} team pages.`);

  // Sitemap
  const sitemap = generateSitemap(matchdaysPresent.length, TEAMS_DATA.map(t => t.id));
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
