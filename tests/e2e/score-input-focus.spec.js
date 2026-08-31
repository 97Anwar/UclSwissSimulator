// Regression test for a real bug: every keystroke in a score input
// triggered a full innerHTML rebuild of the fixtures list, destroying and
// recreating the very input being typed into. The browser lost focus on it
// immediately after the first keystroke, so any further typing or use of
// the native up/down spinner went nowhere — this reads as "I can't enter
// any value at all." Fixed by preserving and restoring focus across the
// rebuild (see renderFixturesSection() in app.js).
import { test, expect } from '@playwright/test';

test.describe('Score input focus (regression)', () => {
  test('typing a two-digit score registers both digits, not just the first', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('.score-input[data-side="home"]').first();

    await input.click();
    await input.pressSequentially('12', { delay: 50 }); // types "1" then "2" as two separate keystrokes/input events, exactly the failure mode
    await page.waitForTimeout(150);

    await expect(input).toHaveValue('12');
  });

  test('the input keeps focus after each keystroke, not just after the first', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('.score-input[data-side="home"]').first();

    await input.click();
    await input.type('1', { delay: 50 });
    await page.waitForTimeout(100);
    await expect(input).toBeFocused(); // this is the actual bug: focus was lost right here, before the second digit

    await input.type('3', { delay: 50 });
    await page.waitForTimeout(100);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('13');
  });

  test('clicking the native spinner up-arrow repeatedly increments the value without losing focus', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('.score-input[data-side="home"]').first();
    await input.click();

    // Simulate the spinner via keyboard (ArrowUp on a focused number input
    // behaves the same as clicking the native up-arrow control)
    await input.press('ArrowUp');
    await page.waitForTimeout(100);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('1');

    await input.press('ArrowUp');
    await page.waitForTimeout(100);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('2');
  });

  test('the away-side field for the same fixture is unaffected while editing the home field', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.fixture-card').first();
    const home = card.locator('.score-input[data-side="home"]');
    const away = card.locator('.score-input[data-side="away"]');

    await home.click();
    await home.pressSequentially('2', { delay: 50 });
    await page.waitForTimeout(100);

    await away.click();
    await away.pressSequentially('1', { delay: 50 });
    await page.waitForTimeout(100);

    await expect(home).toHaveValue('2');
    await expect(away).toHaveValue('1');
  });

  test('empty score fields show a "0" placeholder hint, not a dash, without it counting as a real 0-0 result', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('.score-input[data-side="home"]').first();
    await expect(input).toHaveAttribute('placeholder', '0');
    await expect(input).toHaveValue(''); // placeholder is a visual hint only — the actual value stays empty until the user types
    await expect(page.locator('#matches-played-counter')).toHaveText('0 / 144 Played');
  });

  test('standings do not recalculate while actively typing, only once the field is left', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('.score-input[data-side="home"]').first();

    await input.click();
    await input.pressSequentially('4', { delay: 50 });
    await page.waitForTimeout(150);
    // Typing alone must not trigger recalculation — this is deliberate
    // (matches the requested "type freely, then click away to calculate"
    // behavior) and also happens to be what avoids the DOM-rebuild-vs-
    // native-typing conflict that caused the original bug.
    await expect(page.locator('#matches-played-counter')).toHaveText('0 / 144 Played');

    await input.blur();
    await page.waitForTimeout(150);
    // Still 0 played — only the home side has a value, the match isn't
    // fully scored yet. Confirms blur alone doesn't over-eagerly count a
    // half-entered match either.
    await expect(page.locator('#matches-played-counter')).toHaveText('0 / 144 Played');

    const awayInput = page.locator('.score-input[data-side="away"]').first();
    await awayInput.fill('1');
    await awayInput.blur();
    await page.waitForTimeout(150);
    await expect(page.locator('#matches-played-counter')).toHaveText('1 / 144 Played');
  });
});
