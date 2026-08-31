// ============================================================================
// Random match score simulation ("Simulate" buttons)
// ============================================================================
// Uses a Poisson goal model driven by each team's strength rating and home
// advantage — this part of the original build was reasonable and is kept
// largely as-is. What changed: fixtures now come from the real constrained
// draw (draw.js) instead of a fake rotation, so this only has to fill in
// scores for whatever fixture list it's given.
// ============================================================================

import { TEAMS_DATA } from '../data/teams.js';

const HOME_ADVANTAGE = 3; // strength points added to the home side

export function simulateMatchScores(targetFixtures) {
  const byId = Object.fromEntries(TEAMS_DATA.map(t => [t.id, t]));
  targetFixtures.forEach(f => {
    const home = byId[f.homeId];
    const away = byId[f.awayId];
    if (!home || !away) return;

    const diff = (home.strength + HOME_ADVANTAGE) - away.strength;
    const hLambda = Math.max(0.5, 1.4 + diff * 0.05);
    const aLambda = Math.max(0.4, 1.1 - diff * 0.05);

    f.homeScore = poissonSample(hLambda);
    f.awayScore = poissonSample(aLambda);
  });
}

function poissonSample(lambda) {
  const L = Math.exp(-lambda);
  let p = 1.0;
  let k = 0;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return Math.min(8, k - 1);
}
