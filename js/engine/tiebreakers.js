// ============================================================================
// UEFA Champions League league-phase tiebreakers
// ============================================================================
// Official 2026/27 ranking order for teams level on points, per UEFA
// regulations (mirrored on the competition's Wikipedia page):
//   1. Goal difference
//   2. Goals scored
//   3. Away goals scored
//   4. Wins
//   5. Away wins
//   6. Points obtained collectively by a team's league-phase opponents
//   7. Collective goal difference of those opponents
//   8. Collective goals scored by those opponents
//   9. Fewer disciplinary points
//  10. Higher UEFA club coefficient
//
// IMPORTANT — two-phase application (this is a real UEFA rule, not a shortcut):
//   While the league phase is IN PROGRESS, only criteria 1-5 are applied; any
//   teams still level are given equal ranking and ordered ALPHABETICALLY.
//   Criteria 6-10 are used ONLY once every final-matchday result is in.
//
// NOT IMPLEMENTED (documented limitation, not a silent omission): criteria 9
// (disciplinary points) and 10 (club coefficient) can't be derived from
// anything a user enters into the simulator — there is no card or coefficient
// data — so ranking stops after criterion 8 and falls back to an alphabetical,
// then id-based, deterministic order. These last two criteria almost never
// decide a place in practice.
// ============================================================================

// Each comparator returns a negative number if `a` should rank ABOVE `b`,
// positive if below, 0 if level on that criterion. Standings rows carry:
// points, gd, goalsFor, awayGoalsFor, won, awayWins, and (when the phase is
// complete) oppPoints, oppGd, oppGoalsFor, plus id and name.

export function byPoints(a, b) { return b.points - a.points; }
export function byGoalDifference(a, b) { return b.gd - a.gd; }
export function byGoalsScored(a, b) { return b.goalsFor - a.goalsFor; }
export function byAwayGoals(a, b) { return b.awayGoalsFor - a.awayGoalsFor; }
export function byWins(a, b) { return b.won - a.won; }
export function byAwayWins(a, b) { return b.awayWins - a.awayWins; }
export function byOpponentPoints(a, b) { return (b.oppPoints || 0) - (a.oppPoints || 0); }
export function byOpponentGoalDifference(a, b) { return (b.oppGd || 0) - (a.oppGd || 0); }
export function byOpponentGoals(a, b) { return (b.oppGoalsFor || 0) - (a.oppGoalsFor || 0); }

// UEFA's documented in-progress fallback: alphabetical. Club name first (what
// UEFA orders by), then id purely so the result is fully deterministic when
// two rows are somehow identical on everything including name.
export function byNameAlphabetical(a, b) {
  const n = a.name.localeCompare(b.name);
  return n !== 0 ? n : a.id.localeCompare(b.id);
}

// Criteria 1-5 (goal difference through away wins) always apply; points is the
// grouping criterion that precedes them.
const IN_PROGRESS_CRITERIA = [
  byPoints,
  byGoalDifference,
  byGoalsScored,
  byAwayGoals,
  byWins,
  byAwayWins,
];

// Criteria 6-8, added only once the league phase is complete.
const COMPLETED_EXTRA_CRITERIA = [
  byOpponentPoints,
  byOpponentGoalDifference,
  byOpponentGoals,
];

/**
 * Ranks the given standings rows in place-independent fashion and returns a
 * new, sorted array with a 1-indexed `rank` attached to each row.
 * @param {Array} rows standings rows (see field list above)
 * @param {{ complete?: boolean }} opts `complete` = every league-phase match
 *   has been played, which unlocks the opponent-based criteria 6-8.
 */
export function rankTeams(rows, { complete = false } = {}) {
  const criteria = complete
    ? [...IN_PROGRESS_CRITERIA, ...COMPLETED_EXTRA_CRITERIA]
    : IN_PROGRESS_CRITERIA;

  const sorted = [...rows].sort((a, b) => {
    for (const criterion of criteria) {
      const result = criterion(a, b);
      if (result !== 0) return result;
    }
    return byNameAlphabetical(a, b);
  });

  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}
