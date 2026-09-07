// Unit tests for the shareable-prediction codec.
// Run with: node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePredictions, decodePredictions } from '../../js/engine/prediction-codec.js';

function fx(id, matchday, homeId, awayId, homeScore = null, awayScore = null) {
  return { id, matchday, homeId, awayId, homeScore, awayScore };
}

// A small fixed fixture set (identity = matchday/home/away).
function sampleFixtures() {
  return [
    fx('a', 1, 'PSG', 'BAY'),
    fx('b', 1, 'RMA', 'INT'),
    fx('c', 2, 'BAR', 'ARS'),
    fx('d', 3, 'LIV', 'MCI'),
  ];
}

test('round-trips predicted scores exactly', () => {
  const fixtures = sampleFixtures();
  fixtures[0].homeScore = 3; fixtures[0].awayScore = 1;
  fixtures[2].homeScore = 0; fixtures[2].awayScore = 0;

  const code = encodePredictions(fixtures);
  assert.ok(code.length > 0, 'a non-empty code should be produced');

  // Decode against a fresh copy that has NO scores yet (like a recipient).
  const recipient = sampleFixtures();
  const applied = decodePredictions(code, recipient);
  const byId = Object.fromEntries(applied.map(a => [a.id, a]));
  assert.deepEqual(byId['a'], { id: 'a', homeScore: 3, awayScore: 1 });
  assert.deepEqual(byId['c'], { id: 'c', homeScore: 0, awayScore: 0 });
  assert.equal(applied.length, 2, 'only the two predicted matches are encoded');
});

test('is portable across differing runtime fixture ids (identity is matchday/home/away)', () => {
  const sender = sampleFixtures();
  sender[3].homeScore = 2; sender[3].awayScore = 2; // LIV v MCI on MD3

  const code = encodePredictions(sender);

  // Recipient has the SAME draw but different runtime ids (e.g. REAL_* vs M*).
  const recipient = [
    fx('REAL_99', 1, 'PSG', 'BAY'),
    fx('REAL_98', 1, 'RMA', 'INT'),
    fx('REAL_97', 2, 'BAR', 'ARS'),
    fx('REAL_96', 3, 'LIV', 'MCI'),
  ];
  const applied = decodePredictions(code, recipient);
  assert.deepEqual(applied, [{ id: 'REAL_96', homeScore: 2, awayScore: 2 }],
    'the LIV v MCI prediction maps to the recipient fixture with the same draw identity, not the same id');
});

test('a fixture is only encoded when BOTH scores are set', () => {
  const fixtures = sampleFixtures();
  fixtures[0].homeScore = 2; fixtures[0].awayScore = null; // half-filled -> ignored
  assert.equal(encodePredictions(fixtures), '', 'a half-entered score is not a prediction');
});

test('no predictions yields an empty code', () => {
  assert.equal(encodePredictions(sampleFixtures()), '');
});

test('scores are clamped to the 0-15 range each nibble can hold', () => {
  const fixtures = sampleFixtures();
  fixtures[0].homeScore = 99; fixtures[0].awayScore = 4;
  const applied = decodePredictions(encodePredictions(fixtures), sampleFixtures());
  assert.deepEqual(applied[0], { id: 'a', homeScore: 15, awayScore: 4 });
});

test('corrupt or unknown input decodes to nothing rather than throwing', () => {
  const fixtures = sampleFixtures();
  assert.deepEqual(decodePredictions('', fixtures), []);
  assert.deepEqual(decodePredictions('!!!not-base64!!!', fixtures), []);
  assert.deepEqual(decodePredictions('AAAA', fixtures), [], 'wrong version byte -> ignored');
});

test('out-of-range fixture indices in a code are skipped safely', () => {
  // Hand-craft a code: version 1, index 200 (no such fixture), score packed.
  const bytes = Uint8Array.from([1, 200, (2 << 4) | 1]);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const code = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(decodePredictions(code, sampleFixtures()), [], 'an index past the fixture list is ignored');
});
