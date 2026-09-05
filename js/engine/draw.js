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
// APPROACH: two backtracking CSP solves plus one deterministic orientation
// pass, run in sequence, the searches wrapped in an outer retry loop:
//   1) Pair every team with 2 opponents per pot, respecting the
//      association cap. Home/away is NOT decided here.
//   2) Orient each of the 144 pairings home/away so every team gets exactly
//      4 home and 4 away. Because every team has exactly 8 opponents, every
//      vertex of the opponent graph has even degree, so each connected
//      component is Eulerian: walking an Eulerian circuit and orienting each
//      edge in the direction of travel guarantees in-degree == out-degree ==
//      4 for every team. This step is deterministic and can never fail, so
//      home/away can no longer cause a late, expensive backtrack — which is
//      what previously gave the search a heavy runtime tail that occasionally
//      blew the wall-clock budget.
//   3) Given the fixed set of 144 pairings, assign each one to one of the
//      8 matchdays so no team plays twice on the same matchday.
// Solving pairing + orientation + scheduling all at once in a single
// combined search was tried first and discarded — the interaction between
// all the rule sets made the search space thrash badly (200k+ steps with no
// result). Splitting them converges in well under a second in practice.
// ============================================================================

// Pairing runtime is heavy-tailed: most random seeds solve in a few hundred
// steps, but a small fraction thrash for a very long time. Rather than let an
// unlucky seed grind on (which is what gave the whole draw its occasional
// multi-second tail and budget-exceeded failures), abandon a pairing attempt
// after a low step cap and restart fresh — the classic rapid-restart cure for
// heavy-tailed backtracking search.
const PAIRING_RESTART_STEPS = 1000;
// The matchday assignment is an 8-edge-colouring of the (8-regular) opponent
// graph. Most pairings are 8-edge-colourable ("Class 1") and colour almost
// instantly, but some random pairings are "Class 2" and can't be split into 8
// clash-free matchdays at all — no search will ever succeed on them. So cap
// the matchday search low too: a failure just means "this pairing was Class 2,
// throw it away and draw a fresh one," which is far cheaper than grinding a
// doomed search to a huge step limit.
const MATCHDAY_RESTART_STEPS = 20000;
const MAX_PAIRING_ATTEMPTS = 2000; // bounded in practice by the shared wall-clock deadline, not this number
const MAX_OUTER_ATTEMPTS = 400; // re-draws a fresh pairing when one turns out not to be 8-colourable; bounded by the wall-clock deadline
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
    state[t.id] = { opponents: new Set(), potCount: { 1: 0, 2: 0, 3: 0, 4: 0 }, assocCount: {} };
  });

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

    s.opponents.add(cid); cs.opponents.add(tid);
    s.potCount[pot] += 1; cs.potCount[team.pot] += 1;
    s.assocCount[cTeam.assoc] = (s.assocCount[cTeam.assoc] || 0) + 1;
    cs.assocCount[team.assoc] = (cs.assocCount[team.assoc] || 0) + 1;
  }

  function undoEdge(tid, cid, pot) {
    const team = byId[tid];
    const cTeam = byId[cid];
    const s = state[tid];
    const cs = state[cid];

    s.opponents.delete(cid); cs.opponents.delete(tid);
    s.potCount[pot] -= 1; cs.potCount[team.pot] -= 1;
    s.assocCount[cTeam.assoc] -= 1; cs.assocCount[team.assoc] -= 1;
  }

  function backtrack() {
    if (timedOut) return false; // abort signal set deeper in the recursion — unwind immediately without exploring further candidates at this level either

    steps++;
    if (steps > PAIRING_RESTART_STEPS) { timedOut = true; return false; }

    const slot = pickMostConstrainedSlot();
    if (!slot) return true;

    const candidates = shuffle(validCandidates(slot.tid, slot.pot));
    if (candidates.length === 0) return false;

    for (const cid of candidates) {
      applyEdge(slot.tid, cid, slot.pot);
      if (backtrack()) return true;
      undoEdge(slot.tid, cid, slot.pot);
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
      pairs.push({ a: t.id, b: oid });
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

// Orients the undirected opponent graph home/away so every team gets exactly
// 4 home and 4 away. Every team has 8 opponents => every vertex has even
// degree => each connected component is Eulerian. Tracing an Eulerian circuit
// (iterative Hierholzer) and orienting each edge in the direction it was
// traversed makes each vertex's out-degree equal its in-degree, i.e. 4/4.
// Deterministic and always succeeds, so it never triggers a retry.
function orientHomeAway(pairs, teams) {
  const adj = {};
  teams.forEach(t => { adj[t.id] = []; });
  pairs.forEach((p, i) => {
    adj[p.a].push({ to: p.b, edge: i });
    adj[p.b].push({ to: p.a, edge: i });
  });

  const usedEdge = new Array(pairs.length).fill(false);
  const oriented = new Array(pairs.length).fill(null);
  const ptr = {};
  teams.forEach(t => { ptr[t.id] = 0; });

  for (const t of teams) {
    const start = t.id;
    while (ptr[start] < adj[start].length && usedEdge[adj[start][ptr[start]].edge]) ptr[start]++;
    if (ptr[start] >= adj[start].length) continue;

    const stack = [start];
    const edgeStack = []; // the edge traversed to reach each vertex pushed above `start`
    while (stack.length > 0) {
      const v = stack[stack.length - 1];
      while (ptr[v] < adj[v].length && usedEdge[adj[v][ptr[v]].edge]) ptr[v]++;
      if (ptr[v] < adj[v].length) {
        const e = adj[v][ptr[v]++];
        usedEdge[e.edge] = true;
        edgeStack.push({ from: v, edge: e.edge });
        stack.push(e.to);
      } else {
        stack.pop();
        const entered = edgeStack.pop();
        if (entered) {
          const p = pairs[entered.edge];
          const home = entered.from;
          const away = home === p.a ? p.b : p.a;
          oriented[entered.edge] = { home, away };
        }
      }
    }
  }

  return oriented;
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
    if (steps > MATCHDAY_RESTART_STEPS) { timedOut = true; return false; }
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

    const oriented = orientHomeAway(pairs, teamsData);

    const assigned = solveMatchdaysOnce(oriented, teamsData, deadline);
    if (!assigned) continue; // pairing was fine, matchday split failed -> try a fresh pairing

    const fixtures = [];
    const counters = {};
    pairs.forEach((pair, i) => {
      const md = assigned[i];
      counters[md] = (counters[md] || 0) + 1;
      fixtures.push({
        id: `M${md}_${counters[md]}`,
        matchday: md,
        homeId: oriented[i].home,
        awayId: oriented[i].away,
        homeScore: null,
        awayScore: null,
      });
    });
    return fixtures;
  }

  throw new Error('Draw generation failed — the team/pot/association data may be infeasible (e.g. one association with too many teams in the same pot). Please retry, or check the data in teams.js for an entry error.');
}
