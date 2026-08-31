// ============================================================================
// 2026/27 UEFA Champions League — League Phase team/pot data
// ============================================================================
// STATUS: FINAL. The real league-phase draw was held 27 Aug 2026 in Monaco.
// All 36 teams and pot assignments below are confirmed and cross-checked
// against UEFA.com, Sky Sports, Yahoo/USA Today, Heavy, World Soccer Talk,
// and myKhel — all independently agree on pot 1-4 composition.
//
// WHAT'S STILL MISSING: the specific matchday-by-matchday fixture schedule
// (i.e. which of Matchday 1-8 each pairing falls on) was not yet public as
// of this update — UEFA's own league-phase page states the fixture list
// announcement is still "TBA August 2026", separate from the pot draw
// itself. This does NOT block anything here: the automated data pipeline
// (scripts/fetch-results.mjs, run on schedule via GitHub Actions) will pick
// up the real matchday assignments from football-data.org the moment
// they're published — nothing in this file needs to change for that.
//
// Next season, when pots reset: replace this whole file following the same
// shape, using UEFA's official coefficient-based pot announcement as the
// source (cross-check 2-3 independent outlets before publishing, the way
// this update did — it caught zero discrepancies, which is the bar).
//
// Fields:
//   id        - short unique code used everywhere else in the app
//   name      - display name
//   country   - flag emoji
//   assoc     - national association code, used for the "max 2 teams from
//               the same association" draw constraint
//   pot       - 1-4, per UEFA coefficient seeding
//   strength  - 0-100 rough power rating, used only for "simulate" mode's
//               random score generation (not for the draw itself, and not
//               for real-mode results — has zero effect once real scores
//               exist for a match)
//   confirmed - true for every team as of this update (draw complete)
// ============================================================================

export const TEAMS_DATA = [
  // ---------------- POT 1 ----------------
  { id: "PSG", name: "Paris Saint-Germain", country: "🇫🇷", assoc: "FRA", pot: 1, strength: 93, confirmed: true },
  { id: "BAY", name: "Bayern Munich",        country: "🇩🇪", assoc: "GER", pot: 1, strength: 91, confirmed: true },
  { id: "RMA", name: "Real Madrid",          country: "🇪🇸", assoc: "ESP", pot: 1, strength: 92, confirmed: true },
  { id: "BAR", name: "Barcelona",            country: "🇪🇸", assoc: "ESP", pot: 1, strength: 90, confirmed: true },
  { id: "INT", name: "Inter Milan",          country: "🇮🇹", assoc: "ITA", pot: 1, strength: 88, confirmed: true },
  { id: "ARS", name: "Arsenal",              country: "🏴", assoc: "ENG", pot: 1, strength: 91, confirmed: true },
  { id: "MCI", name: "Manchester City",      country: "🏴", assoc: "ENG", pot: 1, strength: 92, confirmed: true },
  { id: "LIV", name: "Liverpool",            country: "🏴", assoc: "ENG", pot: 1, strength: 90, confirmed: true },
  { id: "ATM", name: "Atlético Madrid",      country: "🇪🇸", assoc: "ESP", pot: 1, strength: 86, confirmed: true },

  // ---------------- POT 2 ----------------
  { id: "DOR", name: "Borussia Dortmund", country: "🇩🇪", assoc: "GER", pot: 2, strength: 85, confirmed: true },
  { id: "ROM", name: "Roma",              country: "🇮🇹", assoc: "ITA", pot: 2, strength: 81, confirmed: true },
  { id: "SPO", name: "Sporting CP",       country: "🇵🇹", assoc: "POR", pot: 2, strength: 83, confirmed: true },
  { id: "POR", name: "Porto",             country: "🇵🇹", assoc: "POR", pot: 2, strength: 80, confirmed: true },
  { id: "BRU", name: "Club Brugge",       country: "🇧🇪", assoc: "BEL", pot: 2, strength: 78, confirmed: true },
  { id: "BET", name: "Real Betis",        country: "🇪🇸", assoc: "ESP", pot: 2, strength: 80, confirmed: true },
  { id: "PSV", name: "PSV Eindhoven",     country: "🇳🇱", assoc: "NED", pot: 2, strength: 81, confirmed: true },
  { id: "AVL", name: "Aston Villa",       country: "🏴", assoc: "ENG", pot: 2, strength: 84, confirmed: true },
  { id: "MUN", name: "Manchester United", country: "🏴", assoc: "ENG", pot: 2, strength: 83, confirmed: true },

  // ---------------- POT 3 ----------------
  { id: "FEY", name: "Feyenoord",         country: "🇳🇱", assoc: "NED", pot: 3, strength: 79, confirmed: true },
  { id: "LIL", name: "Lille",             country: "🇫🇷", assoc: "FRA", pot: 3, strength: 79, confirmed: true },
  { id: "NAP", name: "Napoli",            country: "🇮🇹", assoc: "ITA", pot: 3, strength: 85, confirmed: true },
  { id: "RBL", name: "RB Leipzig",        country: "🇩🇪", assoc: "GER", pot: 3, strength: 82, confirmed: true },
  { id: "VIL", name: "Villarreal",        country: "🇪🇸", assoc: "ESP", pot: 3, strength: 79, confirmed: true },
  { id: "SHK", name: "Shakhtar Donetsk",  country: "🇺🇦", assoc: "UKR", pot: 3, strength: 76, confirmed: true },
  { id: "GAL", name: "Galatasaray",       country: "🇹🇷", assoc: "TUR", pot: 3, strength: 80, confirmed: true },
  { id: "FEN", name: "Fenerbahçe",        country: "🇹🇷", assoc: "TUR", pot: 3, strength: 77, confirmed: true },
  { id: "BOD", name: "Bodø/Glimt",        country: "🇳🇴", assoc: "NOR", pot: 3, strength: 75, confirmed: true },

  // ---------------- POT 4 ----------------
  { id: "SLA", name: "Slavia Prague",     country: "🇨🇿", assoc: "CZE", pot: 4, strength: 74, confirmed: true },
  { id: "STU", name: "Stuttgart",         country: "🇩🇪", assoc: "GER", pot: 4, strength: 78, confirmed: true },
  { id: "COM", name: "Como",              country: "🇮🇹", assoc: "ITA", pot: 4, strength: 76, confirmed: true },
  { id: "LEN", name: "Lens",              country: "🇫🇷", assoc: "FRA", pot: 4, strength: 75, confirmed: true },
  { id: "SLB", name: "Slovan Bratislava", country: "🇸🇰", assoc: "SVK", pot: 4, strength: 68, confirmed: true },
  { id: "AEK", name: "AEK Athens",        country: "🇬🇷", assoc: "GRE", pot: 4, strength: 71, confirmed: true },
  { id: "LSK", name: "LASK",              country: "🇦🇹", assoc: "AUT", pot: 4, strength: 69, confirmed: true },
  { id: "VIK", name: "Viking",            country: "🇳🇴", assoc: "NOR", pot: 4, strength: 67, confirmed: true },
  { id: "SAB", name: "Sabah FK",          country: "🇦🇿", assoc: "AZE", pot: 4, strength: 64, confirmed: true },
];

// True once every team has confirmed: true. Now true — kept as a computed
// check (not hardcoded) so a future season's edit that forgets to flip a
// placeholder to confirmed:true is caught automatically rather than
// silently shipping the "provisional data" banner on real data.
export const DATA_IS_FINAL = TEAMS_DATA.every(t => t.confirmed);
