import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TEAMS_DATA } from '../../js/data/teams.js';
import {
  loadSquadsData,
  playerAvatar,
  renderSquadSection,
} from '../../scripts/generate-static-pages.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

test('squads: data/squads.json exists and contains valid JSON', () => {
  const filePath = join(ROOT, 'data/squads.json');
  assert.ok(existsSync(filePath), 'data/squads.json must exist');
  const squads = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(typeof squads, 'object');
  assert.notEqual(squads, null);
});

test('squads: covers all 36 clubs in TEAMS_DATA', () => {
  const squads = loadSquadsData();
  const squadTeamIds = Object.keys(squads);

  for (const team of TEAMS_DATA) {
    assert.ok(
      squads[team.id],
      `Squad for team ${team.id} (${team.name}) must be present in data/squads.json`
    );
    assert.ok(
      Array.isArray(squads[team.id]),
      `Squad for team ${team.id} must be an array`
    );
    assert.ok(
      squads[team.id].length >= 11,
      `Squad for team ${team.id} must contain at least 11 players (found ${squads[team.id].length})`
    );
  }

  assert.equal(squadTeamIds.length, 36, 'Must contain exactly 36 squads');
});

test('squads: every team has Goalkeepers, Defenders, Midfielders, and Forwards', () => {
  const squads = loadSquadsData();
  const validPositions = new Set(['Goalkeeper', 'Defender', 'Midfielder', 'Forward']);

  for (const team of TEAMS_DATA) {
    const squad = squads[team.id];
    const positions = new Set(squad.map(p => p.position));

    for (const requiredPos of validPositions) {
      assert.ok(
        positions.has(requiredPos),
        `Team ${team.id} (${team.name}) must have at least one ${requiredPos}`
      );
    }
  }
});

test('squads: all players have valid schema attributes', () => {
  const squads = loadSquadsData();
  const allowedPositions = new Set(['Goalkeeper', 'Defender', 'Midfielder', 'Forward']);

  let totalPlayers = 0;
  for (const [teamId, squad] of Object.entries(squads)) {
    for (const player of squad) {
      totalPlayers++;
      assert.ok(
        typeof player.name === 'string' && player.name.trim().length > 0,
        `Player in ${teamId} must have a non-empty name`
      );
      assert.ok(
        allowedPositions.has(player.position),
        `Player ${player.name} in ${teamId} has invalid position "${player.position}"`
      );
      if (player.number !== undefined) {
        assert.ok(
          Number.isInteger(player.number) && player.number > 0,
          `Player ${player.name} in ${teamId} must have a positive integer number`
        );
      }
      if (player.country !== undefined) {
        assert.ok(
          typeof player.country === 'string' && player.country.length > 0,
          `Player ${player.name} in ${teamId} must have a string country flag`
        );
      }
      if (player.photo !== undefined) {
        assert.ok(
          typeof player.photo === 'string' &&
            (player.photo.startsWith('/assets/players/') || player.photo.startsWith('http')),
          `Player ${player.name} in ${teamId} photo must be a local asset or HTTP(S) URL`
        );
        if (player.photo.startsWith('/assets/players/')) {
          const fullPath = join(ROOT, player.photo.slice(1));
          assert.ok(
            existsSync(fullPath),
            `Local photo file ${player.photo} for ${player.name} in ${teamId} must exist on disk`
          );
        }
      }
    }
  }

  assert.ok(totalPlayers >= 36 * 11, `Expected at least 396 total players across clubs, got ${totalPlayers}`);
});

test('squads: playerAvatar renders monogram fallback, alt text, and resilient img tag', () => {
  const playerWithPhoto = {
    name: 'Kylian Mbappé',
    position: 'Forward',
    number: 9,
    country: '🇫🇷',
    photo: '/assets/players/rma_kylian_mbappe.jpg',
  };
  const htmlWithPhoto = playerAvatar(playerWithPhoto, 'RMA', 36, 'Real Madrid');
  assert.ok(htmlWithPhoto.includes('KM'), 'Initials KM must be present in fallback');
  assert.ok(htmlWithPhoto.includes('onerror="this.remove()"'), 'Resilient onerror fallback must be present');
  assert.ok(htmlWithPhoto.includes(playerWithPhoto.photo), 'Photo URL must be in img src');
  assert.ok(htmlWithPhoto.includes('alt="Kylian Mbappé - Real Madrid Forward"'), 'Descriptive alt text must be present');
  assert.ok(htmlWithPhoto.includes('<span aria-hidden="true"'), 'Fallback initials must have aria-hidden');

  const playerWithoutPhoto = {
    name: 'Yusif Imanov',
    position: 'Goalkeeper',
    number: 1,
    country: '🇦🇿',
  };
  const htmlNoPhoto = playerAvatar(playerWithoutPhoto, 'SAB', 36, 'Sabah FK');
  assert.ok(htmlNoPhoto.includes('YI'), 'Initials YI must be present in fallback');
  assert.ok(!htmlNoPhoto.includes('<img'), 'Should not render img tag when photo is absent');
});

