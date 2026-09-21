#!/usr/bin/env node
// ============================================================================
// scripts/update-match-schedule.mjs
//
// Analyzes the UEFA Champions League fixture list, extracts all unique match
// dates and kickoff windows, and automatically generates/updates the cron
// schedule in .github/workflows/update-scores.yml so CI only runs on matchdays.
//
// Usage:
//   node scripts/update-match-schedule.mjs             # Dry run (prints schedule & crons)
//   node scripts/update-match-schedule.mjs --write     # Updates .github/workflows/update-scores.yml
//   node scripts/update-match-schedule.mjs --fetch     # Fetches latest fixtures from API first
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REAL_RESULTS_PATH = join(ROOT, 'data/real-results.json');
const WORKFLOW_PATH = join(ROOT, '.github/workflows/update-scores.yml');

/**
 * Extracts distinct match dates and matchday mappings from fixtures.
 *
 * @param {Array<{ matchday?: number, utcDate?: string }>} fixtures
 * @returns {{
 *   uniqueDates: string[],
 *   datesByMatchday: Record<number, string[]>,
 *   datesByMonth: Record<string, number[]>
 * }}
 */
export function extractMatchSchedule(fixtures = []) {
  const uniqueDatesSet = new Set();
  const datesByMatchday = {};
  const monthDayMap = {}; // 'YYYY-MM' -> Set of day numbers

  for (const f of fixtures) {
    if (!f.utcDate) continue;
    const dateStr = f.utcDate.slice(0, 10); // 'YYYY-MM-DD'
    uniqueDatesSet.add(dateStr);

    const md = f.matchday || 0;
    if (!datesByMatchday[md]) datesByMatchday[md] = new Set();
    datesByMatchday[md].add(dateStr);

    const yearMonth = dateStr.slice(0, 7); // 'YYYY-MM'
    const day = parseInt(dateStr.slice(8, 10), 10);
    if (!monthDayMap[yearMonth]) monthDayMap[yearMonth] = new Set();
    monthDayMap[yearMonth].add(day);
  }

  const uniqueDates = Array.from(uniqueDatesSet).sort();

  // Convert Sets to sorted Arrays
  const formattedDatesByMatchday = {};
  for (const md of Object.keys(datesByMatchday).sort((a, b) => Number(a) - Number(b))) {
    formattedDatesByMatchday[md] = Array.from(datesByMatchday[md]).sort();
  }

  const datesByMonth = {};
  for (const ym of Object.keys(monthDayMap).sort()) {
    datesByMonth[ym] = Array.from(monthDayMap[ym]).sort((a, b) => a - b);
  }

  return {
    uniqueDates,
    datesByMatchday: formattedDatesByMatchday,
    datesByMonth,
  };
}

/**
 * Returns morning-after dates for each matchday (e.g. for post-match final syncs).
 *
 * @param {string[]} matchDates Array of 'YYYY-MM-DD' strings
 * @returns {string[]}
 */
export function getMorningAfterDates(matchDates = []) {
  const morningAfterSet = new Set();

  for (const dateStr of matchDates) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    morningAfterSet.add(d.toISOString().slice(0, 10));
  }

  return Array.from(morningAfterSet).sort();
}

/**
 * Checks whether a given timestamp falls within an active matchday window:
 * - The date is a scheduled matchday
 * - The date is the morning immediately following a matchday
 * - Any match is currently IN_PLAY or PAUSED
 *
 * @param {Array} fixtures
 * @param {Date|string} [checkTime=new Date()]
 * @returns {{ isWindow: boolean, reason: string }}
 */
