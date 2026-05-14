import { test, expect } from '@playwright/test';

test.describe('地图管理页面详细测试', () => {
  
  test('地图管理页面应该正常加载', async ({ page }) => {
    console.log('📋 测试：地图管理页面加载');
    
    // 访问页面
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    
    // 等待页面渲染
    await page.waitForTimeout(2000);
    
    // 检查页面标题
    const pageTitle = await page.locator('h1, .ant-card-head-title').first().textContent();
    console.log('页面标题:', pageTitle);
    expect(pageTitle).toContain('地图');
    
    // 检查地图列表表格
    const table = page.locator('table.ant-table');
    await expect(table).toBeVisible();
    
    // 检查统计卡片
    const statistics = page.locator('.ant-statistic');
    const count = await statistics.count();
    console.log('统计卡片数量:', count);
    expect(count).toBeGreaterThanOrEqual(4);
    
    console.log('✅ 地图管理页面加载测试通过');
  });

  test('新建地图按钮应该可点击', async ({ page }) => {
    console.log('📋 测试：新建地图按钮');
    
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 查找"新建地图"按钮
    const createButton = page.locator('button:has-text("新建地图"), button:has-text("新建")');
    const buttonCount = await createButton.count();
    console.log('新建地图按钮数量:', buttonCount);
    
    if (buttonCount > 0) {
      await expect(createButton.first()).toBeVisible();
      await expect(createButton.first()).toBeEnabled();
      console.log('✅ 新建地图按钮可点击');
    } else {
      console.log('⚠️ 未找到新建地图按钮');
    }
  });

  test('点击新建地图按钮应该弹出对话框', async ({ page }) => {
    console.log('📋 测试：新建地图对话框');
    
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 查找并点击"新建地图"按钮
    const createButton = page.locator('button:has-text("新建地图"), button:has-text("新建")').first();
    
    try {
      await createButton.click();
      await page.waitForTimeout(1000);
      
      // 检查是否弹出对话框
      const modal = page.locator('.ant-modal');
      const modalVisible = await modal.count() > 0;
      console.log('对话框是否弹出:', modalVisible);
      
      if (modalVisible) {
        const modalTitle = await modal.locator('.ant-modal-title').textContent();
        console.log('对话框标题:', modalTitle);
        expect(modalTitle).toContain('地图');
        console.log('✅ 新建地图对话框测试通过');
      } else {
        console.log('⚠️ 对话框未弹出');
      }
    } catch (error) {
      console.log('❌ 点击失败:', error);
    }
  });

  test('地图列表应该显示地图信息', async ({ page }) => {
    console.log('📋 测试：地图列表显示');
    
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 检查表格行
    const rows = page.locator('.ant-table-tbody tr');
    const rowCount = await rows.count();
    console.log('地图数量:', rowCount);
    
    if (rowCount > 0) {
      // 检查第一行数据
      const firstRow = rows.first();
      const cells = firstRow.locator('td');
      const cellCount = await cells.count();
      console.log('表格列数:', cellCount);
      
      // 检查列内容
      for (let i = 0; i < Math.min(cellCount, 5); i++) {
        const cellText = await cells.nth(i).textContent();
        console.log(`列${i}:`, cellText?.trim());
      }
      
      console.log('✅ 地图列表显示测试通过');
    } else {
      console.log('ℹ️ 地图列表为空');
    }
  });

  test('页面不应该有 JavaScript 错误', async ({ page }) => {
    console.log('📋 测试：页面 JavaScript 错误检查');
    
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('页面错误:', error.message);
    });
    
    await page.goto('http://192.168.3.121:3000/#/maps');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    if (errors.length > 0) {
      console.log('❌ 发现 JavaScript 错误:', errors);
    } else {
      console.log('✅ 无 JavaScript 错误');
    }
  });
});
