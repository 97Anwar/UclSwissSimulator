// New coverage: "Reset This Matchday" only clears the active matchday,
// leaving other matchdays' predictions untouched — and both reset buttons
// are real buttons (bordered, no underline), not link-styled text.
import { test, expect } from '@playwright/test';

test.describe('Matchday-scoped reset', () => {
  test('Reset This Matchday clears only the active matchday, leaving others untouched', async ({ page }) => {
    await page.goto('/');

    // Predict a score on MD1
    const md1Card = page.locator('.fixture-card').first();
    await md1Card.locator('.score-input[data-side="home"]').fill('2');
    const md1Away = md1Card.locator('.score-input[data-side="away"]');
    await md1Away.fill('0');
    await md1Away.blur();
    await page.waitForTimeout(100);

    // Switch to MD2 and predict a score there too
    await page.locator('#matchday-pills button[data-md="2"]').click();
    const md2Card = page.locator('.fixture-card').first();
    await md2Card.locator('.score-input[data-side="home"]').fill('1');
    const md2Away = md2Card.locator('.score-input[data-side="away"]');
    await md2Away.fill('1');
    await md2Away.blur();
    await page.waitForTimeout(100);

    await expect(page.locator('#matches-played-counter')).toHaveText('2 / 144 Played');

    // Reset only MD2 (currently active)
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#btn-reset-matchday').click();
    await page.waitForTimeout(200);

    // MD2's prediction is gone, but MD1's should survive
    await expect(page.locator('#matches-played-counter')).toHaveText('1 / 144 Played');
    const md2CardAfter = page.locator('.fixture-card').first();
    await expect(md2CardAfter.locator('.score-input[data-side="home"]')).toHaveValue('');

    await page.locator('#matchday-pills button[data-md="1"]').click();
    const md1CardAfter = page.locator('.fixture-card').first();
    await expect(md1CardAfter.locator('.score-input[data-side="home"]')).toHaveValue('2');
  });

  test('cancelling the Reset This Matchday dialog changes nothing', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.fixture-card').first();
    const homeInput = card.locator('.score-input[data-side="home"]');
    await homeInput.fill('3');
    await homeInput.blur();
    await page.waitForTimeout(100);

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#btn-reset-matchday').click();
    await page.waitForTimeout(150);

    await expect(card.locator('.score-input[data-side="home"]')).toHaveValue('3');
  });

  test('both reset buttons are styled as real buttons, not underlined links', async ({ page }) => {
    await page.goto('/');
    for (const id of ['#btn-reset-matchday', '#btn-reset-all']) {
      const el = page.locator(id);
      await expect(el).toBeVisible();
      const { border, textDecoration, tag } = await el.evaluate((node) => {
        const style = getComputedStyle(node);
        return { border: style.borderWidth, textDecoration: style.textDecorationLine, tag: node.tagName };
      });
      expect(tag).toBe('BUTTON');
      expect(textDecoration).not.toBe('underline');
      expect(parseFloat(border)).toBeGreaterThan(0); // has a visible border, reads as a button
    }
  });
});
