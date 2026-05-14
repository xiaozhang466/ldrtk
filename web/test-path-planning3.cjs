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
  
  console.log('\n=== 测试 2: 使用 HashRouter 导航到路径规划页面 ===');
  await page.goto('http://localhost:3000/#/path-planning');
  await page.waitForTimeout(5000);
  
  console.log('当前URL:', page.url());
  
  // 等待页面加载
  const content = await page.locator('body').textContent();
  console.log('页面包含路径规划:', content.includes('路径规划'));
  console.log('页面包含地图管理:', content.includes('地图'));
  
  // 截图
  await page.screenshot({ path: 'path-planning-test3.png', fullPage: true });
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
