import { TEAMS_DATA, DATA_IS_FINAL } from './data/teams.js';
import { generateSwissFixtures } from './engine/draw.js';
import { simulateMatchScores } from './engine/simulator.js';
import { computeStandings } from './engine/standings.js';
import { renderFixturesList, renderStandingsTable, renderExportCard } from './ui/renderer.js';
import { renderShareButtons } from './ui/share.js';

const STORAGE_KEY = 'ucl_sim_v5';
const PREDICTIONS_KEY = 'ucl_sim_predictions_v5';
const THEME_KEY = 'ucl_sim_theme';

let activeMatchday = 1;
let fixtures = [];       // always the array actually rendered/used for standings
let mode = 'hypothetical'; // 'real' | 'hypothetical'
let realFixturesAvailable = false;
let realDataMeta = null;
let isDarkMode = false; // light is the default theme

async function init() {
  applyStoredTheme();
  renderDataFreshnessBanner();
  await loadRealDataAndBuildFixtures();
  applyInitialMatchdayFromUrl();
  bindEvents();
  renderUI();
  renderShareButtons(document.getElementById('share-buttons'), buildExportImageBlob);
}

// Matchday pages (matchday-N.html) link into the simulator as
// index.html?md=N — honor that on load so "open in full simulator" from a
// matchday page actually lands on the right matchday instead of always MD1.
function applyInitialMatchdayFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const md = parseInt(params.get('md'), 10);
  if (md >= 1 && md <= 8) activeMatchday = md;
}

function updateUrlForMatchday(md) {
  const url = new URL(window.location.href);
  url.searchParams.set('md', String(md));
  window.history.replaceState({}, '', url); // replaceState, not push — clicking through 8 matchdays shouldn't fill up back-button history
}

// ----------------------------------------------------------------------
// Theme (light is default; dark is opt-in and persisted)
// ----------------------------------------------------------------------

function applyStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  isDarkMode = stored === 'dark'; // anything else (including "never set") -> light
  document.documentElement.classList.toggle('dark', isDarkMode);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.innerText = isDarkMode ? '☀️' : '🌙';
}

function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.documentElement.classList.toggle('dark', isDarkMode);
  localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light');
  const icon = document.getElementById('theme-icon');
  if (icon) icon.innerText = isDarkMode ? '☀️' : '🌙';
}

// ----------------------------------------------------------------------
// Real-data loading
// ----------------------------------------------------------------------

async function fetchRealResults() {
  try {
    const res = await fetch('data/real-results.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !Array.isArray(json.fixtures)) return null;
    return json;
  } catch (e) {
    console.warn('Could not load real-results.json (offline, or file missing):', e);
    return null;
  }
}

function realFixturesToAppFixtures(realJson) {
  const predictions = loadStoredPredictions();
  return realJson.fixtures.map((rf, i) => {
    const id = `REAL_${rf.externalId ?? i}`;
    const pred = predictions[id];
    const predictionStillRelevant = pred && rf.status !== 'FINISHED';
    return {
      id,
      matchday: rf.matchday,
      homeId: rf.homeId,
      awayId: rf.awayId,
      homeScore: predictionStillRelevant ? pred.homeScore : null,
      awayScore: predictionStillRelevant ? pred.awayScore : null,
      realHomeScore: rf.homeScore,
      realAwayScore: rf.awayScore,
      realStatus: rf.status,
    };
  });
}

async function loadRealDataAndBuildFixtures() {
  const realJson = await fetchRealResults();
  const savedMode = localStorage.getItem(STORAGE_KEY + '_mode');

  if (realJson && realJson.fixtures.length > 0) {
    realFixturesAvailable = true;
    realDataMeta = realJson;
  } else {
    realFixturesAvailable = false;
    realDataMeta = null;
  }

  if (realFixturesAvailable && savedMode !== 'hypothetical') {
    mode = 'real';
    fixtures = realFixturesToAppFixtures(realDataMeta);
  } else {
    mode = 'hypothetical';
    fixtures = loadOrGenerateHypotheticalFixtures();
  }

  renderModeBanner();
}

function loadOrGenerateHypotheticalFixtures() {
  const saved = localStorage.getItem(STORAGE_KEY + '_hypothetical');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const validIds = new Set(TEAMS_DATA.map(t => t.id));
      const looksValid = Array.isArray(parsed) && parsed.length === 144 &&
        parsed.every(f => validIds.has(f.homeId) && validIds.has(f.awayId));
      if (looksValid) return parsed;
    } catch (e) { /* fall through to regenerate */ }
  }
  return safeGenerateHypotheticalFixtures();
}

