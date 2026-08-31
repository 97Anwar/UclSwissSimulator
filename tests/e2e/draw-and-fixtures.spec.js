// Covers CSV rows: T01, T06, T07
import { test, expect } from '@playwright/test';

test.describe('Draw generation', () => {
  test('T01: fresh load shows 144 fixtures across 8 matchdays with the hypothetical banner', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#mode-banner')).toContainText(/hypothetical/i);

    // 8 matchday pills should exist
    const pills = page.locator('#matchday-pills button');
    await expect(pills).toHaveCount(8);

    // MD1 should show 18 fixture cards
    await expect(page.locator('#fixtures-list .fixture-card')).toHaveCount(18);

    // Total across all 8 matchdays should be 144 — click through each pill and sum
    let total = 0;
    for (let md = 1; md <= 8; md++) {
      await page.locator(`#matchday-pills button[data-md="${md}"]`).click();
      total += await page.locator('#fixtures-list .fixture-card').count();
    }
    expect(total).toBe(144);
  });

  test('T06: regenerating the draw clears predictions and keeps hypothetical mode', async ({ page }) => {
    await page.goto('/');

    const firstInput = page.locator('.score-input[data-side="home"]').first();
    await firstInput.fill('3');
    await expect(firstInput).toHaveValue('3');

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#btn-regenerate-draw').click();
    await page.waitForTimeout(300); // allow re-render

    await expect(page.locator('#mode-banner')).toContainText(/hypothetical/i);
    await expect(page.locator('#fixtures-list .fixture-card')).toHaveCount(18);
    // Every score input on the (new) MD1 should be empty — old predictions
    // don't carry over since the fixture IDs changed with the new draw
    const values = await page.locator('.score-input').allInnerTexts();
    const inputs = await page.locator('.score-input').all();
    for (const input of inputs) {
      await expect(input).toHaveValue('');
    }
  });

  test('T07: cancelling the New Draw confirm dialog leaves fixtures unchanged', async ({ page }) => {
    await page.goto('/');

    const firstInput = page.locator('.score-input[data-side="home"]').first();
    await firstInput.fill('2');
    const fixtureIdBefore = await page.locator('.fixture-card').first().innerText();

    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#btn-regenerate-draw').click();
    await page.waitForTimeout(200);

    await expect(firstInput).toHaveValue('2');
    const fixtureIdAfter = await page.locator('.fixture-card').first().innerText();
    expect(fixtureIdAfter).toBe(fixtureIdBefore);
  });
});
