# UCL Swiss Simulator — 2026/27

A static, zero-backend simulator for the UEFA Champions League 36-team
Swiss-format league phase. Predict all 144 matches yourself, or hit
"Simulate," and watch the standings update live using the real points and
tiebreaker rules.

No build step, no server, no database. Just static files.

## Testing

See **[TESTING.md](./TESTING.md)** for the full guide to running the
automated test suite in VS Code (unit tests via Node's built-in runner,
e2e tests via Playwright with a clickable Testing sidebar). Quick start:

```bash
npm install && npx playwright install chromium
npm run test:unit   # ~9s, pure logic (draw engine, tiebreakers)
npm run test:e2e    # browser tests (UI, theme, export, real-data mode)
```

The `tests/ucl-simulator-test-plan.csv`-style scenario list this suite is
built from covers 52 positive/negative cases; each spec file's header
comment maps back to the scenario IDs it covers.

## Design system (v2)

The UI was rebuilt around an actual design decision instead of default
"dark dashboard" styling: a paper/pitch palette (deep green `#0B6E4F`,
trophy gold `#C9A227`, warm off-white `#F6F7F2`) with Oswald for headers
(stadium-signage feel) and Inter for body/data. **Light mode is the
default** — dark mode is opt-in via the header toggle and persists in
localStorage. Standings use a left-edge colored bar per qualification
zone (the FotMob/SofaScore convention) instead of full pastel row fills.

Every themed element uses Tailwind's `dark:` variant directly — the
previous version defined CSS custom properties for light/dark but never
actually wired them to the Tailwind utility classes in use, which is why
toggling to light mode did nothing visually. That class of bug shouldn't
recur here since there's now exactly one theming mechanism, not two
unconnected ones.

**Testing note:** I don't have browser/network access in this
environment to install a headless browser and screenshot-verify the
result, so this was verified by auditing every color class used against
the Tailwind config (confirming no undefined-shade fallbacks) and tracing
every element's light/dark pairing by hand, plus running the export-card
generator through a non-DOM test to confirm it outputs all 36 rows with
no clipping. A real look in an actual browser (both themes) is still
worth doing before you trust it fully — flag anything that looks off.

## The export/share fix

The old export button screenshotted the live, scrollable standings panel
directly — so it only captured whatever was currently scrolled into view
(hence "half cut," missing top/bottom rows), and `backdrop-blur` (used in
the old glass-card look) renders incorrectly in html2canvas, a known
limitation. The new export renders a dedicated, always-complete,
non-scrolling card off-screen (`#export-render-target`, solid colors, no
blur) specifically for the image, independent of whatever's currently
visible or scrolled in the live UI.

Share buttons are honest about what's actually possible: most platforms'
share-intent URLs (X, WhatsApp, Reddit, Facebook) only accept text and a
link, not an arbitrary image — there's no way to attach the exported PNG
directly without a server to host it publicly first, which would break
the $0/serverless goal. Where the browser supports the Web Share API
(most mobile browsers), the "Share Image" button attaches the real file
to the OS share sheet. Everywhere else, clicking a platform button
downloads the image and opens that platform's compose window, with a
note to attach the image manually.

## Running it locally

Double-click `index.html`, or for a cleaner local URL:

```
npx serve .
```

## Deploying for $0/month

Any static host works. Free tiers that fit this project:
- **Cloudflare Pages** — free, generous bandwidth, fastest to set up
- **GitHub Pages** — free, ties naturally to a GitHub repo
- **Netlify** (free tier) — free, has built-in form handling if ever needed

Just point any of them at this folder. There's no build command needed —
"framework: none" / "publish directory: ." is all that's required.

The site is registered at **swissformatsim.com** (Namecheap), with
`index.html`, `robots.txt`, `sitemap.xml`, `js/ui/share.js`, and
`scripts/generate-static-pages.mjs` all already pointing at it — no
placeholder domain left to swap before deploy.

## Team data status

`js/data/teams.js` is the single source of truth for teams, pots, and
associations. **As of this update, all 36 teams are confirmed** — the
real league-phase draw was held August 27, 2026 in Monaco, and every pot
assignment here is cross-checked against UEFA.com plus several
independent outlets (they all agreed, which is the bar this was held to).
`DATA_IS_FINAL` is `true`, so the "provisional teams" banner no longer
shows.

**What's still pending:** the specific matchday-by-matchday fixture
schedule (which of Matchday 1–8 each pairing falls on) wasn't yet
published as of this update — UEFA's own league-phase page listed it as
still "TBA." Nothing needs to change here for that: the existing sync
pipeline (`scripts/fetch-results.mjs`) will pick up real fixtures with
matchday numbers the moment football-data.org has them, same as always.

**Next season**, when pots reset: replace `js/data/teams.js` following
the same shape, sourcing from UEFA's official pot announcement and
cross-checking 2-3 independent outlets before publishing — that's what
caught zero discrepancies this time, and is worth repeating rather than
trusting a single source.

## Real scores & standings (auto-updating, $0, no server)

The landing page shows the **real official draw and results** by default
once they're available — not a random hypothetical one. Enter a score on
any match to override it with your own "what if" prediction; the rest
stay real. **Reset clears your predictions and reverts to the real
scorecard** — it does not wipe everything blank.

This works without a live backend:

1. **`scripts/fetch-results.mjs`** is a small Node script that pulls the
   current Champions League fixture list and results from
   [football-data.org](https://www.football-data.org)'s free tier (free
   forever, no card, covers the Champions League — the best fit of the
   free options; nothing with truly no rate limit covers UCL specifically).
2. **`.github/workflows/update-scores.yml`** runs that script every 6
   hours on GitHub's free Actions runners, and commits the result to
   `data/real-results.json` if anything changed.
