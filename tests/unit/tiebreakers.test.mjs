// Unit tests for the UEFA league-phase tiebreaker module.
// Run with: node --test tests/unit
//
// These exercise each ranking criterion in isolation on synthetic standings
// rows, plus the two-phase rule (opponent-based criteria 6-8 apply only once
// the league phase is complete) and the alphabetical fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankTeams,
  byGoalDifference,
  byGoalsScored,
  byAwayGoals,
  byWins,
  byAwayWins,
  byOpponentPoints,
  byOpponentGoalDifference,
  byOpponentGoals,
  byNameAlphabetical,
} from '../../js/engine/tiebreakers.js';

function row(id, o = {}) {
  return {
    id,
    name: o.name ?? id,
    points: o.points ?? 0,
    gd: o.gd ?? 0,
    goalsFor: o.goalsFor ?? 0,
    awayGoalsFor: o.awayGoalsFor ?? 0,
    won: o.won ?? 0,
    awayWins: o.awayWins ?? 0,
    oppPoints: o.oppPoints ?? 0,
    oppGd: o.oppGd ?? 0,
    oppGoalsFor: o.oppGoalsFor ?? 0,
  };
}

function rankedIds(rows, opts) {
  return rankTeams(rows, opts).map(r => r.id);
}

test('a comparator returns negative when the first team should rank above the second', () => {
  assert.ok(byGoalDifference(row('A', { gd: 5 }), row('B', { gd: 1 })) < 0);
  assert.ok(byGoalsScored(row('A', { goalsFor: 9 }), row('B', { goalsFor: 2 })) < 0);
  assert.ok(byAwayGoals(row('A', { awayGoalsFor: 3 }), row('B', { awayGoalsFor: 0 })) < 0);
  assert.ok(byWins(row('A', { won: 5 }), row('B', { won: 2 })) < 0);
  assert.ok(byAwayWins(row('A', { awayWins: 3 }), row('B', { awayWins: 1 })) < 0);
});

test('criterion 1: goal difference outranks goals scored', () => {
  const rows = [row('A', { points: 6, gd: 1, goalsFor: 10 }), row('B', { points: 6, gd: 4, goalsFor: 4 })];
  assert.deepEqual(rankedIds(rows), ['B', 'A'], 'B (+4 GD) ranks above A (+1 GD) despite A scoring more');
});

test('criterion 2: goals scored breaks a points+GD tie', () => {
  const rows = [row('A', { points: 6, gd: 2, goalsFor: 3 }), row('B', { points: 6, gd: 2, goalsFor: 7 })];
  assert.deepEqual(rankedIds(rows), ['B', 'A']);
});

test('criterion 3: away goals break a points+GD+goals tie', () => {
  const rows = [row('A', { points: 6, gd: 2, goalsFor: 5, awayGoalsFor: 1 }), row('B', { points: 6, gd: 2, goalsFor: 5, awayGoalsFor: 4 })];
  assert.deepEqual(rankedIds(rows), ['B', 'A']);
});

test('criterion 4: wins break a tie once goals/away-goals are level', () => {
  const rows = [row('A', { points: 6, gd: 2, goalsFor: 5, awayGoalsFor: 2, won: 2 }), row('B', { points: 6, gd: 2, goalsFor: 5, awayGoalsFor: 2, won: 3 })];
  assert.deepEqual(rankedIds(rows), ['B', 'A']);
});

test('criterion 5: away wins are the last in-progress criterion', () => {
  const base = { points: 6, gd: 2, goalsFor: 5, awayGoalsFor: 2, won: 2 };
  const rows = [row('A', { ...base, awayWins: 1 }), row('B', { ...base, awayWins: 2 })];
  assert.deepEqual(rankedIds(rows), ['B', 'A']);
});

test('criteria 6-8 (opponent strength) are IGNORED while the phase is in progress', () => {
  // A and B are identical on criteria 1-5; only opponent points differ. In
  // progress, this must NOT separate them — they fall back to alphabetical.
  const base = { points: 6, gd: 2, goalsFor: 5, awayGoalsFor: 2, won: 2, awayWins: 1 };
  const rows = [
    row('Zebra', { ...base, name: 'Zebra', oppPoints: 99 }),
    row('Alpha', { ...base, name: 'Alpha', oppPoints: 0 }),
  ];
  assert.deepEqual(rankedIds(rows, { complete: false }), ['Alpha', 'Zebra'], 'in progress -> alphabetical, opponent points ignored');
});

test('criterion 6: opponent points DO break the tie once the phase is complete', () => {
  const base = { points: 6, gd: 2, goalsFor: 5, awayGoalsFor: 2, won: 2, awayWins: 1 };
  const rows = [
    row('Alpha', { ...base, name: 'Alpha', oppPoints: 3 }),
    row('Zebra', { ...base, name: 'Zebra', oppPoints: 12 }),
  ];
  assert.deepEqual(rankedIds(rows, { complete: true }), ['Zebra', 'Alpha'], 'complete -> higher opponent points ranks above, overriding alphabetical');
});

test('criterion 7: opponent goal difference breaks a tie after opponent points', () => {
  const base = { points: 6, gd: 2, goalsFor: 5, awayGoalsFor: 2, won: 2, awayWins: 1, oppPoints: 10 };
  const rows = [row('A', { ...base, oppGd: 1 }), row('B', { ...base, oppGd: 8 })];
  assert.deepEqual(rankedIds(rows, { complete: true }), ['B', 'A']);
});

test('criterion 8: opponent goals scored breaks a tie after opponent points and GD', () => {
  const base = { points: 6, gd: 2, goalsFor: 5, awayGoalsFor: 2, won: 2, awayWins: 1, oppPoints: 10, oppGd: 4 };
  const rows = [row('A', { ...base, oppGoalsFor: 5 }), row('B', { ...base, oppGoalsFor: 15 })];
  assert.deepEqual(rankedIds(rows, { complete: true }), ['B', 'A']);
});

test('final fallback: teams level on everything are ordered alphabetically by name, then id', () => {
  assert.ok(byNameAlphabetical(row('X', { name: 'Alpha' }), row('Y', { name: 'Beta' })) < 0);
  // Same name -> id decides, deterministically.
  assert.ok(byNameAlphabetical(row('aaa', { name: 'Same' }), row('bbb', { name: 'Same' })) < 0);

  const rows = [row('z', { name: 'Same' }), row('a', { name: 'Same' })];
  assert.deepEqual(rankedIds(rows), ['a', 'z']);
});

test('rankTeams attaches a 1-indexed rank and does not mutate input order', () => {
  const rows = [row('A', { points: 3 }), row('B', { points: 6 }), row('C', { points: 1 })];
  const sorted = rankTeams(rows);
  assert.deepEqual(sorted.map(r => r.id), ['B', 'A', 'C']);
  assert.deepEqual(sorted.map(r => r.rank), [1, 2, 3]);
  assert.deepEqual(rows.map(r => r.id), ['A', 'B', 'C'], 'the original array order should be untouched');
});
