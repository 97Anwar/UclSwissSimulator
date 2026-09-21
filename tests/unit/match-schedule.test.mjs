import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMatchSchedule,
  getMorningAfterDates,
  isMatchdayWindow,
  generateCronScheduleYaml,
  updateWorkflowFile,
} from '../../scripts/update-match-schedule.mjs';
import { areFixturesEqual } from '../../scripts/fetch-results.mjs';

const SAMPLE_FIXTURES = [
  {
    externalId: 101,
    matchday: 1,
    homeId: 'RMA',
    awayId: 'INT',
    homeScore: null,
    awayScore: null,
    status: 'TIMED',
    utcDate: '2026-09-08T19:00:00Z',
  },
  {
    externalId: 102,
    matchday: 1,
    homeId: 'BAR',
    awayId: 'BAY',
    homeScore: null,
    awayScore: null,
    status: 'TIMED',
    utcDate: '2026-09-09T19:00:00Z',
  },
  {
    externalId: 103,
    matchday: 2,
    homeId: 'MCI',
    awayId: 'DOR',
    homeScore: 2,
    awayScore: 1,
    status: 'FINISHED',
    utcDate: '2026-10-13T19:00:00Z',
  },
  {
    externalId: 104,
    matchday: 2,
    homeId: 'PSG',
    awayId: 'LIV',
    homeScore: 0,
    awayScore: 0,
    status: 'FINISHED',
    utcDate: '2026-10-14T19:00:00Z',
  },
];

test('extractMatchSchedule extracts unique dates, matchdays, and months', () => {
  const schedule = extractMatchSchedule(SAMPLE_FIXTURES);

  assert.deepEqual(schedule.uniqueDates, [
    '2026-09-08',
    '2026-09-09',
    '2026-10-13',
    '2026-10-14',
  ]);

  assert.deepEqual(schedule.datesByMatchday[1], ['2026-09-08', '2026-09-09']);
  assert.deepEqual(schedule.datesByMatchday[2], ['2026-10-13', '2026-10-14']);

  assert.deepEqual(schedule.datesByMonth['2026-09'], [8, 9]);
  assert.deepEqual(schedule.datesByMonth['2026-10'], [13, 14]);
});

test('getMorningAfterDates calculates next calendar days in UTC', () => {
  const dates = ['2026-09-30', '2026-12-31'];
  const nextDays = getMorningAfterDates(dates);

  assert.deepEqual(nextDays, ['2026-10-01', '2027-01-01']);
});

test('isMatchdayWindow identifies matchdays, post-match mornings, and live matches', () => {
  // Direct matchday
  const matchdayCheck = isMatchdayWindow(SAMPLE_FIXTURES, '2026-09-08T12:00:00Z');
  assert.equal(matchdayCheck.isWindow, true);
  assert.match(matchdayCheck.reason, /active UCL matchday/);

  // Morning after matchday
  const morningCheck = isMatchdayWindow(SAMPLE_FIXTURES, '2026-09-10T06:00:00Z');
  assert.equal(morningCheck.isWindow, true);
  assert.match(morningCheck.reason, /post-matchday morning/);

  // Non-matchday when all past matches are FINISHED
  const allPastFinished = SAMPLE_FIXTURES.map(f => ({ ...f, status: 'FINISHED' }));
  const nonMatchdayCheck = isMatchdayWindow(allPastFinished, '2026-09-15T12:00:00Z');
  assert.equal(nonMatchdayCheck.isWindow, false);

  // Past match still TIMED triggers catch-up window
  const catchUpCheck = isMatchdayWindow(SAMPLE_FIXTURES, '2026-09-15T12:00:00Z');
  assert.equal(catchUpCheck.isWindow, true);
  assert.match(catchUpCheck.reason, /Past match requires score sync/);

  // Live match overrides date check
  const fixturesWithLive = [
    ...allPastFinished,
    {
      externalId: 999,
      matchday: 1,
      homeId: 'ARS',
      awayId: 'MIL',
      homeScore: 1,
      awayScore: 0,
      status: 'IN_PLAY',
      utcDate: '2026-09-15T19:00:00Z',
    },
  ];
  const liveCheck = isMatchdayWindow(fixturesWithLive, '2026-09-15T19:30:00Z');
  assert.equal(liveCheck.isWindow, true);
  assert.match(liveCheck.reason, /Match in progress/);
});

test('generateCronScheduleYaml generates valid cron expressions', () => {
  const yaml = generateCronScheduleYaml(SAMPLE_FIXTURES);

  assert.match(yaml, /BEGIN MATCHDAY SCHEDULE/);
  assert.match(yaml, /END MATCHDAY SCHEDULE/);

  // Extract all cron strings: cron: '...'
  const cronMatches = [...yaml.matchAll(/cron:\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(cronMatches.length >= 3);

  // Verify each cron expression has standard 5 fields
  for (const cron of cronMatches) {
    const fields = cron.trim().split(/\s+/);
    assert.equal(
      fields.length,
      5,
      `Cron expression "${cron}" should have exactly 5 fields, got ${fields.length}`
    );
  }
});

test('areFixturesEqual accurately detects fixture changes', () => {
  const base = [
    {
      externalId: 1,
      matchday: 1,
      homeId: 'RMA',
      awayId: 'INT',
      homeScore: null,
      awayScore: null,
      status: 'TIMED',
      utcDate: '2026-09-08T19:00:00Z',
    },
  ];

  // Exactly equal
  const clone = JSON.parse(JSON.stringify(base));
  assert.equal(areFixturesEqual(base, clone), true);

  // Score change
  const scoreChanged = [{ ...base[0], homeScore: 1 }];
  assert.equal(areFixturesEqual(base, scoreChanged), false);

  // Status change (e.g. TIMED -> IN_PLAY)
  const statusChanged = [{ ...base[0], status: 'IN_PLAY' }];
  assert.equal(areFixturesEqual(base, statusChanged), false);

  // Date change (e.g. postponed)
  const dateChanged = [{ ...base[0], utcDate: '2026-09-09T19:00:00Z' }];
  assert.equal(areFixturesEqual(base, dateChanged), false);
});

