// Unit tests for the league-phase qualification engine.
// Run with: node --test tests/unit
//
// The engine's core promise is that it never lies: a "clinched" or
// "eliminated" verdict must hold in every remaining scenario. These tests
// pin down the points-bound maths (rank interval, clinch/eliminate status,
// and the fewest points that guarantee a zone) on small, hand-checkable
// tables, plus the fixture-parsing wrapper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTeams, analyzeQualification } from '../../js/engine/qualification.js';

function team(id, points, remaining, played = 8 - remaining) {
  return { id, name: id, points, remaining, played };
}

test('a team mathematically clinched inside the top 8 is reported as clinched', () => {
  // T has 20 pts, done. Eight rivals can never reach 20, one is above.
  const teams = [
    team('T', 20, 0),
    team('R1', 22, 0),
    ...Array.from({ length: 8 }, (_, i) => team(`L${i}`, 10, 0)),
  ];
  const a = analyzeTeams(teams, 10);
  assert.equal(a.T.top8, 'clinched');
  assert.equal(a.T.bestRank, 2);
  assert.equal(a.T.worstRank, 2, 'exactly one team certainly above, eight certainly below');
  assert.equal(a.T.pointsToClinchTop8, 0, 'already guaranteed -> needs 0 more');
});

test('a team that can no longer reach the top 8 is reported as eliminated', () => {
  // T is done on 3; eight rivals are already on 6 and done -> all certainly above.
  const teams = [
    team('T', 3, 0),
    ...Array.from({ length: 8 }, (_, i) => team(`H${i}`, 6, 0)),
    team('X', 1, 0),
  ];
  const a = analyzeTeams(teams, 10);
  assert.equal(a.T.top8, 'eliminated');
  assert.equal(a.T.bestRank, 9, 'eight teams certainly above -> best possible is 9th');
  assert.equal(a.T.pointsToClinchTop8, null, 'no points total can guarantee an unreachable zone');
});

test('a team still in contention reports the fewest points that would guarantee top 8', () => {
  // T on 9 with 3 to play (max 18). Seven rivals max 15, two rivals max 12.
  const teams = [
    team('T', 9, 3),
    ...Array.from({ length: 7 }, (_, i) => team(`A${i}`, 6, 3)),
    ...Array.from({ length: 2 }, (_, i) => team(`B${i}`, 3, 3)),
  ];
  const a = analyzeTeams(teams, 10);
  assert.equal(a.T.top8, 'contention');
  assert.equal(a.T.bestRank, 1);
  assert.equal(a.T.worstRank, 10);
  // Reaching 13 leaves only the seven max-15 rivals able to catch T (<= 7 above
  // -> rank <= 8); 12 still leaves nine possible threats. 13 - 9 = 4 points.
  assert.equal(a.T.pointsToClinchTop8, 4);
});

test('the rank interval brackets every possible finish, including points ties', () => {
  // A & B tied on 9 (done), C & D tied on 3 (done), 4-team table.
  const teams = [team('A', 9, 0), team('B', 9, 0), team('C', 3, 0), team('D', 3, 0)];
  const a = analyzeTeams(teams, 4);
  assert.deepEqual([a.A.bestRank, a.A.worstRank], [1, 2], 'A can be 1st or 2nd on tiebreakers with B');
  assert.deepEqual([a.C.bestRank, a.C.worstRank], [3, 4]);
  // Top 24 in a 4-team table is unreachable-to-lose: everyone is "clinched".
  assert.equal(a.A.top24, 'clinched');
  assert.equal(a.D.top24, 'clinched');
});

test('clinched/eliminated verdicts use strict inequalities so a points tie is never over-claimed', () => {
  // T could tie R on points (both can reach 12). That tie must NOT be counted
  // as T certainly finishing above R, nor R above T.
  const teams = [team('T', 6, 2), team('R', 6, 2), team('Z', 0, 2)];
  const a = analyzeTeams(teams, 3);
  // Neither T nor R is certainly above the other -> both can be 1st.
  assert.equal(a.T.bestRank, 1);
  assert.equal(a.R.bestRank, 1);
});

test('analyzeQualification derives remaining-match counts from unplayed fixtures', () => {
  const standings = [
    { id: 'A', name: 'A', points: 3, played: 1 },
    { id: 'B', name: 'B', points: 0, played: 1 },
    { id: 'C', name: 'C', points: 0, played: 0 },
  ];
  const fixtures = [
    { id: 'f1', matchday: 1, homeId: 'A', awayId: 'B', homeScore: null, awayScore: null, realHomeScore: 1, realAwayScore: 0 }, // played
    { id: 'f2', matchday: 2, homeId: 'A', awayId: 'C', homeScore: null, awayScore: null, realHomeScore: null, realAwayScore: null }, // unplayed
    { id: 'f3', matchday: 3, homeId: 'B', awayId: 'C', homeScore: null, awayScore: null, realHomeScore: null, realAwayScore: null }, // unplayed
  ];
  const a = analyzeQualification(standings, fixtures);
  assert.equal(a.A.remaining, 1, 'A has one unplayed fixture (vs C)');
  assert.equal(a.B.remaining, 1, 'B has one unplayed fixture (vs C)');
  assert.equal(a.C.remaining, 2, 'C has two unplayed fixtures');
  assert.equal(a.A.maxPoints, 3 + 3 * 1, 'max points = current + 3 per remaining match');
});

test('a predicted score counts a fixture as no longer remaining', () => {
  const standings = [
    { id: 'A', name: 'A', points: 0, played: 0 },
    { id: 'B', name: 'B', points: 0, played: 0 },
  ];
  const fixtures = [
    { id: 'f1', matchday: 1, homeId: 'A', awayId: 'B', homeScore: 2, awayScore: 1, realHomeScore: null, realAwayScore: null }, // predicted
  ];
  const a = analyzeQualification(standings, fixtures);
  assert.equal(a.A.remaining, 0, 'a user prediction fills the fixture, so it is not counted as remaining');
  assert.equal(a.B.remaining, 0);
});
