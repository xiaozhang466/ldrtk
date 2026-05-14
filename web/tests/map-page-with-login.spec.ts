import { test, expect } from '@playwright/test';

test('地图管理页面测试（带登录）', async ({ page }) => {
  console.log('1. 访问登录页面...');
  await page.goto('http://192.168.3.121:3000/#/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  console.log('2. 输入用户名和密码...');
  await page.fill('input[placeholder*="用户名"], input[type="text"]', 'admin');
  await page.fill('input[placeholder*="密码"], input[type="password"]', 'Sigu@2026');
  await page.waitForTimeout(500);
  
  console.log('3. 点击登录按钮...');
  await page.click('button:has-text("登录"), button:has-text("登 录")');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  console.log('4. 当前 URL:', page.url());
  
  console.log('5. 访问地图管理页面...');
  await page.goto('http://192.168.3.121:3000/#/maps');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  // 截图
  await page.screenshot({ path: 'test-results/map-page-logged-in.png', fullPage: true });
  console.log('6. 截图已保存');
  
  // 检查页面内容
  const content = await page.content();
  console.log('页面内容长度:', content.length);
  
  // 检查是否有地图管理相关元素
  const hasMapText = content.includes('地图');
  console.log('是否包含"地图"文字:', hasMapText);
  
  // 检查是否有新建地图按钮
  const hasCreateButton = content.includes('新建地图') || content.includes('新建');
  console.log('是否包含"新建"按钮:', hasCreateButton);
  
  // 检查是否有表格
  const hasTable = content.includes('ant-table');
  console.log('是否包含表格:', hasTable);
  
  expect(hasMapText).toBe(true);
});