function safeGenerateHypotheticalFixtures() {
  try {
    return generateSwissFixtures(TEAMS_DATA).map(f => ({ ...f, realHomeScore: null, realAwayScore: null, realStatus: null }));
  } catch (e) {
    console.error(e);
    showDrawError(e.message);
    return [];
  }
}

// ----------------------------------------------------------------------
// Predictions storage
// ----------------------------------------------------------------------

function loadStoredPredictions() {
  try { return JSON.parse(localStorage.getItem(PREDICTIONS_KEY) || '{}'); } catch (e) { return {}; }
}

function saveStoredPredictions(predictions) {
  try { localStorage.setItem(PREDICTIONS_KEY, JSON.stringify(predictions)); } catch (e) { /* non-fatal */ }
}

function setPrediction(fixtureId, homeScore, awayScore) {
  const predictions = loadStoredPredictions();
  if (homeScore === null && awayScore === null) delete predictions[fixtureId];
  else predictions[fixtureId] = { homeScore, awayScore };
  saveStoredPredictions(predictions);
}

function clearAllPredictionsForCurrentFixtures() {
  clearPredictionsFor(fixtures);
}

function clearPredictionsFor(fixtureSubset) {
  const predictions = loadStoredPredictions();
  fixtureSubset.forEach(f => { delete predictions[f.id]; });
  saveStoredPredictions(predictions);
}

// ----------------------------------------------------------------------
// UI banners
// ----------------------------------------------------------------------

function renderDataFreshnessBanner() {
  const el = document.getElementById('data-freshness-banner');
  if (!el) return;
  if (DATA_IS_FINAL) { el.classList.add('hidden'); return; }
  const provisionalCount = TEAMS_DATA.filter(t => !t.confirmed).length;
  el.innerHTML = `⚠️ ${provisionalCount} of 36 teams are provisional — the real 2026/27 draw is Aug 27. Placeholder teams are marked <span class="px-1 py-0.5 rounded bg-gold-500/20 text-gold-600 dark:text-gold-400 font-bold">TBD</span>.`;
  el.classList.remove('hidden');
}

function renderModeBanner() {
  const el = document.getElementById('mode-banner');
  if (!el) return;

  if (mode === 'real') {
    const updated = realDataMeta?.generatedAt ? new Date(realDataMeta.generatedAt).toLocaleString() : 'unknown';
    el.className = "text-[11px] sm:text-xs bg-pitch-500/10 border border-pitch-500/40 text-pitch-700 dark:text-pitch-300 rounded-lg px-3 py-2";
    el.innerHTML = `🟢 Showing the real official draw and results (last synced ${updated}). Enter a score to override any match — Reset restores the real result.`;
  } else if (realFixturesAvailable) {
    el.className = "text-[11px] sm:text-xs bg-blue-500/10 border border-blue-500/40 text-blue-700 dark:text-blue-300 rounded-lg px-3 py-2";
    el.innerHTML = `🔀 Showing a hypothetical random draw, not the real one. <button id="btn-switch-to-real" class="underline font-bold">Switch to the real draw &amp; results</button>`;
  } else {
    el.className = "text-[11px] sm:text-xs bg-ink-900/5 dark:bg-ink-50/5 border border-ink-900/10 dark:border-ink-50/10 text-ink-900/60 dark:text-ink-50/60 rounded-lg px-3 py-2";
    el.innerHTML = `🔀 Showing a hypothetical draw — the real 2026/27 draw hasn't been announced yet (or hasn't synced here yet).`;
  }
  el.classList.remove('hidden');

  const switchBtn = document.getElementById('btn-switch-to-real');
  if (switchBtn) {
    switchBtn.addEventListener('click', () => {
      mode = 'real';
      localStorage.setItem(STORAGE_KEY + '_mode', 'real');
      fixtures = realFixturesToAppFixtures(realDataMeta);
      renderModeBanner();
      renderUI();
    });
  }
}

