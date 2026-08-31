// ============================================================================
// Effective score resolution
// ============================================================================
// Every fixture can carry two independent score pairs:
//   - homeScore / awayScore         -> the user's prediction (or a
//                                       "Simulate" random result). Cleared
//                                       by Reset.
//   - realHomeScore / realAwayScore -> the actual real-world result, filled
//                                       in by the automated data pipeline.
//                                       Never touched by Reset.
// The "effective" score — what standings.js counts and what the input boxes
// display — is: predicted score if the user has entered one, otherwise the
// real score if the match has actually been played, otherwise unplayed.
// This one function is the single place that decision is made, so the
// renderer and the standings calculator can never disagree about it.
// ============================================================================

export function getEffectiveScore(fixture) {
  if (fixture.homeScore !== null && fixture.homeScore !== undefined &&
      fixture.awayScore !== null && fixture.awayScore !== undefined) {
    return { homeScore: fixture.homeScore, awayScore: fixture.awayScore, source: 'predicted' };
  }
  if (fixture.realHomeScore !== null && fixture.realHomeScore !== undefined &&
      fixture.realAwayScore !== null && fixture.realAwayScore !== undefined) {
    return { homeScore: fixture.realHomeScore, awayScore: fixture.realAwayScore, source: 'real' };
  }
  return { homeScore: null, awayScore: null, source: 'unplayed' };
}
