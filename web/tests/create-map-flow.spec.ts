import { test, expect } from '@playwright/test';

test('新建地图流程测试', async ({ page }) => {
  console.log('=== 测试：新建地图流程 ===');
  
  // 1. 登录
  console.log('1. 登录...');
  await page.goto('http://192.168.3.121:3000/#/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[placeholder="用户名"]', 'admin');
  await page.fill('input[placeholder="密码"]', 'Sigu@2026');
  await page.click('button:has-text("登 录")');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // 2. 访问地图管理页面
  console.log('2. 访问地图管理页面...');
  await page.goto('http://192.168.3.121:3000/#/maps');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // 3. 点击"新建地图"按钮
  console.log('3. 点击"新建地图"按钮...');
  const createButton = page.locator('button:has-text("新建地图")').first();
  await createButton.click();
  await page.waitForTimeout(1000);
  
  // 4. 检查类型选择弹窗是否显示
  console.log('4. 检查类型选择弹窗...');
  const modalTitle = page.locator('.ant-modal-title');
  const titleText = await modalTitle.textContent();
  console.log('弹窗标题:', titleText);
  expect(titleText).toContain('选择地图类型');
  
  // 5. 点击 GPS 地图卡片
  console.log('5. 点击 GPS 地图卡片...');
  const gpsCard = page.locator('text=GPS 地图').first();
  await gpsCard.click();
  await page.waitForTimeout(1000);
  
  // 6. 检查表单是否显示
  console.log('6. 检查 GPS 地图表单...');
  const formTitle = page.locator('.ant-modal-title').first();
  const formTitleText = await formTitle.textContent();
  console.log('表单标题:', formTitleText);
  expect(formTitleText).toContain('GPS 地图');
  
  // 7. 检查表单字段
  console.log('7. 检查表单字段...');
  const nameInput = page.locator('input[placeholder*="地图名称"]');
  await expect(nameInput).toBeVisible();
  
  const latInput = page.locator('input[placeholder*="纬度"]');
  await expect(latInput).toBeVisible();
  
  const lonInput = page.locator('input[placeholder*="经度"]');
  await expect(lonInput).toBeVisible();
  
  console.log('✅ 所有测试通过！');
});
