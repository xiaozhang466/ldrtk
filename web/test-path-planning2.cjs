const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  console.log('=== 测试 1: 登录 ===');
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'Sigu@2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('登录完成');
  
  console.log('\n=== 测试 2: 直接导航到路径规划页面 ===');
  await page.goto('http://localhost:3000/path-planning');
  await page.waitForTimeout(5000);
  
  console.log('\n=== 测试 3: 检查页面元素 ===');
  const url = page.url();
  console.log('当前URL:', url);
  
  // 等待 Cesium 地球加载
  const cesiumCanvas = await page.locator('canvas').first();
  await cesiumCanvas.waitFor({ state: 'visible', timeout: 10000 }).catch(() => console.log('Cesium canvas 未找到'));
  
  // 检查是否有地图选择器
  const selects = await page.locator('.ant-select').count();
  console.log('下拉选择器数量:', selects);
  
  // 截图
  await page.screenshot({ path: 'path-planning-test2.png', fullPage: true });
  console.log('截图已保存');
  
  console.log('\n=== 控制台错误 ===');
  if (errors.length > 0) {
    errors.forEach(e => console.log('ERROR:', e));
  } else {
    console.log('无控制台错误');
  }
  
  await browser.close();
  console.log('\n测试完成');
})();
