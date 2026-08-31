// Covers CSV rows: T49, T50
import { test, expect } from '@playwright/test';

test.describe('Mobile / responsive', () => {
  test('T49: narrow viewport shows the fixtures/standings tab toggle and switches sections', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone-ish width, below lg breakpoint
    await page.goto('/');

    await expect(page.locator('#tab-btn-fixtures')).toBeVisible();
    await expect(page.locator('#tab-btn-table')).toBeVisible();
    await expect(page.locator('#section-fixtures')).toBeVisible();
    await expect(page.locator('#section-standings')).toBeHidden();

    await page.locator('#tab-btn-table').click();
    await expect(page.locator('#section-standings')).toBeVisible();
    await expect(page.locator('#section-fixtures')).toBeHidden();
  });

  test('T50: wide desktop viewport hides the mobile tab toggle and shows both sections', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // The mobile toggler wrapper uses `lg:hidden` — at this width it should not be visible
    const mobileToggler = page.locator('#tab-btn-fixtures');
    await expect(mobileToggler).toBeHidden();

    await expect(page.locator('#section-fixtures')).toBeVisible();
    await expect(page.locator('#section-standings')).toBeVisible();
  });
});