export function isMatchdayWindow(fixtures = [], checkTime = new Date()) {
  const dateObj = typeof checkTime === 'string' ? new Date(checkTime) : checkTime;
  const todayUtc = dateObj.toISOString().slice(0, 10);

  // 1. Check if any match is currently in play
  const liveMatch = fixtures.find(f => f.status === 'IN_PLAY' || f.status === 'PAUSED');
  if (liveMatch) {
    return {
      isWindow: true,
      reason: `Match in progress: ${liveMatch.homeId} vs ${liveMatch.awayId} (${liveMatch.status})`,
    };
  }

  // 2. Check if today is a scheduled matchday
  const schedule = extractMatchSchedule(fixtures);
  if (schedule.uniqueDates.includes(todayUtc)) {
    return {
      isWindow: true,
      reason: `Today (${todayUtc}) is an active UCL matchday`,
    };
  }

  // 3. Check if today is a morning-after confirmation window
  const morningAfterDates = getMorningAfterDates(schedule.uniqueDates);
  if (morningAfterDates.includes(todayUtc)) {
    return {
      isWindow: true,
      reason: `Today (${todayUtc}) is a post-matchday morning confirmation window`,
    };
  }

  // 4. Check if any match in the past has not finished (catch-up / missed sync)
  const pastUnfinished = fixtures.find(f => f.utcDate && new Date(f.utcDate) < dateObj && f.status !== 'FINISHED');
  if (pastUnfinished) {
    return {
      isWindow: true,
      reason: `Past match requires score sync: ${pastUnfinished.homeId} vs ${pastUnfinished.awayId} (scheduled ${pastUnfinished.utcDate}, status ${pastUnfinished.status})`,
    };
  }

  return {
    isWindow: false,
    reason: `Date ${todayUtc} is not a scheduled UCL matchday or morning-after window`,
  };
}

/**
 * Generates the GitHub Actions cron schedule block.
 *
 * @param {Array} fixtures
 * @param {object} [options]
 * @returns {string} YAML snippet of cron schedule entries
 */
export function generateCronScheduleYaml(fixtures = [], options = {}) {
  const {
    eveningMinute = 15,
    eveningHours = '19,21,22,23',
    morningHour = 6,
    morningMinute = 0,
    includeWeekly = true,
  } = options;

  const schedule = extractMatchSchedule(fixtures);
  const morningAfterDates = getMorningAfterDates(schedule.uniqueDates);

  // Group morning-after dates by YYYY-MM
  const morningDatesByMonth = {};
  for (const dateStr of morningAfterDates) {
    const yearMonth = dateStr.slice(0, 7);
    const day = parseInt(dateStr.slice(8, 10), 10);
    if (!morningDatesByMonth[yearMonth]) morningDatesByMonth[yearMonth] = new Set();
    morningDatesByMonth[yearMonth].add(day);
  }

  const lines = [];
  lines.push('    # --- BEGIN MATCHDAY SCHEDULE ---');
  lines.push('    # Automatically generated by scripts/update-match-schedule.mjs');
  lines.push(`    # Covers ${schedule.uniqueDates.length} matchdays across ${Object.keys(schedule.datesByMonth).length} months`);
  lines.push('');
  lines.push(`    # 1) Matchday evening windows (${eveningHours.split(',').map(h => `${h}:${String(eveningMinute).padStart(2, '0')}`).join(', ')} UTC)`);

  const monthNames = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
  };

  for (const [ym, days] of Object.entries(schedule.datesByMonth)) {
    const [year, month] = ym.split('-');
    const mNum = parseInt(month, 10);
    const mName = monthNames[month] || month;
    const daysStr = days.join(',');
    lines.push(`    - cron: '${eveningMinute} ${eveningHours} ${daysStr} ${mNum} *' # ${mName} ${days.join(', ')} (${year})`);
  }

  lines.push('');
  lines.push(`    # 2) Morning-after confirmation runs (${String(morningHour).padStart(2, '0')}:${String(morningMinute).padStart(2, '0')} UTC)`);

  for (const [ym, daySet] of Object.entries(morningDatesByMonth)) {
    const [year, month] = ym.split('-');
    const mNum = parseInt(month, 10);
    const mName = monthNames[month] || month;
    const days = Array.from(daySet).sort((a, b) => a - b);
    const daysStr = days.join(',');
    lines.push(`    - cron: '${morningMinute} ${morningHour} ${daysStr} ${mNum} *' # ${mName} ${days.join(', ')} (${year})`);
  }

  if (includeWeekly) {
    lines.push('');
    lines.push('    # 3) Weekly safety check & GitHub Actions inactivity heartbeat (every Monday at 06:00 UTC)');
    lines.push("    - cron: '0 6 * * 1'");
  }

  lines.push('    # --- END MATCHDAY SCHEDULE ---');
  return lines.join('\n');
}