function showDrawError(message) {
  const el = document.getElementById('draw-error-banner');
  if (!el) return;
  el.textContent = `Draw generation error: ${message}`;
  el.classList.remove('hidden');
}

function hideDrawError() {
  const el = document.getElementById('draw-error-banner');
  if (el) el.classList.add('hidden');
}

// ----------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------

// Recomputes only the standings table and the played counter. Score edits
// go through here so the fixtures list DOM (and the input being typed in)
// is never rebuilt mid-keystroke — that's what makes live editing work.
function renderStandingsOnly() {
  const { sortedStandings, playedMatches } = computeStandings(TEAMS_DATA, fixtures);

  const counterEl = document.getElementById('matches-played-counter');
  if (counterEl) counterEl.innerText = `${playedMatches} / 144 Played`;

  const standingsEl = document.getElementById('standings-rows');
  if (standingsEl) renderStandingsTable(standingsEl, sortedStandings);
}

function renderUI() {
  const titleEl = document.getElementById('matchday-header-title');
  if (titleEl) titleEl.innerText = `Matchday ${activeMatchday} (18 Fixtures)`;

  const mobileBadge = document.getElementById('mobile-md-badge');
  if (mobileBadge) mobileBadge.innerText = `MD ${activeMatchday}`;

  const pillsEl = document.getElementById('matchday-pills');
  if (pillsEl) {
    pillsEl.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8].map(md => {
      const isActive = md === activeMatchday;
      const activeClass = isActive
        ? "bg-pitch-500 dark:bg-pitch-400 text-white dark:text-ink-950 font-black shadow-sm"
        : "bg-ink-900/5 dark:bg-ink-50/5 border border-ink-900/10 dark:border-ink-50/10 text-ink-900/50 dark:text-ink-50/50 hover:text-ink-900 dark:hover:text-ink-50";
      return `<button data-md="${md}" class="md-pill py-1.5 rounded-lg text-xs font-bold transition ${activeClass}">MD ${md}</button>`;
    }).join('');
    pillsEl.querySelectorAll('.md-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeMatchday = parseInt(btn.dataset.md, 10);
        updateUrlForMatchday(activeMatchday);
        renderUI();
      });
    });
  }

  renderFixturesSection();
  renderStandingsOnly();
}

function handleScoreChange(fid, side, val) {
  const fix = fixtures.find(f => f.id === fid);
  if (fix) {
    if (side === 'home') fix.homeScore = val;
    if (side === 'away') fix.awayScore = val;
    setPrediction(fid, fix.homeScore, fix.awayScore);
    persistFixtures();
    renderStandingsOnly();
  }
}

// Full rebuild of the fixture cards. Only called on structural changes
// (matchday switch, simulate, reset, regenerate) — never on a live score
// edit, so there's no input being typed in to preserve focus for.
function renderFixturesSection() {
  const fixturesEl = document.getElementById('fixtures-list');
  if (!fixturesEl) return;
  renderFixturesList(fixturesEl, fixtures, activeMatchday, handleScoreChange);
}

function persistFixtures() {
  if (mode !== 'hypothetical') return;
  try { localStorage.setItem(STORAGE_KEY + '_hypothetical', JSON.stringify(fixtures)); } catch (e) { /* non-fatal */ }
}

// ----------------------------------------------------------------------
// Export / share
// ----------------------------------------------------------------------

