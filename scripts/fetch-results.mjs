#!/usr/bin/env node
// ============================================================================
// Fetches the real 2026/27 UCL league-phase fixture list and results from
// football-data.org and writes data/real-results.json.
//
// Run by .github/workflows/update-scores.yml on a schedule — this is NOT
// meant to run in the browser (the API key must never be shipped to
// client-side code, so this only ever runs in CI with the key as a secret).
//
// Requires env var FOOTBALL_DATA_TOKEN (get a free key at
// https://www.football-data.org/client/register — no card required).
// ============================================================================

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { TEAM_NAME_ALIASES, resolveTeamId, normalizeTeamName } from '../js/data/team-aliases.js';
import { isMatchdayWindow } from './update-match-schedule.mjs';

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const OUTPUT_PATH = new URL('../data/real-results.json', import.meta.url);

export function areFixturesEqual(existing = [], incoming = []) {
  if (existing.length !== incoming.length) return false;
  for (let i = 0; i < incoming.length; i++) {
    const a = existing[i];
    const b = incoming[i];
    if (!a || !b) return false;
    if (
      a.externalId !== b.externalId ||
      a.matchday !== b.matchday ||
      a.homeId !== b.homeId ||
      a.awayId !== b.awayId ||
      a.homeScore !== b.homeScore ||
      a.awayScore !== b.awayScore ||
      a.status !== b.status ||
      a.utcDate !== b.utcDate
    ) {
      return false;
    }
  }
  return true;
}

