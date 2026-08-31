// Covers CSV rows: T46, T47, T48
import { test, expect } from '@playwright/test';

test.describe('Persistence', () => {
  test('T46: predictions survive a reload', async ({ page }) => {
    await page.goto('/');
    const firstCard = page.locator('.fixture-card').first();
    await firstCard.locator('.score-input[data-side="home"]').fill('3');
    const away = firstCard.locator('.score-input[data-side="away"]');
    await away.fill('2');
    await away.blur(); // ensure the 'change' handler (and its localStorage write) completes before we navigate away
    await page.waitForTimeout(150);

    await page.reload();
    await page.waitForTimeout(150);

    const reloadedCard = page.locator('.fixture-card').first();
    await expect(reloadedCard.locator('.score-input[data-side="home"]')).toHaveValue('3');
    await expect(reloadedCard.locator('.score-input[data-side="away"]')).toHaveValue('2');
    await expect(page.locator('#matches-played-counter')).toHaveText('1 / 144 Played');
  });

  test('T47: corrupted localStorage does not crash the app', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('ucl_sim_v5_hypothetical', '{not valid json!!!');
    });
    await page.reload();

    // App should recover with a fresh, valid draw rather than a blank/broken page
    await expect(page.locator('.fixture-card')).toHaveCount(18);
    await expect(page.locator('#draw-error-banner')).toBeHidden();
  });

  test('T48: a fresh browser context has no leftover predictions (data is local-only)', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto('http://localhost:4173/');
    await pageA.locator('.fixture-card').first().locator('.score-input[data-side="home"]').fill('5');
    await pageA.waitForTimeout(100);
    await contextA.close();

    const contextB = await browser.newContext(); // fresh, isolated storage
    const pageB = await contextB.newPage();
    await pageB.goto('http://localhost:4173/');
    await expect(pageB.locator('#matches-played-counter')).toHaveText('0 / 144 Played');
    await contextB.close();
  });
});
