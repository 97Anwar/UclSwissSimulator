// Covers CSV rows: T20, T22
import { test, expect } from '@playwright/test';

test.describe('Reset (hypothetical mode)', () => {
  test('T20: Reset clears all scores back to blank and 0 played', async ({ page }) => {
    await page.goto('/');

    const cards = page.locator('.fixture-card');
    const count = await cards.count();
    for (let i = 0; i < Math.min(3, count); i++) {
      await cards.nth(i).locator('.score-input[data-side="home"]').fill('2');
      const away = cards.nth(i).locator('.score-input[data-side="away"]');
      await away.fill('1');
      await away.blur();
    }
    await page.waitForTimeout(100);
    await expect(page.locator('#matches-played-counter')).toHaveText('3 / 144 Played');

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#btn-reset-all').click();
    await page.waitForTimeout(200);

    await expect(page.locator('#matches-played-counter')).toHaveText('0 / 144 Played');
    for (let i = 0; i < Math.min(3, count); i++) {
      await expect(cards.nth(i).locator('.score-input[data-side="home"]')).toHaveValue('');
    }
  });

  test('T22: cancelling the Reset confirm dialog leaves scores untouched', async ({ page }) => {
    await page.goto('/');

    const firstCard = page.locator('.fixture-card').first();
    await firstCard.locator('.score-input[data-side="home"]').fill('4');
    const away = firstCard.locator('.score-input[data-side="away"]');
    await away.fill('0');
    await away.blur();
    await page.waitForTimeout(100);

    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#btn-reset-all').click();
    await page.waitForTimeout(200);

    await expect(firstCard.locator('.score-input[data-side="home"]')).toHaveValue('4');
    await expect(page.locator('#matches-played-counter')).toHaveText('1 / 144 Played');
  });
});
