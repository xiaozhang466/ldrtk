const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  
  // Track network requests
  const failedRequests = [];
  page.on('response', response => {
    if (!response.ok() && response.status() !== 401) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });
  
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'Sigu@2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  await page.goto('http://localhost:3000/#/path-planning?map=华农果园');
  await page.waitForTimeout(5000);
  
  console.log('=== Failed requests ===');
  failedRequests.forEach(r => console.log(r));
  
  console.log('\n=== Console logs ===');
  logs.forEach(l => console.log(l));
  
  await page.screenshot({ path: 'debug-test3.png', fullPage: true });
  await browser.close();
})();
