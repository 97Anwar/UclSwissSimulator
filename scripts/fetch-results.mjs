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

import { writeFileSync } from 'fs';
import { TEAM_NAME_ALIASES, resolveTeamId, normalizeTeamName } from '../js/data/team-aliases.js';

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const OUTPUT_PATH = new URL('../data/real-results.json', import.meta.url);
const COMPETITION_CODE = 'CL'; // football-data.org's code for the Champions League

async function main() {
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

  leaguePhase.forEach(m => {
    const homeId = resolveTeamId(m.homeTeam?.name || m.homeTeam?.shortName || '');
    const awayId = resolveTeamId(m.awayTeam?.name || m.awayTeam?.shortName || '');

    if (!homeId) unresolved.add(m.homeTeam?.name || m.homeTeam?.shortName || 'UNKNOWN_HOME');
    if (!awayId) unresolved.add(m.awayTeam?.name || m.awayTeam?.shortName || 'UNKNOWN_AWAY');
    if (!homeId || !awayId) return; // skip fixtures we can't map cleanly rather than guess

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

  const output = {
    generatedAt: new Date().toISOString(),
    competition: COMPETITION_CODE,
    source: 'football-data.org',
    fixtureCount: fixtures.length,
    fixtures,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${fixtures.length} fixtures to ${OUTPUT_PATH.pathname}`);

  if (fixtures.length === 0) {
    console.log('No league-phase fixtures available yet (matchday schedule not yet published by UEFA/football-data.org as of this run) — this is not an error, just nothing to write.');
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