// football-data.org uses fuller club names ("... FC", "PAE AEK", "Lille OSC")
// than the shared alias map covers. These fill the gap so their fixtures and
// crests aren't silently skipped. resolveId() tries the shared map first.
const EXTRA_ALIASES = {
  'paris saint-germain fc': 'PSG',
  'manchester city fc': 'MCI',
  'manchester united fc': 'MUN',
  'lille osc': 'LIL',
  'fk shakhtar donetsk': 'SHK',
  'racing club de lens': 'LEN',
  'pae aek': 'AEK',
};
function resolveId(name) {
  return resolveTeamId(name) || EXTRA_ALIASES[normalizeTeamName(name || '')] || null;
}
const COMPETITION_CODE = 'CL'; // football-data.org's code for the Champions League

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  let existingData = null;
  if (existsSync(OUTPUT_PATH)) {
    try {
      existingData = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
    } catch (e) {
      existingData = null;
    }
  }

  // If fixtures are already present on disk and --force is not passed,
  // ensure we are within an active matchday window before querying the API.
  if (existingData?.fixtures?.length > 0 && !force) {
    const windowCheck = isMatchdayWindow(existingData.fixtures, new Date());
    if (!windowCheck.isWindow) {
      console.log(`Skipping results fetch: ${windowCheck.reason}. Use --force to bypass.`);
      return;
    }
    console.log(`Matchday window active: ${windowCheck.reason}`);
  }

  if (!TOKEN) {
    console.error('FOOTBALL_DATA_TOKEN is not set. Get a free key at https://www.football-data.org/client/register and add it as a GitHub Actions secret named FOOTBALL_DATA_TOKEN.');
    process.exit(1);
  }

  console.log(`Fetching ${COMPETITION_CODE} matches from football-data.org ...`);

  const res = await fetch(`https://api.football-data.org/v4/competitions/${COMPETITION_CODE}/matches`, {
    headers: { 'X-Auth-Token': TOKEN },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`API request failed: ${res.status} ${res.statusText}\n${body}`);
    process.exit(1);
  }

  const data = await res.json();
  const matches = Array.isArray(data.matches) ? data.matches : [];
  console.log(`Received ${matches.length} matches.`);

  // Only the league phase has the flat "one big table" format this app
  // models — filter out knockout rounds so we don't mis-render them as
  // regular matchdays.
  const leaguePhase = matches.filter(m => m.stage === 'LEAGUE_STAGE' || m.stage === 'GROUP_STAGE');

  const unresolved = new Set();
  const fixtures = [];
  const crestById = {}; // internal team id -> crest image URL from the API

  leaguePhase.forEach(m => {
    const homeId = resolveId(m.homeTeam?.name || m.homeTeam?.shortName || '');
    const awayId = resolveId(m.awayTeam?.name || m.awayTeam?.shortName || '');

    if (!homeId) unresolved.add(m.homeTeam?.name || m.homeTeam?.shortName || 'UNKNOWN_HOME');
    if (!awayId) unresolved.add(m.awayTeam?.name || m.awayTeam?.shortName || 'UNKNOWN_AWAY');
    if (!homeId || !awayId) return; // skip fixtures we can't map cleanly rather than guess

    if (m.homeTeam?.crest) crestById[homeId] = m.homeTeam.crest;
    if (m.awayTeam?.crest) crestById[awayId] = m.awayTeam.crest;

    const matchday = m.matchday || null;
    const homeScore = m.score?.fullTime?.home ?? null;
    const awayScore = m.score?.fullTime?.away ?? null;

    fixtures.push({
      externalId: m.id,
      matchday,
      homeId,
      awayId,
      homeScore,
      awayScore,
      status: m.status, // e.g. SCHEDULED, IN_PLAY, FINISHED, POSTPONED
      utcDate: m.utcDate,
    });
  });

  if (unresolved.size > 0) {
    console.warn('WARNING: the following team names from the API did not match any entry in js/data/team-aliases.js — those fixtures were skipped:');
    unresolved.forEach(name => console.warn(`  - "${name}" (normalized: "${normalizeTeamName(name)}")`));
    console.warn('Add the missing spelling to TEAM_NAME_ALIASES and re-run.');
  }

  const hasChanges = !existingData?.fixtures || !areFixturesEqual(existingData.fixtures, fixtures);

  if (!hasChanges && existingData?.generatedAt) {
    console.log(`No score, status, or schedule changes detected across all ${fixtures.length} fixtures. data/real-results.json left untouched.`);
  } else {
    const output = {
      generatedAt: new Date().toISOString(),
      competition: COMPETITION_CODE,
      source: 'football-data.org',
      fixtureCount: fixtures.length,
      fixtures,
    };

    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
    console.log(`Detected changes in fixtures/scores. Wrote ${fixtures.length} fixtures to ${OUTPUT_PATH.pathname}`);
  }

  await downloadCrests(crestById);

  if (fixtures.length === 0) {
    console.log('No league-phase fixtures available yet (matchday schedule not yet published by UEFA/football-data.org as of this run) — this is not an error, just nothing to write.');
  }
}

// Downloads each team's crest to assets/logos/{id}.png (same-origin, so the
// PNG export stays html2canvas-safe). Idempotent: skips logos already on disk
// so CI doesn't re-fetch all 36 every run. Prefers a PNG raster but falls back
// to the original URL (e.g. an SVG-only crest) so nothing is silently dropped.
async function downloadCrests(crestById) {
  const ids = Object.keys(crestById);
  if (ids.length === 0) return;
  const logosDir = fileURLToPath(new URL('../assets/logos/', import.meta.url));
  mkdirSync(logosDir, { recursive: true });
  let ok = 0, skip = 0, fail = 0;
  for (const id of ids) {
    const dest = join(logosDir, `${id.toLowerCase()}.png`);
    if (existsSync(dest)) { skip++; continue; }
    const src = crestById[id];
    const candidates = src.endsWith('.svg') ? [src.replace(/\.svg$/, '.png'), src] : [src];
    let saved = false;
    for (const url of candidates) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
        saved = true; ok++; break;
      } catch (e) { /* try next candidate */ }
    }
    if (!saved) { console.warn(`  - crest download failed for ${id} (${src})`); fail++; }
  }
  console.log(`Crests: ${ok} downloaded, ${skip} already present${fail ? `, ${fail} failed` : ''} in assets/logos/.`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}