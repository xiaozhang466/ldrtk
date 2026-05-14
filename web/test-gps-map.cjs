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
  
  console.log('=== 测试: 华农果园 GPS 地图路径规划 ===');
  
  // 登录
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'Sigu@2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('登录完成');
  
  // 导航到路径规划页面
  await page.goto('http://localhost:3000/#/path-planning?map=华农果园');
  await page.waitForTimeout(5000);
  
  console.log('当前URL:', page.url());
  
  // 检查页面内容
  const body = await page.locator('body').textContent();
  console.log('页面包含GPS:', body.includes('GPS') || body.includes('gps'));
  console.log('页面包含华农:', body.includes('华农'));
  
  // 等待地图加载
  await page.waitForTimeout(3000);
  
  // 截图
  await page.screenshot({ path: 'gps-map-test.png', fullPage: true });
  console.log('截图已保存');
  
  // 检查页面是否有 Cesium 相关内容
  const cesiumExists = await page.locator('canvas').count() > 0;
  console.log('Canvas 元素数量:', cesiumExists);
  
  console.log('\n=== 控制台错误 ===');
  if (errors.length > 0) {
    errors.forEach(e => console.log('ERROR:', e));
  } else {
    console.log('无控制台错误');
  }
  
  await browser.close();
  console.log('\n测试完成');
})();
