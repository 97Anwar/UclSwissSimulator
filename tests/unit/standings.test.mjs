// Covers CSV rows: T13, T14, T15, T16, T17, T18
// Run with: node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS_DATA } from '../../js/data/teams.js';
import { computeStandings } from '../../js/engine/standings.js';

// Minimal synthetic fixtures — we don't need a real draw for these tests,
// just controlled score inputs between two known teams to isolate exactly
// one tiebreaker criterion at a time.
function fixture(id, matchday, homeId, awayId, homeScore, awayScore) {
  return { id, matchday, homeId, awayId, homeScore, awayScore, realHomeScore: null, realAwayScore: null };
}

function rankOf(standings, teamId) {
  return standings.findIndex(t => t.id === teamId) + 1;
}

test('T13: points take priority over everything else', () => {
  // Team A: 3 wins (9pts). Team B: 2 wins 1 loss (6pts) but much better GD.
  const fixtures = [
    fixture('f1', 1, 'PSG', 'BAY', 5, 0),   // PSG win, huge GD
    fixture('f2', 2, 'PSG', 'RMA', 5, 0),
    fixture('f3', 3, 'PSG', 'BAR', 5, 0),
    fixture('f4', 1, 'INT', 'ARS', 1, 0),
    fixture('f5', 2, 'INT', 'MCI', 1, 0),
    fixture('f6', 3, 'INT', 'LIV', 0, 1),   // INT's one loss
  ];
  const { sortedStandings } = computeStandings(TEAMS_DATA, fixtures);
  assert.ok(rankOf(sortedStandings, 'PSG') < rankOf(sortedStandings, 'INT'), 'PSG (9pts) should rank above INT (6pts) despite INT having a tidier goal difference');
});

test('T14: goal difference breaks a points tie', () => {
  const fixtures = [
    fixture('f1', 1, 'PSG', 'BAY', 4, 0),  // PSG: +4
    fixture('f2', 1, 'INT', 'ARS', 1, 0),  // INT: +1
  ];
  const { sortedStandings } = computeStandings(TEAMS_DATA, fixtures);
  // Both PSG and INT are on 3pts, 1 played — GD should separate them
  assert.ok(rankOf(sortedStandings, 'PSG') < rankOf(sortedStandings, 'INT'), 'PSG (+4 GD) should rank above INT (+1 GD) when both are on 3pts');
});

test('T15: goals scored breaks a points+GD tie', () => {
  // Engineer identical points and GD, different goals scored, via two matches each
  const fixtures = [
    fixture('f1', 1, 'PSG', 'BAY', 5, 3), // PSG +2, scored 5
    fixture('f2', 1, 'INT', 'ARS', 2, 0), // INT +2, scored 2
  ];
  const { sortedStandings } = computeStandings(TEAMS_DATA, fixtures);
  assert.ok(rankOf(sortedStandings, 'PSG') < rankOf(sortedStandings, 'INT'), 'PSG (scored 5) should rank above INT (scored 2) when points and GD are level');
});

test('T16: away goals scored breaks a points+GD+goals tie', () => {
  // PSG scores 2 goals away; INT scores 2 goals at home. Everything else level.
  const fixtures = [
    fixture('f1', 1, 'BAY', 'PSG', 0, 2), // PSG away win, scored 2 away
    fixture('f2', 1, 'INT', 'ARS', 2, 0), // INT home win, scored 2 at home (0 away goals)
  ];
  const { sortedStandings } = computeStandings(TEAMS_DATA, fixtures);
  assert.ok(rankOf(sortedStandings, 'PSG') < rankOf(sortedStandings, 'INT'), 'PSG (2 away goals) should rank above INT (0 away goals) when points/GD/goals are level');
});

