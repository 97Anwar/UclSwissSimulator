// Covers CSV rows: T43, T44
import { test, expect } from '@playwright/test';

test.describe('Provisional data', () => {
  test('T43: TBD teams show a badge in the fixtures list', async ({ page }) => {
    await page.goto('/');
    // Walk all 8 matchdays looking for at least one TBD badge — provisional
    // teams (TBD1-TBD7) are randomly distributed by the draw, so they may
    // not all appear on matchday 1.
    let found = false;
    for (let md = 1; md <= 8 && !found; md++) {
      await page.locator(`#matchday-pills button[data-md="${md}"]`).click();
      const badgeCount = await page.locator('#fixtures-list').getByText('TBD').count();
      if (badgeCount > 0) found = true;
    }
    expect(found).toBe(true);
  });

  test('T43b: TBD teams show a badge in the standings table', async ({ page }) => {
    await page.goto('/');
    const badgeCount = await page.locator('#standings-rows').getByText('TBD').count();
    expect(badgeCount).toBeGreaterThan(0);
  });

  test('T44: data freshness banner is visible while teams are provisional', async ({ page }) => {
    await page.goto('/');
    const banner = page.locator('#data-freshness-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/provisional/i);
  });
});
