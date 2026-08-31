// ============================================================================
// Swiss-format league phase draw generator
// ============================================================================
// Real UEFA rule set being modeled:
//   - Every team plays 8 matches: exactly 2 opponents from EACH of the 4 pots
//     (a team's own pot included — those 2 come from the other 8 teams in it)
//   - Of those 8 matches, exactly 4 are home and 4 are away
//   - A team cannot face more than 2 opponents from the same association
//   - Each team plays exactly one match per matchday (matchdays 1-8)
// NOT modeled (documented limitation, not silently dropped):
//   - UEFA's political/conflict restrictions on specific pairings
//   - The exact proprietary constraint order UEFA's own draw software uses
//
// APPROACH: two backtracking CSP solves, run in sequence, each wrapped in
// an outer retry loop:
//   1) Pair every team with 2 opponents per pot, respecting the
//      association cap and keeping home/away balanced to exactly 4/4.
//   2) Given that fixed set of 144 pairings, assign each one to one of the
//      8 matchdays so no team plays twice on the same matchday.
// Solving both at once in a single combined search was tried first and
// discarded — the interaction between all four rule sets made the search
// space thrash badly (200k+ steps with no result). Splitting them into two
// smaller, independent searches with a shared outer retry converges in
// well under a second in practice.
// ============================================================================

const MAX_BACKTRACK_STEPS = 200000;
const MAX_PAIRING_ATTEMPTS = 60;
const MAX_OUTER_ATTEMPTS = 15; // covers the rare case matchday assignment fails on an otherwise-valid pairing
const WALL_CLOCK_BUDGET_MS = 4000; // hard ceiling across ALL attempts combined — see note below

// A per-attempt step cap alone isn't enough: a genuinely infeasible dataset
// (e.g. a data-entry mistake putting too many teams from one association in
// one pot) can cause MANY attempts to each burn close to the full step
// budget before giving up, multiplying into a very long total run — this
// was caught by testing an infeasible dataset directly, which hung well
// past a reasonable UI response time. A shared wall-clock deadline across
// the whole generateSwissFixtures() call, checked inside the hot loop,
// guarantees a bounded failure time regardless of how many attempts it
// takes, independent of the step-count caps below.

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function solvePairingOnce(teams, deadline) {
  const byId = Object.fromEntries(teams.map(t => [t.id, t]));
  const potGroups = { 1: [], 2: [], 3: [], 4: [] };
  teams.forEach(t => potGroups[t.pot].push(t.id));

  const state = {};
  teams.forEach(t => {
    state[t.id] = { opponents: new Set(), home: 0, away: 0, potCount: { 1: 0, 2: 0, 3: 0, 4: 0 }, assocCount: {} };
  });

  const pairMeta = {};
  let steps = 0;
  let timedOut = false;

  function validCandidates(tid, pot) {
    const team = byId[tid];
    const s = state[tid];
    return potGroups[pot].filter(cid => {
      if (cid === tid) return false;
      if (s.opponents.has(cid)) return false;
      const cs = state[cid];
      if (cs.potCount[team.pot] >= 2) return false;
      const cTeam = byId[cid];
      if ((s.assocCount[cTeam.assoc] || 0) >= 2) return false;
      if ((cs.assocCount[team.assoc] || 0) >= 2) return false;
      // Only truly incompatible pairs get rejected: both already maxed on
      // the SAME side (both need home, or both need away) can't play each
      // other, since a match needs exactly one of each.
      if (s.home >= 4 && cs.home >= 4) return false;
      if (s.away >= 4 && cs.away >= 4) return false;
      return true;
    });
  }

  function pickMostConstrainedSlot() {
    let best = null;
    let bestCount = Infinity;
    for (const t of teams) {
      for (let pot = 1; pot <= 4; pot++) {
        if (state[t.id].potCount[pot] >= 2) continue;
        const n = validCandidates(t.id, pot).length;
        if (n < bestCount) {
          bestCount = n;
          best = { tid: t.id, pot };
          if (n === 0) return best;
        }
      }
    }
    return best;
  }

  function applyEdge(tid, cid, pot) {
    const team = byId[tid];
    const cTeam = byId[cid];
    const s = state[tid];
    const cs = state[cid];

    // Force the side that's already capped; if neither is capped, defer to
    // whichever side the opponent still needs; otherwise pick randomly.
    let tHome;
    if (s.home >= 4) tHome = false;
    else if (s.away >= 4) tHome = true;
    else if (cs.home >= 4) tHome = true;
    else if (cs.away >= 4) tHome = false;
    else tHome = Math.random() < 0.5;

    s.opponents.add(cid); cs.opponents.add(tid);
    s.potCount[pot] += 1; cs.potCount[team.pot] += 1;
    s.assocCount[cTeam.assoc] = (s.assocCount[cTeam.assoc] || 0) + 1;
    cs.assocCount[team.assoc] = (cs.assocCount[team.assoc] || 0) + 1;
    if (tHome) { s.home += 1; cs.away += 1; } else { s.away += 1; cs.home += 1; }

    pairMeta[[tid, cid].sort().join('|')] = tHome ? tid : cid;
    return tHome;
  }

  function undoEdge(tid, cid, pot, tHome) {
    const team = byId[tid];
    const cTeam = byId[cid];
    const s = state[tid];
    const cs = state[cid];

    s.opponents.delete(cid); cs.opponents.delete(tid);
    s.potCount[pot] -= 1; cs.potCount[team.pot] -= 1;
    s.assocCount[cTeam.assoc] -= 1; cs.assocCount[team.assoc] -= 1;
    if (tHome) { s.home -= 1; cs.away -= 1; } else { s.away -= 1; cs.home -= 1; }

    delete pairMeta[[tid, cid].sort().join('|')];
  }

  function backtrack() {
    if (timedOut) return false; // abort signal set deeper in the recursion — unwind immediately without exploring further candidates at this level either

    steps++;
    if (steps > MAX_BACKTRACK_STEPS) { timedOut = true; return false; }
    // Check the shared wall-clock deadline every 500 steps (cheap enough
    // not to matter for real, fast-succeeding searches, but bounds the
    // worst case for a genuinely infeasible dataset). Setting `timedOut`
    // (not just returning false) is essential: a plain `return false`
    // only tells the immediate parent "this branch failed," so its for-loop
    // just moves on to the next candidate instead of aborting the whole
    // search — that's what let an earlier version of this run for 15+
    // seconds after the deadline had already passed. The shared flag makes
    // every frame at every level bail immediately instead.
    if (steps % 500 === 0 && Date.now() > deadline) { timedOut = true; return false; }

    const slot = pickMostConstrainedSlot();
    if (!slot) return true;

    const candidates = shuffle(validCandidates(slot.tid, slot.pot));
    if (candidates.length === 0) return false;

    for (const cid of candidates) {
      const tHome = applyEdge(slot.tid, cid, slot.pot);
      if (backtrack()) return true;
      undoEdge(slot.tid, cid, slot.pot, tHome);
      if (timedOut) return false; // don't try further candidates once aborted
    }
    return false;
  }

  if (!backtrack()) return null;

  const pairs = [];
  const seen = new Set();
  teams.forEach(t => {
    state[t.id].opponents.forEach(oid => {
      const key = [t.id, oid].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const homeId = pairMeta[key];
      const awayId = homeId === t.id ? oid : t.id;
      pairs.push({ home: homeId, away: awayId });
    });
  });

  return pairs;
}