/**
 * Updates the schedule in .github/workflows/update-scores.yml.
 *
 * @param {string} workflowFilePath
 * @param {string} newScheduleYaml
 * @returns {{ changed: boolean, content: string }}
 */
export function updateWorkflowFile(workflowFilePath, newScheduleYaml) {
  const content = readFileSync(workflowFilePath, 'utf8');

  let updatedContent;
  const beginMarker = '# --- BEGIN MATCHDAY SCHEDULE ---';
  const endMarker = '# --- END MATCHDAY SCHEDULE ---';

  if (content.includes(beginMarker) && content.includes(endMarker)) {
    const regex = new RegExp(`[ \\t]*${beginMarker}[\\s\\S]*?${endMarker}`, 'm');
    updatedContent = content.replace(regex, newScheduleYaml.trimEnd());
  } else {
    // Match schedule: and any indented lines (comments or - cron:) underneath it
    const scheduleRegex = /(^[ \t]*schedule:\s*\n)(?:[ \t]+(?:#[^\n]*|-[^\n]*)\n*)+/m;
    if (scheduleRegex.test(content)) {
      updatedContent = content.replace(scheduleRegex, `$1${newScheduleYaml}\n`);
    } else {
      throw new Error(`Could not find a schedule block to replace in ${workflowFilePath}`);
    }
  }

  const changed = updatedContent !== content;
  if (changed) {
    writeFileSync(workflowFilePath, updatedContent);
  }
  return { changed, content: updatedContent };
}

// ----------------------------------------------------------------------------
// CLI Execution
// ----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes('--write');
  const shouldFetch = args.includes('--fetch');

  let fixtures = [];

  if (shouldFetch && process.env.FOOTBALL_DATA_TOKEN) {
    console.log('Fetching fresh fixtures from football-data.org API...');
    const res = await fetch('https://api.football-data.org/v4/competitions/CL/matches', {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN },
    });
    if (!res.ok) {
      throw new Error(`API fetch failed with status ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    fixtures = (data.matches || []).filter(m => m.stage === 'LEAGUE_STAGE' || m.stage === 'GROUP_STAGE');
    console.log(`Fetched ${fixtures.length} fixtures from API.`);
  } else if (existsSync(REAL_RESULTS_PATH)) {
    const raw = readFileSync(REAL_RESULTS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    fixtures = parsed.fixtures || [];
    console.log(`Loaded ${fixtures.length} fixtures from data/real-results.json.`);
  } else {
    console.error('No fixture data found at data/real-results.json and no API token provided.');
    process.exit(1);
  }

  const schedule = extractMatchSchedule(fixtures);
  console.log(`\nFound ${schedule.uniqueDates.length} match dates across ${Object.keys(schedule.datesByMatchday).length} matchdays:`);
  for (const [md, dates] of Object.entries(schedule.datesByMatchday)) {
    console.log(`  Matchday ${md}: ${dates.join(', ')}`);
  }

  const yaml = generateCronScheduleYaml(fixtures);

  if (shouldWrite) {
    console.log(`\nWriting updated schedule to ${WORKFLOW_PATH}...`);
    const { changed } = updateWorkflowFile(WORKFLOW_PATH, yaml);
    if (changed) {
      console.log('Successfully updated .github/workflows/update-scores.yml with matchday schedule.');
    } else {
      console.log('.github/workflows/update-scores.yml is already up to date.');
    }
  } else {
    console.log('\nGenerated Cron Schedule (use --write to apply to workflow):\n');
    console.log(yaml);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
