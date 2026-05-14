import { test, expect } from '@playwright/test';

test.describe('地图操作对话框截图', () => {
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
    
    // 找到第一个有 PCD 的地图，点击预览按钮
    const previewButtons = page.locator('button[title="预览"]');
    const count = await previewButtons.count();
    
    if (count > 0) {
      await previewButtons.first().click();
      await page.waitForTimeout(2000);
      
      // 截图 - 预览对话框
      await page.screenshot({ path: '/home/sigu/.openclaw/workspace/robot/02-preview-modal.png', fullPage: true });
      console.log('✅ 预览对话框截图已保存');
    } else {
      console.log('⚠️ 没有可用的预览按钮');
      // 截图当前页面
      await page.screenshot({ path: '/home/sigu/.openclaw/workspace/robot/02-no-preview.png', fullPage: true });
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
    
    // 点击第一个建图按钮
    const mappingButtons = page.locator('button[title="建图"]');
    await mappingButtons.first().click();
    await page.waitForTimeout(2000);
    
    // 截图 - 建图对话框
    await page.screenshot({ path: '/home/sigu/.openclaw/workspace/robot/03-mapping-modal.png', fullPage: true });
    console.log('✅ 建图对话框截图已保存');
  });

  test('规划对话框截图', async ({ page }) => {
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
    
    // 点击第一个规划按钮
    const planningButtons = page.locator('button[title="路径规划"]');
    await planningButtons.first().click();
    await page.waitForTimeout(2000);
    
    // 截图 - 规划对话框
    await page.screenshot({ path: '/home/sigu/.openclaw/workspace/robot/04-planning-modal.png', fullPage: true });
    console.log('✅ 规划对话框截图已保存');
  });
});
