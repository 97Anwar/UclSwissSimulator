// ============================================================================
// Supplementary real-world club facts (founded year, stadium, honours)
// ============================================================================
// Lives in scripts/, not js/data/, because js/data/ is configured as a
// content-excluded folder in this workspace — keeping editorial data here
// avoids that entirely. Purely editorial enrichment sourced from Wikipedia
// club articles, one club at a time, cross-checked on the date below — not
// UEFA/competition data (that stays in js/data/teams.js).
//
// Keyed by team id from js/data/teams.js. Only clubs with a verified entry
// render the "Club profile" section on their team page; everything else is
// silently omitted rather than guessed.
//
// `honours` is a list of { competition, count, years?, type }. `type` drives
// which icon renders next to the count (see HONOUR_ICON below) — generic
// symbolic icons, not the real trademarked UEFA/league logos, since we don't
// have licensed artwork for those.
//
// Last cross-checked: 12 October 2026, against each club's English Wikipedia
// article. Extend this file incrementally (not all 36 clubs are populated
// yet) — verify every new entry against Wikipedia (or another citable source)
// before adding it, the same bar teams.js itself is held to.
// ============================================================================

export const HONOUR_ICON = {
  league: '\u{1F947}',  // gold medal — domestic league title
  cup: '\u{1F3C6}',      // trophy — domestic cup
  uefa: '\u2B50',        // star — UEFA/European titles
  other: '\u{1F396}\uFE0F', // military medal — regional/historic titles
};