async function buildExportImageBlob() {
  const target = document.getElementById('export-render-target');
  if (!target || !window.html2canvas) return null;

  const { sortedStandings } = computeStandings(TEAMS_DATA, fixtures);
  renderExportCard(target, sortedStandings, {
    subtitle: mode === 'real' ? 'Real Draw · UCL Swiss Phase 2026/27' : 'Hypothetical Draw · UCL Swiss Phase 2026/27',
  });

  // Wait for the actual web fonts (Oswald/Inter) to finish loading before
  // capturing — not just a fixed delay. html2canvas measures text using
  // whatever font is ACTUALLY active at capture time; if the real font is
  // still loading, it captures mid-swap or with fallback metrics that
  // don't match the real glyphs' line-height, which is what caused every
  // row's text to render clipped in half. document.fonts.ready resolves
  // only once every requested @font-face has genuinely finished loading.
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  // Small extra buffer for layout/reflow to settle after fonts swap in —
  // cheap insurance on top of the real fix above, not a substitute for it.
  await new Promise(r => setTimeout(r, 50));

  const canvas = await html2canvas(target.firstElementChild, { backgroundColor: '#FFFFFF', scale: 2 });
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// ----------------------------------------------------------------------
// Events
// ----------------------------------------------------------------------

function bindEvents() {
  const simAll = document.getElementById('btn-simulate-all');
  if (simAll) simAll.addEventListener('click', () => {
    simulateMatchScores(fixtures);
    fixtures.forEach(f => setPrediction(f.id, f.homeScore, f.awayScore));
    persistFixtures();
    renderUI();
  });

  const simMd = document.getElementById('btn-simulate-matchday');
  if (simMd) simMd.addEventListener('click', () => {
    const mdFixtures = fixtures.filter(f => f.matchday === activeMatchday);
    simulateMatchScores(mdFixtures);
    mdFixtures.forEach(f => setPrediction(f.id, f.homeScore, f.awayScore));
    persistFixtures();
    renderUI();
  });

  const resetMdBtn = document.getElementById('btn-reset-matchday');
  if (resetMdBtn) resetMdBtn.addEventListener('click', () => {
    const confirmMsg = mode === 'real'
      ? `Clear your predictions for Matchday ${activeMatchday} and revert those matches to the real official result?`
      : `Reset all fixtures on Matchday ${activeMatchday} in this hypothetical draw?`;
    if (!confirm(confirmMsg)) return;

    const mdFixtures = fixtures.filter(f => f.matchday === activeMatchday);
    mdFixtures.forEach(f => { f.homeScore = null; f.awayScore = null; });
    clearPredictionsFor(mdFixtures);
    persistFixtures();
    renderUI();
  });

  const resetBtn = document.getElementById('btn-reset-all');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    const confirmMsg = mode === 'real'
      ? 'Clear all your predictions and revert every match to the real official result?'
      : 'Reset all 144 fixtures in this hypothetical draw?';
    if (!confirm(confirmMsg)) return;

    fixtures.forEach(f => { f.homeScore = null; f.awayScore = null; });
    clearAllPredictionsForCurrentFixtures();
    persistFixtures();
    renderUI();
  });

  const regenBtn = document.getElementById('btn-regenerate-draw');
  if (regenBtn) regenBtn.addEventListener('click', () => {
    if (!confirm('Generate a brand new hypothetical random draw? This switches away from the real official draw/results (if available) and clears predictions for the new fixtures.')) return;
    hideDrawError();
    mode = 'hypothetical';
    localStorage.setItem(STORAGE_KEY + '_mode', 'hypothetical');
    fixtures = safeGenerateHypotheticalFixtures();
    persistFixtures();
    renderModeBanner();
    renderUI();
  });

  const exportBtn = document.getElementById('btn-export-img');
  if (exportBtn) exportBtn.addEventListener('click', async () => {
    const blob = await buildExportImageBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ucl-swiss-standings.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  const fixTab = document.getElementById('tab-btn-fixtures');
  const tableTab = document.getElementById('tab-btn-table');
  const fixSec = document.getElementById('section-fixtures');
  const standSec = document.getElementById('section-standings');
  if (fixTab && tableTab && fixSec && standSec) {
    fixTab.addEventListener('click', () => {
      fixSec.classList.remove('hidden');
      standSec.classList.add('hidden');
      fixTab.className = "py-2 rounded-lg bg-pitch-500 dark:bg-pitch-400 text-white dark:text-ink-950 font-bold shadow transition";
      tableTab.className = "py-2 rounded-lg text-ink-900/60 dark:text-ink-50/60 hover:text-ink-900 dark:hover:text-ink-50 transition";
    });
    tableTab.addEventListener('click', () => {
      fixSec.classList.add('hidden');
      standSec.classList.remove('hidden');
      tableTab.className = "py-2 rounded-lg bg-pitch-500 dark:bg-pitch-400 text-white dark:text-ink-950 font-bold shadow transition";
      fixTab.className = "py-2 rounded-lg text-ink-900/60 dark:text-ink-50/60 hover:text-ink-900 dark:hover:text-ink-50 transition";
    });
  }
}

window.addEventListener('DOMContentLoaded', init);