3. Because that commit lands in your repo, your static host (Cloudflare
   Pages / GitHub Pages / Netlify) **auto-redeploys** — no server, no
   polling, no cost.
4. The frontend just does `fetch('data/real-results.json')` on load —
   a plain static file, same as any other asset.

### One-time setup (you'll need to do this, not me — it needs your own account)

1. Get a free API key: https://www.football-data.org/client/register
   (no credit card).
2. In your GitHub repo: **Settings → Secrets and variables → Actions →
   New repository secret**, name it `FOOTBALL_DATA_TOKEN`, paste the key.
3. Push this project to GitHub, enable Actions if prompted. The workflow
   will run automatically on schedule, and you can also trigger it
   manually from the **Actions** tab any time (**Run workflow** button)
   to test it immediately rather than waiting for the next 6-hour tick.
4. Until football-data.org has the matchday schedule, the script will
   correctly write an empty fixture list — that's expected, not a bug.
   The site falls back to a clearly-labeled hypothetical draw until real
   fixtures with matchday numbers exist.

### How the real vs. predicted vs. hypothetical modes fit together

- **Real mode** (default once real fixtures exist): fixtures list *is*
  the actual UEFA draw. Each match shows the real result (amber
  "OFFICIAL" tag) until you type a score, which marks it "PREDICTED"
  (cyan) and overrides it for standings purposes only in your browser.
- **Hypothetical mode**: our own draw engine (`js/engine/draw.js`)
  generates a random constraint-respecting draw for exploring "what if
  the draw had gone differently" scenarios. Clearly labeled as
  hypothetical in the banner, and switching into it doesn't touch your
  real-mode predictions.
- If a team name from the API doesn't match anything in
  `js/data/team-aliases.js`, the fetch script logs it clearly and skips
  that fixture rather than guessing — check the Actions log output if a
  match ever seems to be missing.

## Matchday & team pages (SEO growth layer)

Once real fixture data exists, the same GitHub Action that syncs results
also runs `scripts/generate-static-pages.mjs`, which generates:

- **`matchday-1.html` through `matchday-8.html`** — a dedicated, real,
  crawlable URL per matchday with that matchday's fixtures pre-rendered
  server-side (not just client-JS-rendered), each with its own
  title/meta/canonical. This exists because a competitor analysis showed
  the market leader in this niche gets ~5x more pageviews-per-visit than
  a bare single-page tool, largely because its features live on separate
  URLs — more real page loads, more ad impressions, more individually
  indexable pages.
- **`teams/<id>.html`** — one page per team (36 total) showing their
  current rank, points, zone (R16/play-off/eliminated), full fixture
  list, and a short auto-generated scenario summary.

**The scenario text is deliberately conservative.** It states things
directly computable from the standings — current rank, points, zone,
next opponent — not permutation claims like "a win guarantees top 8,"
which would require correctly simulating every remaining combination.
Publishing an incorrect qualification claim would actively hurt trust in
the tool, so this stays factual rather than clever.

**These pages only generate once real fixtures with matchday numbers
exist** — the pot draw (Aug 27) is done, but the matchday-by-matchday
schedule was still pending publication as of this update. Hypothetical-
mode draws are random per visitor/session, so pre-rendering one for
search engines to index would be actively misleading. Until real
fixtures land, the generator logs why it's skipping and exits cleanly —
see `TESTING.md` for how to test this with mock data without shipping
fake results.

`sitemap.xml` is regenerated by the same script every run, so newly
created matchday/team pages are always reflected in it automatically.

## Architecture

- `js/data/teams.js` — team/pot/association data (edit this once a year)
- `js/data/team-aliases.js` — maps external API team-name spellings to
  our internal ids
- `js/engine/draw.js` — generates a real constraint-respecting Swiss draw
  (2 opponents per pot, max 2 per association, 4 home/4 away, one match
  per matchday) via backtracking search — used only in hypothetical mode
- `js/engine/simulator.js` — Poisson-based random score generation for
  the "Simulate" buttons
- `js/engine/standings.js` — points table with the full 6-criteria UEFA
  tiebreaker chain, computed from each fixture's *effective* score
- `js/engine/effective-score.js` — the single source of truth for
  "predicted overrides real, real overrides unplayed" per fixture
- `js/ui/renderer.js` — DOM rendering for fixtures (real/predicted
  styling) and standings
- `js/app.js` — wiring: mode switching, event handlers, localStorage
  persistence, init
- `scripts/fetch-results.mjs` — CI-only script that fetches real results
  (never runs in the browser — the API key must never ship client-side)
- `scripts/generate-static-pages.mjs` — CI-only script that generates
  matchday-N.html, teams/*.html, and sitemap.xml from real data
- `data/real-results.json` — the static data file the frontend reads;
  kept up to date by the GitHub Action

## Known limitations (documented, not silent)

- The draw engine does not model UEFA's political/conflict pairing
  restrictions — only pot, association-count, home/away, and matchday
  constraints.
- Standings tiebreakers stop at away wins (criterion 6). The real
  competition's next tiebreaker — a head-to-head mini-league among level
  teams — isn't implemented; teams still level after criterion 6 are
  ranked by team ID as a stable fallback.
- football-data.org's free tier has delayed (not truly live, second-by-
  second) scores. Combined with the 6-hour sync schedule, this is a
  "checks in periodically" tool, not a live scoreboard. That trade-off is
  what keeps hosting at $0 with no server to run — tightening the
  schedule (e.g. hourly) is a one-line change to the cron in
  `.github/workflows/update-scores.yml` if you want fresher data, still
  well within the free rate limit.
- If a real match's teams don't resolve via `team-aliases.js`, that
  fixture is skipped (logged, not guessed) until the alias table is
  updated — a rare one-time fix, not a recurring task.