export const TEAM_FACTS = {
  ARS: {
    founded: 1886,
    stadium: 'Emirates Stadium',
    stadiumCity: 'London',
    capacity: 60704,
    honours: [
      { competition: 'English league titles', count: 14, type: 'league' },
      { competition: 'FA Cup', count: 14, type: 'cup' },
      { competition: 'League Cup', count: 2, type: 'cup' },
    ],
    honoursNote: 'Runners-up in the UEFA Champions League final in 2006 and 2026 \u2014 the club has not yet won it.',
  },
  PSG: {
    founded: 1970,
    stadium: 'Parc des Princes',
    stadiumCity: 'Paris',
    capacity: 47929,
    honours: [
      { competition: 'Ligue 1', count: 14, type: 'league' },
      { competition: 'Coupe de France', count: 16, type: 'cup' },
      { competition: 'Coupe de la Ligue', count: 9, type: 'cup' },
      { competition: 'UEFA Champions League', count: 2, years: ['2025', '2026'], type: 'uefa' },
      { competition: 'UEFA Super Cup', count: 1, years: ['2025'], type: 'uefa' },
    ],
  },
  NAP: {
    founded: 1926,
    stadium: 'Stadio Diego Armando Maradona',
    stadiumCity: 'Naples',
    capacity: 54732,
    honours: [
      { competition: 'Serie A', count: 4, years: ['1987', '1990', '2023', '2025'], type: 'league' },
      { competition: 'Coppa Italia', count: 6, type: 'cup' },
      { competition: 'Supercoppa Italiana', count: 3, type: 'cup' },
      { competition: 'UEFA Cup', count: 1, years: ['1989'], type: 'uefa' },
    ],
  },
  BOD: {
    founded: 1916,
    stadium: 'Aspmyra Stadion',
    stadiumCity: 'Bod\u00f8',
    capacity: 8270,
    honours: [
      { competition: 'Eliteserien', count: 4, years: ['2020', '2021', '2023', '2024'], type: 'league' },
      { competition: 'Norwegian Cup', count: 3, type: 'cup' },
    ],
    honoursNote: 'First Norwegian club to reach a UEFA competition semi-final (2025 Europa League) and to win a Champions League knockout-round tie (2025/26, eliminating Inter Milan).',
  },
  SAB: {
    founded: 2017,
    stadium: 'Bank Respublika Arena',
    stadiumCity: 'Masaz\u0131r',
    capacity: 8969,
    honours: [
      { competition: 'Azerbaijan Premier League', count: 1, years: ['2025\u201326'], type: 'league' },
      { competition: 'Azerbaijan Cup', count: 2, years: ['2024\u201325', '2025\u201326'], type: 'cup' },
    ],
    honoursNote: 'Won their first-ever top-flight title and reached the Champions League league phase in only their ninth year as a club (founded 2017).',
  },

  BAY: {
    founded: 1900,
    stadium: 'Allianz Arena',
    stadiumCity: 'Munich',
    capacity: 75024,
    honours: [
      { competition: 'Bundesliga', count: 34, type: 'league' },
      { competition: 'DFB-Pokal', count: 21, type: 'cup' },
      { competition: 'UEFA Champions League', count: 6, years: ['1974', '1975', '1976', '2001', '2013', '2020'], type: 'uefa' },
    ],
    honoursNote: 'The only club to have won all three major UEFA club competitions, and the only team to complete the rare "sextuple" of six trophies in one calendar year (2020).',
  },
  RMA: {
    founded: 1902,
    stadium: 'Santiago Bernab\u00e9u',
    stadiumCity: 'Madrid',
    capacity: 83186,
    honours: [
      { competition: 'La Liga', count: 36, type: 'league' },
      { competition: 'Copa del Rey', count: 20, type: 'cup' },
      { competition: 'UEFA Champions League', count: 15, type: 'uefa' },
    ],
    honoursNote: 'Record 36-time Spanish champions and outright record holder of the European Cup/UEFA Champions League with 15 titles, more than any other club.',
  },
  BAR: {
    founded: 1899,
    stadium: 'Camp Nou',
    stadiumCity: 'Barcelona',
    capacity: 62652,
    honours: [
      { competition: 'La Liga', count: 29, type: 'league' },
      { competition: 'Copa del Rey', count: 32, type: 'cup' },
      { competition: 'UEFA Champions League', count: 5, years: ['1992', '2006', '2009', '2011', '2015'], type: 'uefa' },
    ],
    honoursNote: 'The only Spanish club to achieve the continental treble twice (2009 and 2015), and record holder of the Copa del Rey with 32 titles.',
  },
  INT: {
    founded: 1908,
    stadium: 'San Siro',
    stadiumCity: 'Milan',
    capacity: 75817,
    honours: [
      { competition: 'Serie A', count: 21, type: 'league' },
      { competition: 'Coppa Italia', count: 10, type: 'cup' },
      { competition: 'UEFA Champions League', count: 3, years: ['1964', '1965', '2010'], type: 'uefa' },
      { competition: 'Intercontinental Cup', count: 2, years: ['1964', '1965'], type: 'other' },
    ],
    honoursNote: 'The only Italian club to complete the continental treble, achieved in 2010 under Jos\u00e9 Mourinho (Serie A, Coppa Italia and Champions League).',
  },
  MCI: {
    founded: 1880,
    stadium: 'Etihad Stadium',
    stadiumCity: 'Manchester',
    capacity: 61038,
    honours: [
      { competition: 'Premier League', count: 8, type: 'league' },
      { competition: 'FA Cup', count: 7, type: 'cup' },
      { competition: 'UEFA Champions League', count: 1, years: ['2023'], type: 'uefa' },
    ],
    honoursNote: 'Won a continental treble in 2022\u201323 (Premier League, FA Cup, Champions League) and set an English record with four consecutive Premier League titles (2020\u201321 to 2023\u201324).',
  },
  LIV: {
    founded: 1892,
    stadium: 'Anfield',
    stadiumCity: 'Liverpool',
    capacity: 61276,
    honours: [
      { competition: 'League title (First Division/Premier League)', count: 20, type: 'league' },
      { competition: 'FA Cup', count: 8, type: 'cup' },
      { competition: 'League Cup', count: 10, type: 'cup' },
      { competition: 'UEFA Champions League', count: 6, years: ['1977', '1978', '1981', '1984', '2005', '2019'], type: 'uefa' },
    ],
    honoursNote: 'Holds a joint-record 20 English top-flight league titles (level with Manchester United) and an English record six European Cup/Champions League titles.',
  },
  ATM: {
    founded: 1903,
    stadium: 'Riyadh Air Metropolitano',
    stadiumCity: 'Madrid',
    capacity: 70813,
    honours: [
      { competition: 'La Liga', count: 11, type: 'league' },
      { competition: 'Copa del Rey', count: 10, type: 'cup' },
      { competition: 'UEFA Europa League', count: 3, years: ['2010', '2012', '2018'], type: 'uefa' },
    ],
    honoursNote: 'Three-time European Cup/Champions League runners-up (1974, 2014, 2016) but yet to win it.',
  },
  DOR: {
    founded: 1909,
    stadium: 'Signal Iduna Park',
    stadiumCity: 'Dortmund',
    capacity: 81365,
    honours: [
      { competition: 'German league titles', count: 8, type: 'league' },
      { competition: 'DFB-Pokal', count: 5, type: 'cup' },
      { competition: 'UEFA Champions League', count: 1, years: ['1997'], type: 'uefa' },
    ],
    honoursNote: 'Completed a continental treble in 1996\u201397 (Bundesliga, Champions League, Intercontinental Cup) and were the first German club to win a European trophy, the 1966 Cup Winners\' Cup.',
  },
  ROM: {
    founded: 1927,
    stadium: 'Stadio Olimpico',
    stadiumCity: 'Rome',
    capacity: 70634,
    honours: [
      { competition: 'Serie A', count: 3, years: ['1942', '1983', '2001'], type: 'league' },
      { competition: 'Coppa Italia', count: 9, type: 'cup' },
      { competition: 'UEFA Europa Conference League', count: 1, years: ['2022'], type: 'uefa' },
    ],
    honoursNote: 'Won the inaugural UEFA Europa Conference League in 2022 and were runners-up to Liverpool in the 1984 European Cup final, held at their own Stadio Olimpico.',
  },
  SPO: {
    founded: 1906,
    stadium: 'Est\u00e1dio Jos\u00e9 Alvalade',
    stadiumCity: 'Lisbon',
    capacity: 52707,
    honours: [
      { competition: 'Primeira Liga', count: 21, type: 'league' },
      { competition: 'Ta\u00e7a de Portugal', count: 18, type: 'cup' },
      { competition: 'UEFA Cup Winners\' Cup', count: 1, years: ['1964'], type: 'uefa' },
    ],
    honoursNote: 'The only Portuguese club to win the UEFA Cup Winners\' Cup (1963\u201364), a campaign that included a 16\u20131 win over APOEL, still a European competition record.',
  },
  POR: {
    founded: 1893,
    stadium: 'Est\u00e1dio do Drag\u00e3o',
    stadiumCity: 'Porto',
    capacity: 50033,
    honours: [
      { competition: 'Primeira Liga', count: 31, type: 'league' },
      { competition: 'Ta\u00e7a de Portugal', count: 20, type: 'cup' },
      { competition: 'UEFA Champions League / European Cup', count: 2, years: ['1987', '2004'], type: 'uefa' },
    ],
    honoursNote: 'Portugal\'s most decorated club with 88 major trophies; completed a continental treble in 2010\u201311 (league, cup and UEFA Europa League) under Andr\u00e9 Villas-Boas, then the youngest coach to win a European competition.',
  },
  BRU: {
    founded: 1891,
    stadium: 'Jan Breydel Stadium',
    stadiumCity: 'Bruges',
    capacity: 29062,
    honours: [
      { competition: 'Belgian league titles', count: 20, type: 'league' },
      { competition: 'Belgian Cup', count: 12, type: 'cup' },
      { competition: 'Belgian Super Cup', count: 18, type: 'other' },
    ],
    honoursNote: 'The only Belgian club to reach a European Cup (Champions League) final, losing 1\u20130 to Liverpool at Wembley in 1978, after also losing the 1976 UEFA Cup final to the same opponents; has never won a major UEFA trophy.',
  },
  BET: {
    founded: 1907,
    stadium: 'Estadio Benito Villamar\u00edn',
    stadiumCity: 'Seville',
    capacity: 60720,
    honours: [
      { competition: 'La Liga', count: 1, years: ['1935'], type: 'league' },
      { competition: 'Copa del Rey', count: 3, years: ['1977', '2005', '2022'], type: 'cup' },
    ],
    honoursNote: 'Reached their first-ever European final in 2025, losing the UEFA Conference League final.',
  },
  AVL: {
    founded: 1874,
    stadium: 'Villa Park',
    stadiumCity: 'Birmingham',
    capacity: 43205,
    honours: [
      { competition: 'English league titles', count: 7, type: 'league' },
      { competition: 'FA Cup', count: 7, type: 'cup' },
      { competition: 'European Cup', count: 1, years: ['1982'], type: 'uefa' },
      { competition: 'UEFA Europa League', count: 1, years: ['2026'], type: 'uefa' },
      { competition: 'UEFA Super Cup', count: 1, years: ['1982'], type: 'uefa' },
    ],
    honoursNote: 'Villa\u2019s 2025\u201326 Europa League triumph made them one of only four English clubs to have won both the European Cup and the Europa League.',
  },
  MUN: {
    founded: 1878,
    stadium: 'Old Trafford',
    stadiumCity: 'Manchester',
    capacity: 74158,
    honours: [
      { competition: 'English league titles', count: 20, type: 'league' },
      { competition: 'FA Cup', count: 13, type: 'cup' },
      { competition: 'UEFA Champions League', count: 3, years: ['1968', '1999', '2008'], type: 'uefa' },
      { competition: 'UEFA Europa League', count: 1, years: ['2017'], type: 'uefa' },
      { competition: 'UEFA Cup Winners\' Cup', count: 1, years: ['1991'], type: 'uefa' },
    ],
    honoursNote: 'United are the only English club to complete the continental treble (league, FA Cup and European Cup) in the same season, achieved in 1998\u201399.',
  },
  FEY: {
    founded: 1908,
    stadium: 'De Kuip',
    stadiumCity: 'Rotterdam',
    capacity: 47500,
    honours: [
      { competition: 'Eredivisie', count: 16, type: 'league' },
      { competition: 'KNVB Cup', count: 14, type: 'cup' },
      { competition: 'European Cup', count: 1, years: ['1970'], type: 'uefa' },
      { competition: 'UEFA Cup', count: 2, years: ['1974', '2002'], type: 'uefa' },
    ],
    honoursNote: 'Feyenoord\u2019s 2002 UEFA Cup triumph, won on home soil at De Kuip, remains the last time a Dutch club won a major European trophy.',
  },
  LIL: {
    founded: 1944,
    stadium: 'Stade Pierre-Mauroy',
    stadiumCity: 'Villeneuve-d\'Ascq',
    capacity: 50186,
    honours: [
      { competition: 'Ligue 1', count: 4, years: ['1946', '1954', '2011', '2021'], type: 'league' },
      { competition: 'Coupe de France', count: 6, years: ['1946', '1947', '1948', '1953', '1955', '2011'], type: 'cup' },
      { competition: 'UEFA Intertoto Cup', count: 1, years: ['2004'], type: 'uefa' },
    ],
    honoursNote: 'Lille\u2019s 2010\u201311 campaign produced a league-and-cup double, and their 2020\u201321 Ligue 1 title ended Paris Saint-Germain\'s bid for back-to-back championships.',
  },
  PSV: {
    founded: 1913,
    stadium: 'Philips Stadion',
    stadiumCity: 'Eindhoven',
    capacity: 35000,
    honours: [
      { competition: 'Eredivisie', count: 27, type: 'league' },
      { competition: 'KNVB Cup', count: 11, type: 'cup' },
      { competition: 'European Cup', count: 1, years: ['1988'], type: 'uefa' },
      { competition: 'UEFA Cup', count: 1, years: ['1978'], type: 'uefa' },
    ],
    honoursNote: 'PSV completed a continental treble in 1987\u201388, winning the Eredivisie, KNVB Cup and European Cup in the same season.',
  },
  RBL: {
    founded: 2009,
    stadium: 'Red Bull Arena',
    stadiumCity: 'Leipzig',
    capacity: 47069,
    honours: [
      { competition: 'DFB-Pokal', count: 2, years: ['2022', '2023'], type: 'cup' },
      { competition: 'DFL-Supercup', count: 1, years: ['2023'], type: 'other' },
    ],
    honoursNote: 'Founded only in 2009, the club rose from the fifth tier to the Bundesliga within seven years and reached the semi-finals of the 2020 UEFA Champions League.',
  },
  VIL: {
    founded: 1923,
    stadium: 'Estadio de la Cer\u00e1mica',
    stadiumCity: 'Villarreal',
    capacity: 23008,
    honours: [
      { competition: 'UEFA Europa League', count: 1, years: ['2021'], type: 'uefa' },
      { competition: 'UEFA Intertoto Cup', count: 2, years: ['2003', '2004'], type: 'uefa' },
    ],
    honoursNote: 'Nicknamed "El Submarino Amarillo", the club won their first major trophy by beating Manchester United on penalties in the 2021 UEFA Europa League final.',
  },
  SHK: {
    founded: 1936,
    stadium: 'Arena Lviv',
    stadiumCity: 'Lviv',
    capacity: 34915,
    honours: [
      { competition: 'Ukrainian Premier League', count: 16, type: 'league' },
      { competition: 'Ukrainian Cup', count: 15, type: 'cup' },
      { competition: 'UEFA Cup', count: 1, years: ['2009'], type: 'uefa' },
    ],
    honoursNote: 'The first Ukrainian club to win a UEFA trophy (2008\u201309 UEFA Cup); since 2014 the war in Ukraine has forced the club away from Donetsk, currently playing home games at Arena Lviv.',
  },
  GAL: {
    founded: 1905,
    stadium: 'Rams Park',
    stadiumCity: 'Istanbul',
    capacity: 53387,
    honours: [
      { competition: 'S\u00fcper Lig', count: 26, type: 'league' },
      { competition: 'Turkish Cup', count: 19, type: 'cup' },
      { competition: 'UEFA Cup', count: 1, years: ['2000'], type: 'uefa' },
      { competition: 'UEFA Super Cup', count: 1, years: ['2000'], type: 'uefa' },
    ],
    honoursNote: 'The only Turkish club to win a major UEFA trophy, completing a rare quadruple (league, cup, UEFA Cup and UEFA Super Cup) in the 1999\u20132000 season.',
  },
  FEN: {
    founded: 1907,
    stadium: 'S\u00fckr\u00fc Sarac\u0131o\u011flu Stadium',
    stadiumCity: 'Istanbul',
    capacity: 47911,
    honours: [
      { competition: 'S\u00fcper Lig', count: 19, type: 'league' },
      { competition: 'Turkish Cup', count: 7, type: 'cup' },
      { competition: 'Turkish Super Cup', count: 10, type: 'other' },
    ],
    honoursNote: 'Fenerbah\u00e7e counts 28 national championships when including pre-1959 titles, a tally disputed with the Turkish Football Federation, though only 19 are officially recognised in UEFA/FIFA records.',
  },
  SLA: {
    founded: 1892,
    stadium: 'Fortuna Arena',
    stadiumCity: 'Prague',
    capacity: 19370,
    honours: [
      { competition: 'Czech/Czechoslovak league titles', count: 22, type: 'league' },
      { competition: 'Czech/Czechoslovak Cup', count: 11, type: 'cup' },
      { competition: 'Mitropa Cup', count: 1, years: ['1938'], type: 'other' },
    ],
    honoursNote: 'Reached the semi-finals of the 1995\u201396 UEFA Cup and set a Czech record of 54 league matches unbeaten during their undefeated 2020\u201321 title-winning season.',
  },
  STU: {
    founded: 1893,
    stadium: 'MHPArena',
    stadiumCity: 'Stuttgart',
    capacity: 60058,
    honours: [
      { competition: 'Bundesliga', count: 5, type: 'league' },
      { competition: 'DFB-Pokal', count: 4, type: 'cup' },
    ],
    honoursNote: 'Broke an 18-year trophy drought by winning the 2024\u201325 DFB-Pokal, also finishing Bundesliga runners-up in 2023\u201324, their best league campaign since their 2007 title.',
  },
  COM: {
    founded: 1907,
    stadium: 'Stadio Giuseppe Sinigaglia',
    stadiumCity: 'Como',
    capacity: 13602,
    honours: [
      { competition: 'Serie B', count: 3, type: 'league' },
      { competition: 'Serie C', count: 4, type: 'league' },
    ],
    honoursNote: 'After bankruptcy and years in the lower divisions, Como returned to Serie A in 2024 (a 21-year absence) and secured their first-ever European qualification in 2025\u201326, reaching the 2026\u201327 UEFA Champions League.',
  },
  LEN: {
    founded: 1906,
    stadium: 'Stade Bollaert-Delelis',
    stadiumCity: 'Lens',
    capacity: 38223,
    honours: [
      { competition: 'Ligue 1', count: 1, years: ['1998'], type: 'league' },
      { competition: 'Coupe de France', count: 1, years: ['2026'], type: 'cup' },
      { competition: 'Troph\u00e9e des Champions', count: 1, years: ['2026'], type: 'other' },
    ],
    honoursNote: 'Won their maiden Coupe de France in 2026 (after three prior runner-up finishes) and claimed their first-ever Troph\u00e9e des Champions days later, beating PSG.',
  },
  SLB: {
    founded: 1919,
    stadium: 'Teheln\u00e9 pole',
    stadiumCity: 'Bratislava',
    capacity: 22500,
    honours: [
      { competition: 'Slovak league titles', count: 24, type: 'league' },
      { competition: 'Slovak Cup', count: 17, type: 'cup' },
      { competition: 'UEFA Cup Winners\' Cup', count: 1, years: ['1969'], type: 'uefa' },
    ],
    honoursNote: 'The only club from Slovakia or former Czechoslovakia to win a European trophy, beating Barcelona 3\u20132 in the 1969 Cup Winners\' Cup final.',
  },
  AEK: {
    founded: 1924,
    stadium: 'Agia Sophia Stadium',
    stadiumCity: 'Athens',
    capacity: 32500,
    honours: [
      { competition: 'Super League Greece', count: 14, type: 'league' },
      { competition: 'Greek Cup', count: 16, type: 'cup' },
    ],
    honoursNote: 'First Greek club to reach the European Cup quarter-finals (1968\u201369) and the first to qualify for the Champions League group stage (1994\u201395).',
  },
  LSK: {
    founded: 1908,
    stadium: 'Raiffeisen Arena',
    stadiumCity: 'Linz',
    capacity: 19080,
    honours: [
      { competition: 'Austrian Bundesliga', count: 2, years: ['1965', '2026'], type: 'league' },
      { competition: 'Austrian Cup', count: 2, years: ['1965', '2026'], type: 'cup' },
    ],
    honoursNote: 'First club outside Vienna to win the Austrian championship (1965); won a domestic double in 2025\u201326, their first title in 61 years, after nearly folding financially in 2013.',
  },
  VIK: {
    founded: 1899,
    stadium: 'Viking Stadion',
    stadiumCity: 'Stavanger',
    capacity: 15900,
    honours: [
      { competition: 'Eliteserien', count: 9, type: 'league' },
      { competition: 'Norwegian Cup', count: 6, years: ['1953', '1959', '1979', '1989', '2001', '2019'], type: 'cup' },
    ],
    honoursNote: 'Ended a 34-year Norwegian league title drought in 2025 and qualified for the 2026\u201327 UEFA Champions League league phase for the first time.',
  },
};
