// Covers CSV rows: T21, T23, T24, T25, T26, T27, T28, T30
// Mocks the data/real-results.json fetch via Playwright route interception
// instead of editing the actual file — keeps this fully automated and
// self-contained, matching the "or mocked" alternative noted in the CSV.
import { test, expect } from '@playwright/test';

function mockRealResults({ finished = true, scheduled = true } = {}) {
  const fixtures = [];
  if (finished) {
    fixtures.push({
      externalId: 1001, matchday: 1, homeId: 'PSG', awayId: 'BAY',
      homeScore: 2, awayScore: 1, status: 'FINISHED', utcDate: '2026-09-16T19:00:00Z',
    });
  }
  if (scheduled) {
    fixtures.push({
      externalId: 1002, matchday: 1, homeId: 'ARS', awayId: 'RMA',
      homeScore: null, awayScore: null, status: 'SCHEDULED', utcDate: '2026-09-30T19:00:00Z',
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    competition: 'CL', source: 'mock-test-data', fixtureCount: fixtures.length, fixtures,
  };
}

async function withMockedRealData(page, mockData) {
  await page.route('**/data/real-results.json', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockData) });
  });
}

test.describe('Real data mode', () => {
  test('T23: landing page shows the real draw/results banner when mock data is present', async ({ page }) => {
    await withMockedRealData(page, mockRealResults());
    await page.goto('/');
    await expect(page.locator('#mode-banner')).toContainText(/real official draw/i);
  });

  test('T24: a FINISHED real match shows the real score with an OFFICIAL badge', async ({ page }) => {
    await withMockedRealData(page, mockRealResults());
    await page.goto('/');

    const psgCard = page.locator('.fixture-card', { hasText: 'Paris Saint-Germain' });
    await expect(psgCard).toContainText('OFFICIAL');
    await expect(psgCard.locator('.score-input[data-side="home"]')).toHaveValue('2');
    await expect(psgCard.locator('.score-input[data-side="away"]')).toHaveValue('1');
  });

  test('T25: a SCHEDULED real match shows blank, not 0-0, and does not count as played', async ({ page }) => {
    await withMockedRealData(page, mockRealResults());
    await page.goto('/');

    const arsCard = page.locator('.fixture-card', { hasText: 'Arsenal' });
    await expect(arsCard.locator('.score-input[data-side="home"]')).toHaveValue('');
    await expect(arsCard.locator('.score-input[data-side="away"]')).toHaveValue('');
    // Only the 1 FINISHED match should count as played
    await expect(page.locator('#matches-played-counter')).toHaveText('1 / 144 Played');
  });

  test('T26: overriding a scheduled real match shows a PREDICTED badge and counts in standings', async ({ page }) => {
    await withMockedRealData(page, mockRealResults());
    await page.goto('/');

    const arsCard = page.locator('.fixture-card', { hasText: 'Arsenal' });
    await arsCard.locator('.score-input[data-side="home"]').fill('1');
    const arsAway = arsCard.locator('.score-input[data-side="away"]');
    await arsAway.fill('1');
    await arsAway.blur();
    await page.waitForTimeout(100);

    await expect(arsCard).toContainText('PREDICTED');
    await expect(page.locator('#matches-played-counter')).toHaveText('2 / 144 Played');
  });

  test('T27: a stale prediction is dropped once the real match becomes FINISHED', async ({ page }) => {
    // First load: match is SCHEDULED, user predicts a score
    await withMockedRealData(page, mockRealResults());
    await page.goto('/');
    const arsCard = page.locator('.fixture-card', { hasText: 'Arsenal' });
    await arsCard.locator('.score-input[data-side="home"]').fill('3');
    const arsAway = arsCard.locator('.score-input[data-side="away"]');
    await arsAway.fill('3');
    await arsAway.blur(); // ensure the change (and its localStorage write) lands before the reload below
    await page.waitForTimeout(100);
    await expect(arsCard.locator('.score-input[data-side="home"]')).toHaveValue('3');

    // Simulate the real-world match finishing with a DIFFERENT score, then reload
    await page.unroute('**/data/real-results.json');
    const finishedNow = mockRealResults();
    finishedNow.fixtures[1] = { ...finishedNow.fixtures[1], status: 'FINISHED', homeScore: 0, awayScore: 0 };
    await withMockedRealData(page, finishedNow);
    await page.reload();

    const arsCardAfter = page.locator('.fixture-card', { hasText: 'Arsenal' });
    await expect(arsCardAfter).toContainText('OFFICIAL');
    await expect(arsCardAfter.locator('.score-input[data-side="home"]')).toHaveValue('0'); // real result, not the stale 3-3 prediction
    await expect(arsCardAfter.locator('.score-input[data-side="away"]')).toHaveValue('0');
  });

  test('T28: empty real-results.json falls back to hypothetical mode without errors', async ({ page }) => {
    await withMockedRealData(page, { generatedAt: null, fixtures: [] });
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    await page.goto('/');

    await expect(page.locator('#mode-banner')).toContainText(/hasn't been announced/i);
    await expect(page.locator('.fixture-card')).toHaveCount(18); // hypothetical draw loaded normally
    expect(consoleErrors).toEqual([]);
  });

  test('T21: Reset in real mode reverts an overridden match to the real result, not blank', async ({ page }) => {
    await withMockedRealData(page, mockRealResults());
    await page.goto('/');

    const psgCard = page.locator('.fixture-card', { hasText: 'Paris Saint-Germain' });
    const psgHome = psgCard.locator('.score-input[data-side="home"]');
    await psgHome.fill('9'); // override the real 2-1
    await psgHome.blur();
    await page.waitForTimeout(100);
    await expect(psgCard).toContainText('PREDICTED');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#btn-reset-all').click();
    await page.waitForTimeout(200);

    const psgCardAfter = page.locator('.fixture-card', { hasText: 'Paris Saint-Germain' });
    await expect(psgCardAfter).toContainText('OFFICIAL');
    await expect(psgCardAfter.locator('.score-input[data-side="home"]')).toHaveValue('2');
    await expect(psgCardAfter.locator('.score-input[data-side="away"]')).toHaveValue('1');
  });

  test('T30: switching from hypothetical to real mode via the banner button works', async ({ page }) => {
    await withMockedRealData(page, mockRealResults());
    // Force hypothetical mode even though real data is available
    await page.addInitScript(() => {
      localStorage.setItem('ucl_sim_v5_mode', 'hypothetical');
    });
    await page.goto('/');
    await expect(page.locator('#mode-banner')).toContainText(/hypothetical/i);

    await page.locator('#btn-switch-to-real').click();
    await page.waitForTimeout(200);

    await expect(page.locator('#mode-banner')).toContainText(/real official draw/i);
    await expect(page.locator('.fixture-card', { hasText: 'Paris Saint-Germain' })).toContainText('OFFICIAL');
  });
});
