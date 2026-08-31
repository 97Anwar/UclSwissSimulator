// Covers CSV rows: T02, T03, T04, T05, T51
// Run with: node --test tests/unit
//
// Note on flakiness: during development, one run out of several dozen
// showed a transient failure that did not reproduce across 60+ subsequent
// direct stress-test trials plus 5 more full harness runs. The backtracking
// search is randomized, so a very rare (~1-2%, unconfirmed) edge case isn't
// ruled out. If a test in this file ever fails, re-run it a few times
// before assuming a regression — but please also report it, since a
// reproducing failure would be a real bug worth chasing down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS_DATA } from '../../js/data/teams.js';
import { generateSwissFixtures } from '../../js/engine/draw.js';

function validateDraw(fixtures) {
  const byId = Object.fromEntries(TEAMS_DATA.map(t => [t.id, t]));
  const check = {};
  TEAMS_DATA.forEach(t => {
    check[t.id] = { pot: { 1: 0, 2: 0, 3: 0, 4: 0 }, home: 0, away: 0, assoc: {}, opp: new Set(), md: new Set() };
  });

  fixtures.forEach(f => {
    const h = byId[f.homeId], a = byId[f.awayId];
    check[f.homeId].pot[a.pot]++;
    check[f.awayId].pot[h.pot]++;
    check[f.homeId].home++;
    check[f.awayId].away++;
    check[f.homeId].assoc[a.assoc] = (check[f.homeId].assoc[a.assoc] || 0) + 1;
    check[f.awayId].assoc[h.assoc] = (check[f.awayId].assoc[h.assoc] || 0) + 1;
    assert.ok(!check[f.homeId].opp.has(f.awayId), `Duplicate pairing: ${f.homeId} vs ${f.awayId}`);
    check[f.homeId].opp.add(f.awayId);
    assert.ok(!check[f.homeId].md.has(f.matchday), `${f.homeId} plays twice on matchday ${f.matchday}`);
    assert.ok(!check[f.awayId].md.has(f.matchday), `${f.awayId} plays twice on matchday ${f.matchday}`);
    check[f.homeId].md.add(f.matchday);
    check[f.awayId].md.add(f.matchday);
  });

  return check;
}

test('T01: generates exactly 144 fixtures', () => {
  const fixtures = generateSwissFixtures(TEAMS_DATA);
  assert.equal(fixtures.length, 144);
});

test('T02: every team plays exactly 2 opponents from each pot', () => {
  const fixtures = generateSwissFixtures(TEAMS_DATA);
  const check = validateDraw(fixtures);
  TEAMS_DATA.forEach(t => {
    [1, 2, 3, 4].forEach(pot => {
      assert.equal(check[t.id].pot[pot], 2, `${t.id} has ${check[t.id].pot[pot]} opponents from pot ${pot}, expected 2`);
    });
  });
});

test('T03: every team has exactly 4 home and 4 away matches', () => {
  const fixtures = generateSwissFixtures(TEAMS_DATA);
  const check = validateDraw(fixtures);
  TEAMS_DATA.forEach(t => {
    assert.equal(check[t.id].home, 4, `${t.id} has ${check[t.id].home} home matches, expected 4`);
    assert.equal(check[t.id].away, 4, `${t.id} has ${check[t.id].away} away matches, expected 4`);
  });
});

test('T04: no team faces more than 2 opponents from the same association', () => {
  const fixtures = generateSwissFixtures(TEAMS_DATA);
  const check = validateDraw(fixtures);
  TEAMS_DATA.forEach(t => {
    Object.entries(check[t.id].assoc).forEach(([assoc, count]) => {
      assert.ok(count <= 2, `${t.id} faces ${count} opponents from ${assoc}, expected <= 2`);
    });
  });
});

test('T05: no team plays twice on the same matchday, and each team has exactly 8 matchdays used', () => {
  const fixtures = generateSwissFixtures(TEAMS_DATA);
  const check = validateDraw(fixtures); // throws internally on any same-matchday clash
  TEAMS_DATA.forEach(t => {
    assert.equal(check[t.id].md.size, 8, `${t.id} used ${check[t.id].md.size} distinct matchdays, expected 8`);
  });
});

test('T51: draw generation is reliable across repeated runs (10x)', () => {
  for (let i = 0; i < 10; i++) {
    const fixtures = generateSwissFixtures(TEAMS_DATA);
    assert.equal(fixtures.length, 144, `attempt ${i + 1} did not produce 144 fixtures`);
    validateDraw(fixtures); // throws on any constraint violation
  }
});

test('T52: an infeasible dataset throws a clear, catchable error within a bounded time (not a long hang)', () => {
  // Construction verified empirically to be infeasible: overloading one
  // association across two pots so the max-2-same-association constraint
  // can't be satisfied for every required pairing.
  const brokenTeams = TEAMS_DATA.map(t => ({ ...t }));
  brokenTeams.filter(t => t.pot === 1).forEach(t => { t.assoc = 'FAKE_OVERLOADED'; });
  brokenTeams.filter(t => t.pot === 2).slice(0, 3).forEach(t => { t.assoc = 'FAKE_OVERLOADED'; });

  const t0 = Date.now();
  assert.throws(() => generateSwissFixtures(brokenTeams), /Draw generation failed/);
  const elapsedMs = Date.now() - t0;
  // Must fail within a few seconds, not hang the page — this specific
  // bound (well under 10s) caught a real bug during development where a
  // deadline check existed but didn't actually abort the search early,
  // letting an infeasible case run for 15+ seconds before this fix.
  assert.ok(elapsedMs < 8000, `took ${elapsedMs}ms to fail, expected well under 8000ms`);
});