test('squads: renderSquadSection generates semantic lists, rich summary prose, and grouped role cards', () => {
  const rma = TEAMS_DATA.find(t => t.id === 'RMA');
  const squadHtml = renderSquadSection(rma);

  assert.ok(squadHtml.includes('id="squad"'), 'Must contain section id="squad"');
  assert.ok(squadHtml.includes('Real Madrid playing squad'), 'Must have heading');
  assert.ok(squadHtml.includes('captained by Dani Carvajal'), 'Must mention captain in summary prose');
  assert.ok(squadHtml.includes('Goalkeepers'), 'Must have Goalkeepers group');
  assert.ok(squadHtml.includes('Defenders'), 'Must have Defenders group');
  assert.ok(squadHtml.includes('Midfielders'), 'Must have Midfielders group');
  assert.ok(squadHtml.includes('Forwards'), 'Must have Forwards group');
  assert.ok(squadHtml.includes('<ul class="grid'), 'Must use semantic ul list');
  assert.ok(squadHtml.includes('<li class="flex'), 'Must use semantic li elements');
  assert.ok(squadHtml.includes('Thibaut Courtois'), 'Courtois must be listed');
  assert.ok(squadHtml.includes('Dani Carvajal'), 'Carvajal must be listed');
  assert.ok(squadHtml.includes('Kylian Mbappé'), 'Mbappé must be listed');
  assert.ok(squadHtml.includes('>C<'), 'Captain badge must be rendered for captain');
});

test('squads: generated static team pages include on-page SEO, anchor nav, and enriched JSON-LD', () => {
  const rmaHtmlPath = join(ROOT, 'teams/rma.html');
  assert.ok(existsSync(rmaHtmlPath), 'teams/rma.html must exist');
  const rmaContent = readFileSync(rmaHtmlPath, 'utf8');

  // Title & description SEO
  assert.ok(rmaContent.includes('Real Madrid Champions League 2026/27 — Squad, Fixtures &amp; Table'), 'Title must include Squad, Fixtures & Table');
  assert.ok(rmaContent.includes('squad, fixtures, results, table standing'), 'Meta description must include squad');

  // Deep-link anchors & navigation
  assert.ok(rmaContent.includes('href="#squad"'), 'Must include quick jump anchor to #squad');
  assert.ok(rmaContent.includes('href="#fixtures"'), 'Must include quick jump anchor to #fixtures');
  assert.ok(rmaContent.includes('id="standing"'), 'Must include id="standing"');
  assert.ok(rmaContent.includes('id="qualification"'), 'Must include id="qualification"');
  assert.ok(rmaContent.includes('id="opponents"'), 'Must include id="opponents"');
  assert.ok(rmaContent.includes('id="journey"'), 'Must include id="journey"');
  assert.ok(rmaContent.includes('id="fixtures"'), 'Must include id="fixtures"');

  // Image SEO & semantic squad
  assert.ok(rmaContent.includes('alt="Thibaut Courtois - Real Madrid Goalkeeper"'), 'Must include descriptive player image alt text');

  // JSON-LD Schema
  assert.ok(rmaContent.includes('"logo":"https://swissformatsim.com/assets/logos/rma.png"'), 'JSON-LD must include club logo');
  assert.ok(rmaContent.includes('"image":"https://swissformatsim.com/assets/logos/rma.png"'), 'JSON-LD must include club image');
  assert.ok(rmaContent.includes('"name":"Thibaut Courtois"'), 'JSON-LD schema must include athlete');
  assert.ok(rmaContent.includes('"image":"https://swissformatsim.com/assets/players/rma_thibaut_courtois.jpg"'), 'JSON-LD schema must include athlete absolute image URL');
  assert.ok(rmaContent.includes('"jobTitle":"Defender (Captain)"'), 'JSON-LD schema must distinguish captain');

  const barHtmlPath = join(ROOT, 'teams/bar.html');
  assert.ok(existsSync(barHtmlPath), 'teams/bar.html must exist');
  const barContent = readFileSync(barHtmlPath, 'utf8');
  assert.ok(barContent.includes('Barcelona Champions League 2026/27 — Squad, Fixtures &amp; Table'), 'Barcelona title must include Squad');
  assert.ok(barContent.includes('Robert Lewandowski'), 'Static page must list Lewandowski');
});

test('standings: static snapshot and team page display matches won', () => {
  const md1Path = join(ROOT, 'matchday-1.html');
  assert.ok(existsSync(md1Path), 'matchday-1.html must exist');
  const md1Content = readFileSync(md1Path, 'utf8');
  assert.ok(md1Content.includes('>W</div>'), 'Matchday standings table must have W column header');
  assert.ok(md1Content.includes('>Pld</div>'), 'Matchday standings table must have Pld column header');

  const rmaPath = join(ROOT, 'teams/rma.html');
  const rmaContent = readFileSync(rmaPath, 'utf8');
  assert.ok(rmaContent.includes('>Won</div>'), 'Team page #standing box must include Won label');
  assert.ok(rmaContent.includes('grid grid-cols-5'), 'Team page #standing box must use 5-column grid');
});

