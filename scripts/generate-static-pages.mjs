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
        <span class="w-5/12 text-right font-semibold inline-flex items-center justify-end gap-2">${escapeHtml(home.name)} ${logoImg(home)}</span>
        <span class="w-2/12 text-center">${scoreCell(f)}</span>
        <span class="w-5/12 text-left font-semibold inline-flex items-center gap-2">${logoImg(away)} ${escapeHtml(away.name)}</span>
      </div>`;
  }).join('');

  const bodyContent = `
    <h1 class="font-display font-bold text-2xl uppercase mb-1">Matchday ${md} — Champions League Swiss Phase 2026/27</h1>
    <p class="text-sm text-ink-900/60 dark:text-ink-50/60 mb-1">Fixtures and results for Matchday ${md} of the 36-team league phase. Enter your own predictions or view the live simulator for the full table.</p>
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

  const fixtureRows = teamFixtures.map(f => {
    const isHome = f.homeId === team.id;
    const opponent = teamById(isHome ? f.awayId : f.homeId);
    if (!opponent) return '';
    return `
      <div class="flex items-center justify-between py-2 px-3 bg-white dark:bg-ink-900 border border-ink-900/10 dark:border-ink-50/10 rounded-lg text-sm">
        <span class="text-ink-900/50 dark:text-ink-50/50 w-16">MD ${f.matchday}</span>
        <span class="flex-1 font-semibold inline-flex items-center gap-2">${isHome ? 'vs' : '@'} ${logoImg(opponent)} ${escapeHtml(opponent.name)}</span>
        <span>${scoreCell(f)}</span>
      </div>`;
  }).join('');

  const { label } = zoneLabel(row.rank);

  const bodyContent = `
    <h1 class="font-display font-bold text-2xl uppercase mb-1 inline-flex items-center gap-2">${logoImg(team, 30)} ${escapeHtml(team.name)} — Champions League Swiss Phase 2026/27</h1>
    <p class="text-sm text-ink-900/60 dark:text-ink-50/60 mb-1">Current standing, fixtures, and results in the 2026/27 UEFA Champions League league phase.</p>
    ${lastUpdatedHuman ? `<p class="text-[11px] text-ink-900/40 dark:text-ink-50/40">Results last updated ${escapeHtml(lastUpdatedHuman)}.</p>` : ''}

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

    <a href="/" class="inline-block px-4 py-2 rounded-full bg-pitch-500 hover:bg-pitch-600 dark:bg-pitch-400 dark:hover:bg-pitch-300 text-white dark:text-ink-950 font-bold text-sm transition">
      Open the full simulator →
    </a>
  `;

  return pageShell({
    title: `${team.name} — Champions League Swiss Phase 2026/27 Standing & Fixtures`,
    description: `${team.name}'s current standing, fixtures, and results in the 2026/27 UEFA Champions League 36-team Swiss-format league phase.`,
    canonical: `${SITE_URL}/teams/${team.id.toLowerCase()}.html`,
    bodyContent,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: `${team.name} — Champions League Swiss Phase 2026/27 Standing & Fixtures`,
        url: `${SITE_URL}/teams/${team.id.toLowerCase()}.html`,
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
// Sitemap generation (kept in sync with whatever pages actually exist)
// ---------------------------------------------------------------------------
function generateSitemap(matchdayCount, teamIds, lastmod) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', freq: 'daily', lastmod },
    { loc: `${SITE_URL}/about.html`, priority: '0.3', freq: 'yearly' },
    { loc: `${SITE_URL}/privacy.html`, priority: '0.1', freq: 'yearly' },
    { loc: `${SITE_URL}/terms.html`, priority: '0.1', freq: 'yearly' },
  ];
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

  // Sitemap
  const sitemap = generateSitemap(matchdaysPresent.length, TEAMS_DATA.map(t => t.id), lastmodDate);
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