function solvePairingWithRetry(teams, deadline) {
  for (let attempt = 0; attempt < MAX_PAIRING_ATTEMPTS; attempt++) {
    if (Date.now() > deadline) return null;
    const result = solvePairingOnce(teams, deadline);
    if (result) return result;
  }
  return null;
}

function solveMatchdaysOnce(pairs, teams, deadline) {
  const used = {};
  teams.forEach(t => { used[t.id] = new Set(); });
  const assigned = new Array(pairs.length).fill(null);
  let steps = 0;
  let timedOut = false;

  function validMatchdays(idx) {
    const p = pairs[idx];
    const out = [];
    for (let md = 1; md <= 8; md++) {
      if (!used[p.home].has(md) && !used[p.away].has(md)) out.push(md);
    }
    return out;
  }

  function pickMostConstrainedEdge() {
    let best = -1;
    let bestCount = Infinity;
    let bestMds = null;
    for (let i = 0; i < pairs.length; i++) {
      if (assigned[i] !== null) continue;
      const mds = validMatchdays(i);
      if (mds.length < bestCount) {
        bestCount = mds.length;
        best = i;
        bestMds = mds;
        if (mds.length === 0) return { idx: i, mds };
      }
    }
    return best === -1 ? null : { idx: best, mds: bestMds };
  }

  function backtrack() {
    if (timedOut) return false;

    steps++;
    if (steps > MAX_BACKTRACK_STEPS) { timedOut = true; return false; }
    if (steps % 500 === 0 && Date.now() > deadline) { timedOut = true; return false; }

    const pick = pickMostConstrainedEdge();
    if (!pick) return true;
    if (pick.mds.length === 0) return false;

    for (const md of shuffle(pick.mds)) {
      assigned[pick.idx] = md;
      used[pairs[pick.idx].home].add(md);
      used[pairs[pick.idx].away].add(md);
      if (backtrack()) return true;
      assigned[pick.idx] = null;
      used[pairs[pick.idx].home].delete(md);
      used[pairs[pick.idx].away].delete(md);
      if (timedOut) return false;
    }
    return false;
  }

  return backtrack() ? assigned : null;
}

/**
 * Generates a full, constraint-respecting 144-fixture Swiss league phase.
 * Bounded by a shared wall-clock budget (WALL_CLOCK_BUDGET_MS) across every
 * attempt combined, so an infeasible dataset fails predictably fast rather
 * than potentially hanging the page. Throws if no valid draw was found
 * within that budget — for real UEFA seeding data this succeeds in well
 * under a second; a failure here almost always means a data-entry mistake
 * in teams.js (e.g. too many teams from one association in one pot), not a
 * transient fluke worth silently retrying forever.
 */
export function generateSwissFixtures(teamsData) {
  const deadline = Date.now() + WALL_CLOCK_BUDGET_MS;

  for (let outer = 0; outer < MAX_OUTER_ATTEMPTS; outer++) {
    if (Date.now() > deadline) break;

    const pairs = solvePairingWithRetry(teamsData, deadline);
    if (!pairs) continue;

    const assigned = solveMatchdaysOnce(pairs, teamsData, deadline);
    if (!assigned) continue; // pairing was fine, matchday split failed -> try a fresh pairing

    const fixtures = [];
    const counters = {};
    pairs.forEach((pair, i) => {
      const md = assigned[i];
      counters[md] = (counters[md] || 0) + 1;
      fixtures.push({
        id: `M${md}_${counters[md]}`,
        matchday: md,
        homeId: pair.home,
        awayId: pair.away,
        homeScore: null,
        awayScore: null,
      });
    });
    return fixtures;
  }

  throw new Error('Draw generation failed — the team/pot/association data may be infeasible (e.g. one association with too many teams in the same pot). Please retry, or check the data in teams.js for an entry error.');
}
