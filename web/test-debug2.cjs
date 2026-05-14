const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  
  // Login
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'Sigu@2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('Logged in');
  
  // Navigate to path planning with map param
  await page.goto('http://localhost:3000/#/path-planning?map=华农果园');
  await page.waitForTimeout(5000);
  
  // Check what's in the page
  const content = await page.locator('body').textContent();
  console.log('\n=== Page content check ===');
  console.log('Contains GPS error:', content.includes('未设置 GPS'));
  console.log('Contains 加载中:', content.includes('加载中'));
  console.log('Contains 地图管理:', content.includes('地图管理'));
  
  // Check for canvas
  const canvases = await page.locator('canvas').count();
  console.log('Canvas count:', canvases);
  
  // Print relevant logs
  console.log('\n=== Relevant console logs ===');
  logs.filter(l => l.includes('map') || l.includes('Map') || l.includes('GPS') || l.includes('config'))
      .forEach(l => console.log(l));
  
  // Screenshot
  await page.screenshot({ path: 'debug-test2.png', fullPage: true });
  console.log('\nScreenshot saved');
  
  await browser.close();
})();
