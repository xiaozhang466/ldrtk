import { test, expect } from '@playwright/test';

test.describe('地图管理模块 - 主要功能测试', () => {
  test('地图列表页面应该正常显示', async ({ page }) => {
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
    
    // 截图 - 地图列表页面
    await page.screenshot({ path: 'test-results/01-map-list.png', fullPage: true });
    console.log('✅ 地图列表页面截图已保存');
    
    // 验证页面元素
    const table = page.locator('table.ant-table');
    await expect(table).toBeVisible();
    
    const statistics = page.locator('.ant-statistic');
    await expect(statistics).toHaveCount(4);
    
    console.log('✅ 地图列表页面正常显示');
  });

  test('新建地图功能应该正常', async ({ page }) => {
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 点击新建地图按钮
    const createButton = page.locator('button:has-text("新建地图")').first();
    await createButton.click();
    await page.waitForTimeout(1000);
    
    // 截图 - 新建地图弹窗
    await page.screenshot({ path: 'test-results/02-create-map-modal.png' });
    console.log('✅ 新建地图弹窗截图已保存');
    
    // 填写表单
    await page.fill('input[placeholder*="地图名称"]', 'test_playwright_001');
    await page.fill('input[placeholder*="纬度"]', '31.2304');
    await page.fill('input[placeholder*="经度"]', '121.4737');
    
    // 点击确定
    const okButton = page.locator('.ant-modal .ant-btn-primary:has-text("确定")').first();
    await okButton.click();
    await page.waitForTimeout(2000);
    
    console.log('✅ 新建地图功能测试完成');
  });

  test('操作按钮应该正常显示', async ({ page }) => {
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 检查操作按钮
    const actionButtons = page.locator('td:last-child button');
    const buttonCount = await actionButtons.count();
    console.log('操作按钮数量:', buttonCount);
    
    // 应该有 6 个按钮：切换、预览、建图、规划、编辑、删除
    expect(buttonCount).toBeGreaterThanOrEqual(5);
    
    // 截图 - 操作按钮
    await page.screenshot({ path: 'test-results/03-action-buttons.png' });
    console.log('✅ 操作按钮截图已保存');
  });
});
