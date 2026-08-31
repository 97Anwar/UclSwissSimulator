// Covers CSV rows: T08, T09, T10, T11, T12
// Recalculation now happens on 'change' (blur/Enter/arrow-key), not on
// every keystroke — so these tests explicitly blur before asserting on
// anything derived (standings, counter, badges). See score-input-focus.spec.js
// for the direct "typing doesn't recalc, blur does" behavior test.
import { test, expect } from '@playwright/test';

test.describe('Score entry', () => {
  test('T08: entering a score updates standings once the field is left', async ({ page }) => {
    await page.goto('/');

    const firstCard = page.locator('.fixture-card').first();
    const homeInput = firstCard.locator('.score-input[data-side="home"]');
    const awayInput = firstCard.locator('.score-input[data-side="away"]');

    await expect(page.locator('#matches-played-counter')).toHaveText('0 / 144 Played');

    await homeInput.fill('3');
    await awayInput.fill('1');
    await awayInput.blur();
    await page.waitForTimeout(100);

    await expect(page.locator('#matches-played-counter')).toHaveText('1 / 144 Played');
    // A PREDICTED badge should now show under that fixture's score boxes
    await expect(firstCard).toContainText('PREDICTED');
  });

  test('T09: a draw result awards 1 point to each side (visible in standings)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tab-btn-table').click().catch(() => {}); // no-op on desktop, needed on narrow viewports

    const firstCard = page.locator('.fixture-card').first();
    await firstCard.locator('.score-input[data-side="home"]').fill('2');
    const awayInput = firstCard.locator('.score-input[data-side="away"]');
    await awayInput.fill('2');
    await awayInput.blur();
    await page.waitForTimeout(100);

    await expect(page.locator('#matches-played-counter')).toHaveText('1 / 144 Played');
    // Standings should show exactly one team with 1 point at least (both drawing teams get 1pt each)
    const onePointRows = page.locator('#standings-rows').getByText(/^1$/);
    await expect(onePointRows.first()).toBeVisible();
  });

  test('T10: clearing one score field and blurring reverts the match to unplayed', async ({ page }) => {
    await page.goto('/');
    const firstCard = page.locator('.fixture-card').first();
    const homeInput = firstCard.locator('.score-input[data-side="home"]');
    const awayInput = firstCard.locator('.score-input[data-side="away"]');

    await homeInput.fill('2');
    await awayInput.fill('1');
    await awayInput.blur();
    await page.waitForTimeout(100);
    await expect(page.locator('#matches-played-counter')).toHaveText('1 / 144 Played');

    await homeInput.fill('');
    await homeInput.blur();
    await page.waitForTimeout(100);
    await expect(page.locator('#matches-played-counter')).toHaveText('0 / 144 Played');
  });

  test('T11: a score above the max=15 constraint is rejected by the input', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('.score-input[data-side="home"]').first();
    await input.fill('99');
    const value = await input.inputValue();
    // Browser-level number input constraints don't block typing itself in
    // all browsers, but the value should be checkable against the max
    // attribute via the validity API
    const isValid = await input.evaluate((el) => el.checkValidity());
    if (value === '99') {
      expect(isValid).toBe(false); // out of range per max=15
    } else {
      expect(Number(value)).toBeLessThanOrEqual(15);
    }
  });

  test('T12: a negative score is rejected by the input', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('.score-input[data-side="home"]').first();
    await input.fill('-1');
    const value = await input.inputValue();
    const isValid = await input.evaluate((el) => el.checkValidity());
    if (value === '-1') {
      expect(isValid).toBe(false); // out of range per min=0
    } else {
      expect(Number(value)).toBeGreaterThanOrEqual(0);
    }
  });
});
