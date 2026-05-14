import { test, expect } from '@playwright/test';

test.describe('地图操作对话框截图 - 睿程佑', () => {
  test('预览对话框截图', async ({ page }) => {
    // 登录
    await page.goto('http://192.168.3.121:3000/#/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[placeholder="用户名"]', 'admin');
    await page.fill('input[placeholder="密码"]', 'Sigu@2026');
    await page.click('button:has-text("登 录")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // 访问地图管理页面
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // 找到"睿程佑"地图的预览按钮并点击
    const table = page.locator('table.ant-table');
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    
    for (let i = 0; i < rowCount; i++) {
      const rowName = await rows.nth(i).locator('td').first().textContent();
      if (rowName && rowName.includes('睿程佑')) {
        const previewButton = rows.nth(i).locator('button[title="预览"]').first();
        await previewButton.click();
        await page.waitForTimeout(3000);
        
        // 截图 - 预览对话框
        await page.screenshot({ path: '/home/sigu/.openclaw/workspace/robot/03-preview-modal.png', fullPage: true });
        console.log('✅ 睿程佑预览对话框截图已保存');
        break;
      }
    }
  });

  test('建图对话框截图', async ({ page }) => {
    // 登录
    await page.goto('http://192.168.3.121:3000/#/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[placeholder="用户名"]', 'admin');
    await page.fill('input[placeholder="密码"]', 'Sigu@2026');
    await page.click('button:has-text("登 录")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // 访问地图管理页面
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // 找到"睿程佑"地图的建图按钮并点击
    const table = page.locator('table.ant-table');
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    
    for (let i = 0; i < rowCount; i++) {
      const rowName = await rows.nth(i).locator('td').first().textContent();
      if (rowName && rowName.includes('睿程佑')) {
        const mappingButton = rows.nth(i).locator('button[title="建图"]').first();
        await mappingButton.click();
        await page.waitForTimeout(3000);
        
        // 截图 - 建图对话框
        await page.screenshot({ path: '/home/sigu/.openclaw/workspace/robot/04-mapping-modal.png', fullPage: true });
        console.log('✅ 睿程佑建图对话框截图已保存');
        break;
      }
    }
  });
});
