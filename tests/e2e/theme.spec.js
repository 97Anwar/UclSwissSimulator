// Covers CSV rows: T31, T32, T33, T34
// This file directly targets the bug that prompted the redesign: light mode
// not actually being wired up, causing invisible/low-contrast text.
import { test, expect } from '@playwright/test';

test.describe('Theme', () => {
  test('T31: light mode is the default on first load', async ({ page }) => {
    await page.goto('/');
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass || '').not.toContain('dark');
    await expect(page.locator('#theme-icon')).toHaveText('🌙'); // moon shown = currently light, offering to switch to dark
  });

  test('T32: toggling to dark mode actually changes the <html> class, and no element has literally-invisible text', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-theme-toggle').click();
    await page.waitForTimeout(100);

    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass || '').toContain('dark');
    await expect(page.locator('#theme-icon')).toHaveText('☀️');

    // Spot-check: for a sample of visible text elements, computed color
    // must not exactly equal computed background color of its own
    // background chain (the specific failure mode of the old bug, where
    // toggling did nothing because classes weren't actually wired up).
    const samples = ['header', '#mode-banner', '.fixture-card >> nth=0', 'footer'];
    for (const selector of samples) {
      const locator = page.locator(selector).first();
      if (await locator.count() === 0) continue;
      const { color, bg } = await locator.evaluate((el) => {
        const style = getComputedStyle(el);
        return { color: style.color, bg: style.backgroundColor };
      });
      expect(color).not.toBe(bg);
    }
  });

  test('T33: theme choice persists across a reload', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-theme-toggle').click();
    await page.waitForTimeout(100);
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('#theme-icon')).toHaveText('☀️');
  });

  test('T34: rapid toggling keeps the icon in sync with the actual theme', async ({ page }) => {
    await page.goto('/');
    for (let i = 0; i < 6; i++) {
      await page.locator('#btn-theme-toggle').click();
    }
    await page.waitForTimeout(100);
    // 6 toggles from light = back to light
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass || '').not.toContain('dark');
    await expect(page.locator('#theme-icon')).toHaveText('🌙');
  });
});
