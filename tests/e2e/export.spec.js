// Covers CSV rows: T35, T36, T38
// PNG pixel content can't be meaningfully asserted in an automated test, so
// these verify the underlying export-render-target DOM (what html2canvas
// actually rasterizes) instead — the same DOM state that was previously
// clipped/scrolled is now built fresh and complete every time.
import { test, expect } from '@playwright/test';

test.describe('Export', () => {
  test('T35 & T36: export target contains all 36 teams with no overflow/scroll clipping or blur, regardless of on-screen scroll position', async ({ page }) => {
    await page.goto('/');

    // Scroll the live standings panel to the middle before exporting —
    // this is exactly what triggered the old bug (only visible rows
    // exported). The new export target is built independently of this.
    const standingsPanel = page.locator('#standings-rows');
    await standingsPanel.evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export-img').click();
    await downloadPromise;

    const exportTarget = page.locator('#export-render-target');
    const teamNameCount = await exportTarget.evaluate((el) => {
      // Count row blocks by counting the points column's bold-800 divs,
      // a reasonably unique structural marker in the export card.
      return el.querySelectorAll('div[style*="font-weight:800"]').length;
    });
    expect(teamNameCount).toBe(36);

    // No clipping mechanism should be present anywhere in the export subtree
    const hasClipping = await exportTarget.evaluate((el) => {
      const all = [el, ...el.querySelectorAll('*')];
      return all.some((node) => {
        const style = getComputedStyle(node);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
      });
    });
    expect(hasClipping).toBe(false);

    // No backdrop-filter (known to render incorrectly in html2canvas)
    const hasBackdropBlur = await exportTarget.evaluate((el) => {
      const all = [el, ...el.querySelectorAll('*')];
      return all.some((node) => {
        const style = getComputedStyle(node);
        return style.backdropFilter && style.backdropFilter !== 'none';
      });
    });
    expect(hasBackdropBlur).toBe(false);
  });

  test('T38: export still succeeds with zero matches played', async ({ page }) => {
    await page.goto('/');
    // Fresh load already has 0 played — just export immediately
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export-img').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('ucl-swiss-standings.png');
  });
});
