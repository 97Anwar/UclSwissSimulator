// ============================================================================
// Qualification analysis (league-phase "can my team still...?" engine)
// ============================================================================
// Given the current standings and the fixture list, works out for every club:
//   - points range still reachable (win-out vs lose-out)
//   - a provably-correct final-rank interval [bestRank, worstRank]
//   - whether the top-8 (direct round of 16) and top-24 (avoiding elimination)
//     places are already CLINCHED, still in CONTENTION, or ELIMINATED
//   - the fewest points that would GUARANTEE top 8 / avoiding elimination
//
// CORRECTNESS PRINCIPLE: this must never lie. Every "clinched"/"eliminated"
// verdict is derived from points-only bounds that hold in every remaining
// scenario, using strict inequalities so ties are always resolved against the
// stronger claim. The rank interval is guaranteed to contain the real final
// rank (it may be wider than the true achievable range, never narrower).
// Tiebreakers (goal difference etc.) can only decide order *within* equal
// points, so a points-based clinch/elimination is always safe.
//
// The guarantee ("points to clinch") uses an adversarial worst case where
// every rival wins all its remaining matches. That over-counts threats (rivals
// also play each other and can't all win), so the number is a safe upper bound
// — it never tells a fan they're safe when they aren't.
// ============================================================================

import { getEffectiveScore } from './effective-score.js';

const TOP8 = 8;
const TOP24 = 24;

// Every points total a team can still add over `r` matches (3=win, 1=draw,
// 0=loss). Not every integer is reachable (e.g. from 1 game: 0, 1 or 3).
function reachableAddedPoints(r) {
  const set = new Set();
  for (let w = 0; w <= r; w++) {
    for (let d = 0; d <= r - w; d++) set.add(3 * w + d);
  }
  return [...set].sort((a, b) => a - b);
}

// Fewest points a team must still earn to make at most `maxAbove` rivals able
// to finish on or above it — i.e. to guarantee a place inside the cutoff.
// Returns 0 if already guaranteed, or null if even winning out can't guarantee
// it yet. `others` carries each rival's max reachable points.
function pointsToGuarantee(currentPoints, remaining, others, maxAbove) {
  for (const added of reachableAddedPoints(remaining)) {
    const total = currentPoints + added;
    const couldFinishAbove = others.reduce((n, o) => n + (o.max >= total ? 1 : 0), 0);
    if (couldFinishAbove <= maxAbove) return added;
  }
  return null;
}

function statusFromInterval(bestRank, worstRank, cutoff) {
  if (worstRank <= cutoff) return 'clinched';
  if (bestRank > cutoff) return 'eliminated';
  return 'contention';
}

/**
 * Pure core: analyse an array of teams with known remaining-match counts.
 * @param {Array} teams [{ id, name, points, played, remaining }]
 * @param {number} totalTeams size of the table the cutoffs apply to (default:
 *   the number of teams passed in; real league phase is 36)
 * @returns {Object} map of teamId -> qualification analysis
 */
export function analyzeTeams(teams, totalTeams = teams.length) {
  const N = totalTeams;
  const enriched = teams.map(t => ({
    id: t.id,
    name: t.name,
    points: t.points,
    played: t.played,
    remaining: t.remaining,
    max: t.points + 3 * t.remaining,
    min: t.points,
  }));

  const result = {};
  for (const t of enriched) {
    const others = enriched.filter(o => o.id !== t.id);

    // Teams that finish above/below T in EVERY remaining scenario (strict, so
    // a possible points tie is never counted as "certain").
    const certainlyAbove = others.reduce((n, o) => n + (o.min > t.max ? 1 : 0), 0);
    const certainlyBelow = others.reduce((n, o) => n + (o.max < t.min ? 1 : 0), 0);

    const bestRank = certainlyAbove + 1;
    const worstRank = N - certainlyBelow;

    const top8 = statusFromInterval(bestRank, worstRank, TOP8);
    const top24 = statusFromInterval(bestRank, worstRank, TOP24);

    result[t.id] = {
      points: t.points,
      played: t.played,
      remaining: t.remaining,
      maxPoints: t.max,
      minPoints: t.min,
      bestRank,
      worstRank,
      top8,
      top24,
      // null when the zone is already out of reach or can't yet be guaranteed.
      pointsToClinchTop8: top8 === 'eliminated' ? null : pointsToGuarantee(t.points, t.remaining, others, TOP8 - 1),
      pointsToClinchTop24: top24 === 'eliminated' ? null : pointsToGuarantee(t.points, t.remaining, others, TOP24 - 1),
    };
  }

  return result;
}

/**
 * @param {Array} standings rows from computeStandings (need id, points, played)
 * @param {Array} fixtures  full fixture list (played + scheduled)
 * @returns {Object} map of teamId -> qualification analysis
 */
export function analyzeQualification(standings, fixtures) {
  // Remaining matches per team = its fixtures with no effective score yet.
  const remainingById = {};
  standings.forEach(r => { remainingById[r.id] = 0; });
  fixtures.forEach(f => {
    const { homeScore } = getEffectiveScore(f);
    if (homeScore !== null) return;
    if (remainingById[f.homeId] !== undefined) remainingById[f.homeId] += 1;
    if (remainingById[f.awayId] !== undefined) remainingById[f.awayId] += 1;
  });

  const teams = standings.map(r => ({
    id: r.id,
    name: r.name,
    points: r.points,
    played: r.played,
    remaining: remainingById[r.id] || 0,
  }));

  return analyzeTeams(teams, standings.length);
}
