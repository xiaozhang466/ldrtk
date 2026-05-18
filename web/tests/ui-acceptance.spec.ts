import { test, expect } from '@playwright/test';

test.describe('耘小智 01 UI 验收测试', () => {
  
  test('首页应该正常加载', async ({ page }) => {
    await page.goto('http://192.168.3.121:3000');
    await expect(page).toHaveTitle(/耘小智/);
  });

  test('地图管理页面应该正常加载', async ({ page }) => {
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('路径规划页面应该正常加载', async ({ page }) => {
    await page.goto('http://192.168.3.121:3000/#/path-planning');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});
