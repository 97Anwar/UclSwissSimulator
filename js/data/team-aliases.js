// ============================================================================
// Team name alias table
// ============================================================================
// External data sources (football-data.org, etc.) name teams differently
// than our internal short ids ("Real Madrid CF" vs our "RMA", short name
// sometimes "Real Madrid" vs "Real Madrid CF" depending on endpoint). This
// maps every reasonably-likely external spelling to our internal team id
// so the results-fetching script and the frontend can both resolve names
// consistently.
//
// >>> If a team is ever unmatched, the fetch script logs it clearly rather
// than silently dropping it — check scripts/fetch-results.mjs output and
// add the missing spelling here. <<<
// ============================================================================

export const TEAM_NAME_ALIASES = {
  // Pot 1
  "paris saint-germain": "PSG", "psg": "PSG", "paris sg": "PSG",
  "bayern munich": "BAY", "fc bayern münchen": "BAY", "bayern münchen": "BAY", "bayern": "BAY",
  "real madrid": "RMA", "real madrid cf": "RMA",
  "barcelona": "BAR", "fc barcelona": "BAR",
  "inter milan": "INT", "internazionale": "INT", "inter": "INT", "fc internazionale milano": "INT",
  "arsenal": "ARS", "arsenal fc": "ARS",
  "manchester city": "MCI", "man city": "MCI",
  "liverpool": "LIV", "liverpool fc": "LIV",
  "atlético madrid": "ATM", "atletico madrid": "ATM", "club atlético de madrid": "ATM",

  // Pot 2
  "borussia dortmund": "DOR", "dortmund": "DOR", "bvb": "DOR",
  "roma": "ROM", "as roma": "ROM",
  "sporting cp": "SPO", "sporting clube de portugal": "SPO", "sporting lisbon": "SPO",
  "porto": "POR", "fc porto": "POR",
  "club brugge": "BRU", "club brugge kv": "BRU",
  "real betis": "BET", "real betis balompié": "BET",
  "psv eindhoven": "PSV", "psv": "PSV",
  "aston villa": "AVL", "aston villa fc": "AVL",
  "manchester united": "MUN", "man united": "MUN", "man utd": "MUN",

  // Pot 3
  "feyenoord": "FEY", "feyenoord rotterdam": "FEY",
  "lille": "LIL", "losc lille": "LIL",
  "napoli": "NAP", "ssc napoli": "NAP",
  "rb leipzig": "RBL", "rasenballsport leipzig": "RBL",
  "villarreal": "VIL", "villarreal cf": "VIL",
  "shakhtar donetsk": "SHK",
  "galatasaray": "GAL", "galatasaray sk": "GAL",
  "fenerbahçe": "FEN", "fenerbahce": "FEN", "fenerbahçe sk": "FEN", "fenerbahce sk": "FEN",
  "bodø/glimt": "BOD", "bodo/glimt": "BOD", "fk bodø/glimt": "BOD", "fk bodo/glimt": "BOD", "bodo glimt": "BOD",

  // Pot 4
  "slavia prague": "SLA", "sk slavia praha": "SLA", "slavia praha": "SLA",
  "stuttgart": "STU", "vfb stuttgart": "STU",
  "como": "COM", "como 1907": "COM",
  "lens": "LEN", "rc lens": "LEN",
  "slovan bratislava": "SLB", "šk slovan bratislava": "SLB", "sk slovan bratislava": "SLB",
  "aek athens": "AEK", "aek athens fc": "AEK", "aek": "AEK",
  "lask": "LSK", "lask linz": "LSK",
  "viking": "VIK", "viking fk": "VIK",
  "sabah fk": "SAB", "sabah": "SAB",
};

/** Normalizes a name for lookup: lowercase, trimmed, punctuation-light. */
export function normalizeTeamName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Returns our internal team id for an external team name, or null if unmatched. */
export function resolveTeamId(externalName) {
  return TEAM_NAME_ALIASES[normalizeTeamName(externalName)] || null;
}
