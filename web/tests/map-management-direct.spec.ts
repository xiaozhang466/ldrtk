import { test, expect } from '@playwright/test';

test('地图管理页面直接访问', async ({ page }) => {
  // 先登录
  await page.goto('http://192.168.3.121:3000/#/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[placeholder="用户名"]', 'admin');
  await page.fill('input[placeholder="密码"]', 'Sigu@2026');
  await page.click('button:has-text("登 录")');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  console.log('登录后 URL:', page.url());
  
  // 直接访问地图管理页面
  console.log('访问地图管理页面...');
  await page.goto('http://192.168.3.121:3000/#/maps');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  console.log('地图管理页面 URL:', page.url());
  
  // 截图
  await page.screenshot({ path: 'test-results/map-management-page.png', fullPage: true });
  console.log('截图已保存');
  
  // 获取 HTML
  const html = await page.content();
  
  // 检查关键元素
  const checks = [
    { name: '地图管理标题', test: html.includes('地图管理') },
    { name: '新建地图', test: html.includes('新建地图') },
    { name: '表格', test: html.includes('ant-table') },
    { name: '地图列表', test: html.includes('地图列表') },
  ];
  
  console.log('\n页面检查结果:');
  for (const check of checks) {
    console.log(`  ${check.name}: ${check.test ? '✅' : '❌'}`);
  }
  
  // 只要有一个通过就算成功
  const passed = checks.some(c => c.test);
  console.log('\n总体结果:', passed ? '✅ 页面正常' : '❌ 页面异常');
  
  expect(passed).toBe(true);
});
