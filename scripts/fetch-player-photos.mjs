#!/usr/bin/env node
// ============================================================================
// Fetch and cache player headshot photos from Wikimedia Commons / Wikipedia
// ============================================================================
// Downloads player avatars locally to assets/players/{team}_{slug}.jpg
// and updates data/squads.json with local /assets/players/... paths.
//
// Benefits:
// - Zero third-party CORS / 403 Forbidden issues in browser
// - 100% offline support
// - Super-fast same-origin load times
// - Graceful monogram initials fallback for any player without a photo
// ============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TEAMS_DATA } from '../js/data/teams.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SQUADS_PATH = join(ROOT, 'data/squads.json');
const ASSETS_PLAYERS_DIR = join(ROOT, 'assets/players');

const USER_AGENT = 'UclSwissSimulator/2.0 (contact@swissformatsim.com; educational football simulator)';

function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function fetchJsonWithTimeout(url, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    return null;
  }
}

async function downloadImage(url, destPath) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) return false; // Filter out tiny/empty responses
    writeFileSync(destPath, buffer);
    return true;
  } catch (err) {
    return false;
  }
}

async function findWikiThumbnail(playerName, teamName) {
  const cleanName = playerName.trim();
  const asciiName = cleanName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const summaryCandidates = [...new Set([
    cleanName.replace(/ /g, '_'),
    asciiName.replace(/ /g, '_'),
    cleanName.replace(/ /g, '_') + '_(footballer)',
    asciiName.replace(/ /g, '_') + '_(footballer)',
  ])];

  // 1. Direct Wikipedia summary API
  for (const slug of summaryCandidates) {
    const summary = await fetchJsonWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`, 3500);
    if (summary && summary.type !== 'disambiguation' && summary.thumbnail?.source) {
      return summary.thumbnail.source;
    }
  }

  // 2. Search API with player name and club name
  const searchQueries = [
    `${cleanName} ${teamName} football`,
    `${cleanName} footballer`,
  ];

  for (const query of searchQueries) {
    const sUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=140`;
    const data = await fetchJsonWithTimeout(sUrl, 3500);
    if (data?.query?.pages) {
      const pages = Object.values(data.query.pages);
      for (const p of pages) {
        if (p.thumbnail?.source) {
          return p.thumbnail.source;
        }
      }
    }
  }

  return null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!existsSync(ASSETS_PLAYERS_DIR)) {
    mkdirSync(ASSETS_PLAYERS_DIR, { recursive: true });
  }

  const squads = JSON.parse(readFileSync(SQUADS_PATH, 'utf8'));
  const teamNameMap = Object.fromEntries(TEAMS_DATA.map(t => [t.id, t.name]));

  let totalPlayers = 0;
  let cached = 0;
  let fetchedNew = 0;
  let notFound = 0;

  console.log('Fetching and caching player photos from Wikipedia/Wikimedia...');

  for (const [teamId, players] of Object.entries(squads)) {
    const teamName = teamNameMap[teamId] || teamId;
    process.stdout.write(`\n[${teamId}] ${teamName} (${players.length} players): `);

    const CHUNK_SIZE = 4;
    for (let i = 0; i < players.length; i += CHUNK_SIZE) {
      const chunk = players.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async (player) => {
        totalPlayers++;
        const fileBase = `${teamId.toLowerCase()}_${slugify(player.name)}.jpg`;
        const localRelPath = `/assets/players/${fileBase}`;
        const localAbsPath = join(ASSETS_PLAYERS_DIR, fileBase);

        if (existsSync(localAbsPath)) {
          player.photo = localRelPath;
          cached++;
          process.stdout.write('.');
          return;
        }

        // Query Wikipedia
        const thumbUrl = await findWikiThumbnail(player.name, teamName);
        if (thumbUrl) {
          const ok = await downloadImage(thumbUrl, localAbsPath);
          if (ok) {
            player.photo = localRelPath;
            fetchedNew++;
            process.stdout.write('+');
          } else {
            delete player.photo;
            notFound++;
            process.stdout.write('x');
          }
        } else {
          delete player.photo;
          notFound++;
          process.stdout.write('-');
        }
      }));

      await delay(40);
    }

    // Checkpoint squads.json after each team
    writeFileSync(SQUADS_PATH, JSON.stringify(squads, null, 2) + '\n');
  }

  console.log('\n\n========================================');
  console.log(`Finished processing ${totalPlayers} players:`);
  console.log(`- Already cached locally: ${cached}`);
  console.log(`- Newly downloaded:       ${fetchedNew}`);
  console.log(`- Clean monogram fallback: ${notFound}`);
  console.log('========================================');

  writeFileSync(SQUADS_PATH, JSON.stringify(squads, null, 2) + '\n');
  console.log(`Updated ${SQUADS_PATH}`);
}

main().catch(err => {
  console.error('Photo fetch failed:', err);
  process.exit(1);
});