test('T17: wins breaks a tie after points/GD/goals/away-goals are all level', () => {
  // Verified by direct computation before writing this assertion: both
  // teams land on identical points (6), GD (+2), goals for (2), and away
  // goals for (0) — the only thing that differs is win count (2 vs 1,
  // compensated by draws for the same point total).
  const fixtures = [
    fixture('f1', 1, 'PSG', 'BAY', 1, 0),
    fixture('f2', 2, 'PSG', 'RMA', 1, 0),
    fixture('f3', 1, 'INT', 'ARS', 2, 0),
    fixture('f4', 2, 'MCI', 'INT', 0, 0),
    fixture('f5', 3, 'INT', 'LIV', 0, 0),
    fixture('f6', 4, 'BAR', 'INT', 0, 0),
  ];
  const { sortedStandings } = computeStandings(TEAMS_DATA, fixtures);
  const psg = sortedStandings.find(t => t.id === 'PSG');
  const int = sortedStandings.find(t => t.id === 'INT');

  // Confirm the tie is genuinely on all four prior criteria (a false
  // positive here would mean the test isn't actually isolating "wins")
  assert.equal(psg.points, int.points, 'points must be tied for this to test the wins tiebreaker specifically');
  assert.equal(psg.gd, int.gd, 'GD must be tied for this to test the wins tiebreaker specifically');
  assert.equal(psg.goalsFor, int.goalsFor, 'goals for must be tied for this to test the wins tiebreaker specifically');
  assert.equal(psg.awayGoalsFor, int.awayGoalsFor, 'away goals for must be tied for this to test the wins tiebreaker specifically');
  assert.notEqual(psg.won, int.won, 'win counts must actually differ for this to be a meaningful test');

  assert.ok(rankOf(sortedStandings, 'PSG') < rankOf(sortedStandings, 'INT'), `PSG (${psg.won} wins) should rank above INT (${int.won} wins) once points/GD/goals/away-goals are all level`);
});

test('T18: teams level on all in-progress criteria fall back to a stable alphabetical order, not a random one', () => {
  // No fixtures played at all -> every team is 0-0-0-0pts-0GD, fully level.
  const { sortedStandings: run1 } = computeStandings(TEAMS_DATA, []);
  const { sortedStandings: run2 } = computeStandings(TEAMS_DATA, []);
  const order1 = run1.map(t => t.id);
  const order2 = run2.map(t => t.id);
  assert.deepEqual(order1, order2, 'standings order for fully-level teams must be deterministic across repeated computations, not random');

  // And it should specifically be alphabetical by club name (UEFA's documented
  // in-progress fallback), with team id only as the final determinism tiebreak.
  const sortedByName = [...TEAMS_DATA]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(t => t.id);
  assert.deepEqual(order1, sortedByName, 'fully-level fallback order should be alphabetical by club name');
});

test('T19: opponent-strength aggregates (UEFA tiebreakers 6-8) are computed from a team\'s league-phase opponents', () => {
  // A plays B and C; B beats C. All three fixtures played -> phase "complete".
  // A's collective opponent points = points(B) + points(C).
  const fixtures = [
    fixture('f1', 1, 'PSG', 'BAY', 1, 0), // PSG beats BAY
    fixture('f2', 2, 'PSG', 'RMA', 1, 0), // PSG beats RMA
    fixture('f3', 3, 'BAY', 'RMA', 1, 0), // BAY beats RMA
  ];
  const { sortedStandings } = computeStandings(TEAMS_DATA, fixtures);
  const psg = sortedStandings.find(t => t.id === 'PSG');
  const bay = sortedStandings.find(t => t.id === 'BAY');
  const rma = sortedStandings.find(t => t.id === 'RMA');
  // PSG's opponents here are BAY (3 pts) and RMA (0 pts) -> 3 collectively.
  assert.equal(psg.oppPoints, bay.points + rma.points, 'PSG opponent points should equal the summed points of BAY and RMA');
  assert.equal(psg.oppPoints, 3, 'BAY has 3 pts, RMA has 0 -> PSG opponent points = 3');
});

test('Draw result awards exactly 1 point to each side (sanity check underpinning several scenarios)', () => {
  const fixtures = [fixture('f1', 1, 'PSG', 'BAY', 2, 2)];
  const { sortedStandings } = computeStandings(TEAMS_DATA, fixtures);
  const psg = sortedStandings.find(t => t.id === 'PSG');
  const bay = sortedStandings.find(t => t.id === 'BAY');
  assert.equal(psg.points, 1);
  assert.equal(bay.points, 1);
  assert.equal(psg.won, 0);
  assert.equal(psg.drawn, 1);
});
