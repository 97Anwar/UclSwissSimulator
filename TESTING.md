# Running the test suite in VS Code (with Copilot)

Two layers, matching the CSV test plan:

- **Unit tests** (`tests/unit/`) — pure logic (draw engine, tiebreakers), no browser, runs in ~9 seconds via Node's built-in test runner. No extra install needed beyond Node itself.
- **E2E tests** (`tests/e2e/`) — actual browser behavior (clicks, theme, export, real-data mode) via Playwright. This is the "automation mode" with a visual Testing sidebar, one-click run/debug per test, and failure traces.

Every test file has a comment at the top mapping it back to CSV row IDs (T01, T02, ...) so you can trace any result back to the original scenario.

## 1. One-time setup

In the VS Code terminal, from the project folder:

```bash
npm install
npx playwright install chromium
```

Then install the **Playwright Test for VSCode** extension (`ms-playwright.playwright` in the Extensions panel — search "Playwright"). This is what turns the CSV scenarios into a clickable UI instead of terminal output.

## 2. Running unit tests

```bash
npm run test:unit
```

That's it — no extension required, ~9 seconds, prints a pass/fail summary for all 14 assertions covering T01–T05, T13–T18, T51, T52.

## 3. Running e2e tests (the "automation mode" part)

Once the Playwright extension is installed, a **flask/beaker icon** appears in VS Code's left sidebar (Testing view). Click it:

- Every `.spec.js` file and every `test(...)` inside it is listed by name — you'll see T01, T06, T07, T08... etc. directly, matching the CSV.
- **Green play button** next to any test, file, or the whole suite — runs it right there, no terminal needed.
- **Green play button with a bug icon** — runs it in debug mode with the ability to step through and inspect the page live.
- A **failed test** shows a red X; click it to see the exact assertion that failed, and VS Code will offer a **trace viewer** — a full timeline scrubber showing exactly what the browser did leading up to the failure (DOM snapshots, network, console).

Or from the terminal:

```bash
npm run test:e2e          # headless, all tests
npm run test:e2e:ui       # opens Playwright's interactive UI mode — same idea as the VS Code sidebar, watch mode, time-travel debugging
```

The config (`playwright.config.js`) auto-starts a local static server on port 4173 before running and shuts it down after — you don't need to manually run `npm run dev` first.

## 4. Where Copilot actually helps here

- **Extending coverage**: open a CSV row that isn't automated yet (e.g. T29, T39–T42, T45 — noted as manual/partially-manual below) next to an existing spec file, and ask Copilot Chat: *"Following the pattern in tests/e2e/theme.spec.js, write a Playwright test for CSV row T41 (platform share buttons download the image and open a new tab)."* Copilot can see the existing file's conventions (route mocking style, selector patterns, the CSV-row-comment convention) and follow them.
- **Diagnosing a red test**: right-click a failed test in the Testing sidebar → there's usually a "Copilot: Explain" or you can paste the failure output (or open the trace) into Copilot Chat and ask *"why is this Playwright assertion failing?"* — it can read the stack trace, the selector, and the relevant app.js/renderer.js code in the same workspace.
- **Filling the two manual-editing scenarios** (T29's fetch-script run, T52's teams.js edit) — ask Copilot to draft the temporary broken `teams.js` variant or the mock API payload for you as a scratch file, run it, then revert.

## 5. Testing the static page generator (matchday & team pages)

`scripts/generate-static-pages.mjs` writes real files to disk (matchday-N.html, teams/*.html, sitemap.xml), so it's a manual/scripted check rather than part of `npm test` — running it as a side effect of every test run would litter the repo. It's also designed to no-op cleanly until real fixture data exists, which is most of what you're actually verifying before Aug 27.

**Check the no-op path (this is what you'll actually see until the real draw):**

```bash
node scripts/generate-static-pages.mjs
```

Expect: `No real fixtures yet ... skipping static page generation. This is not an error.` — and no new files.

**Check the real-generation path, using mock data** (this is exactly how I verified it while building it — it caught a real bug: `computeStandings` wasn't attaching a `rank` field, which showed up as "undefined" on generated team pages until fixed):

```bash
node -e "
(async () => {
  const {TEAMS_DATA} = await import('./js/data/teams.js');
  const {generateSwissFixtures} = await import('./js/engine/draw.js');
  const {simulateMatchScores} = await import('./js/engine/simulator.js');
  const fs = await import('fs');
  const drawn = generateSwissFixtures(TEAMS_DATA);
  simulateMatchScores(drawn);
  const fixtures = drawn.map((f, i) => ({
    externalId: 5000 + i, matchday: f.matchday, homeId: f.homeId, awayId: f.awayId,
    homeScore: i % 2 === 0 ? f.homeScore : null,
    awayScore: i % 2 === 0 ? f.awayScore : null,
    status: i % 2 === 0 ? 'FINISHED' : 'SCHEDULED',
    utcDate: '2026-09-16T19:00:00Z',
  }));
  fs.writeFileSync('./data/real-results.json', JSON.stringify({generatedAt: new Date().toISOString(), competition:'CL', source:'mock-test', fixtureCount: fixtures.length, fixtures}, null, 2));
})();
"
node scripts/generate-static-pages.mjs
```

Expect: `Generated 8 matchday pages.`, `Generated 36 team pages.`, `Regenerated sitemap.xml.` Open a couple of the generated `matchday-*.html` / `teams/*.html` files directly to eyeball them.

**Always clean up the mock data afterward** — don't ship generated files built from fake scores:

```bash
rm -f matchday-*.html && rm -rf teams/
git checkout -- data/real-results.json   # or manually reset it to the {fixtures: []} placeholder
```

## 6. What's NOT automated here, and why

| CSV rows | Why manual |
|---|---|
| T39, T40, T42 | Require the real Web Share API + a real mobile OS share sheet — not something a headless/desktop browser can genuinely exercise. Test these on an actual phone. |
| T45 | Needs the real Aug 27 draw data in `teams.js` (`confirmed: true` on every team) — can't be faked without defeating the point of the test. |
| T29 | Is a Node script test against the *real* football-data.org API response shape — best run manually once you have a real API key, per the README's setup steps. |
| T02 (subjective UI-polish judgment from your original ask, not in the CSV) | "Does this look professional" isn't a pass/fail assertion — that's still your call. |

Everything else in the 52-row CSV is covered by one of the two automated layers above.
