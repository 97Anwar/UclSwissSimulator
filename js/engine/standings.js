// ============================================================================
// League phase standings calculator
// ============================================================================
// Tiebreaker order (per UEFA Champions League regulations), applied only
// among teams still level after each prior criterion:
//   1. Points
//   2. Goal difference
//   3. Goals scored
//   4. Goals scored away from home
//   5. Wins
//   6. Away wins
// If teams are still level after all 6 criteria, this build ranks them by
// team id as a stable fallback — it does NOT implement a head-to-head
// mini-league (rule 7 in the real regulations). That's a known, documented
// gap, not a silent omission.
// ============================================================================

import { getEffectiveScore } from './effective-score.js';

export function computeStandings(teamsData, fixtures) {
  const teamById = Object.fromEntries(teamsData.map(t => [t.id, t]));
  const table = {};
  teamsData.forEach(t => {
    table[t.id] = {
      id: t.id, name: t.name, country: t.country, confirmed: t.confirmed,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0,
      awayGoalsFor: 0,
      awayWins: 0,
      points: 0,
    };
  });

  let playedMatches = 0;

  fixtures.forEach(f => {
    const { homeScore, awayScore } = getEffectiveScore(f);
    if (homeScore === null || awayScore === null) return;
    const home = table[f.homeId];
    const away = table[f.awayId];
    if (!home || !away) return;

    playedMatches += 1;
    home.played += 1; away.played += 1;
    home.goalsFor += homeScore; home.goalsAgainst += awayScore;
    away.goalsFor += awayScore; away.goalsAgainst += homeScore;
    away.awayGoalsFor += awayScore;

    if (homeScore > awayScore) {
      home.won += 1; away.lost += 1; home.points += 3;
    } else if (homeScore < awayScore) {
      away.won += 1; home.lost += 1; away.points += 3; away.awayWins += 1;
    } else {
      home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1;
    }
  });

  const rows = Object.values(table).map(r => ({ ...r, gd: r.goalsFor - r.goalsAgainst }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (b.awayGoalsFor !== a.awayGoalsFor) return b.awayGoalsFor - a.awayGoalsFor;
    if (b.won !== a.won) return b.won - a.won;
    if (b.awayWins !== a.awayWins) return b.awayWins - a.awayWins;
    return a.id.localeCompare(b.id);
  });

  // Attach rank explicitly (1-indexed) so every consumer reads the same
  // number from the same place, rather than each caller re-deriving it
  // from array position and risking drift.
  rows.forEach((r, i) => { r.rank = i + 1; });

  return { sortedStandings: rows, playedMatches };
}
