const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'Sigu@2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  await page.goto('http://localhost:3000/path-planning');
  await page.waitForTimeout(5000);
  
  // 获取页面 HTML 内容
  const body = await page.locator('body').innerHTML();
  console.log('页面内容长度:', body.length);
  console.log('前500字符:', body.substring(0, 500));
  
  console.log('\n=== Console logs ===');
  logs.forEach(l => console.log(l));
  
  await browser.close();
})();
