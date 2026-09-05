// ============================================================================
// League phase standings calculator
// ============================================================================
// This module builds each team's raw record (points, goals, wins, etc.) from
// the played fixtures, then hands ranking off to tiebreakers.js, which owns
// the full UEFA ranking order. Keeping the football ranking rules in one
// dedicated, independently-tested module (rather than an inline sort here)
// means every consumer ranks identically and each criterion is testable on
// its own.
// ============================================================================

import { getEffectiveScore } from './effective-score.js';
import { rankTeams } from './tiebreakers.js';

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

  // Opponent-based criteria (UEFA tiebreakers 6-8) need each team's collective
  // opponent totals. Build them from every league-phase fixture the team is in
  // (both played and scheduled), summing the opponents' current records. These
  // only actually affect ranking once the phase is complete, but computing
  // them here keeps standings.js the single source of every ranking input.
  const rowById = Object.fromEntries(rows.map(r => [r.id, r]));
  const opponentsOf = {};
  teamsData.forEach(t => { opponentsOf[t.id] = []; });
  fixtures.forEach(f => {
    if (opponentsOf[f.homeId]) opponentsOf[f.homeId].push(f.awayId);
    if (opponentsOf[f.awayId]) opponentsOf[f.awayId].push(f.homeId);
  });
  rows.forEach(r => {
    const opps = opponentsOf[r.id] || [];
    r.oppPoints = opps.reduce((s, oid) => s + (rowById[oid]?.points || 0), 0);
    r.oppGd = opps.reduce((s, oid) => s + (rowById[oid]?.gd || 0), 0);
    r.oppGoalsFor = opps.reduce((s, oid) => s + (rowById[oid]?.goalsFor || 0), 0);
  });

  // The opponent-based criteria (6-8) only apply once every league-phase match
  // has been played, per UEFA. Until then, ties past criterion 5 are broken
  // alphabetically.
  const complete = fixtures.length > 0 && playedMatches === fixtures.length;
  const sortedStandings = rankTeams(rows, { complete });

  // Before a single league-phase match is played, every team is level on
  // 0 points and any "rank"/zone is an artifact of the alphabetical fallback,
  // not a real standing. Expose one shared flag so no consumer shows a
  // misleading pre-season position. It flips true the instant the first
  // real or predicted result lands.
  return { sortedStandings, playedMatches, seasonStarted: playedMatches > 0 };
}
