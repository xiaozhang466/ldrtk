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
  await page.waitForTimeout(2000);
  console.log('登录完成');
  
  console.log('\n=== 测试 2: 进入路径规划页面 ===');
  await page.goto('http://localhost:3000/path-planning');
  await page.waitForTimeout(3000);
  
  const title = await page.title();
  console.log('页面标题:', title);
  
  console.log('\n=== 测试 3: 选择华农果园地图 ===');
  await page.waitForTimeout(2000);
  
  const mapSelector = await page.locator('.ant-select').first();
  if (await mapSelector.isVisible()) {
    await mapSelector.click();
    await page.waitForTimeout(1000);
    
    const huanongOption = page.locator('.ant-select-dropdown').locator('div[title*="华农"]');
    if (await huanongOption.isVisible()) {
      await huanongOption.click();
      console.log('已选择华农果园 (GPS地图)');
    } else {
      const firstOption = page.locator('.ant-select-dropdown .ant-select-item-option').first();
      if (await firstOption.isVisible()) {
        await firstOption.click();
        const selectedText = await mapSelector.textContent();
        console.log('已选择地图:', selectedText);
      }
    }
  }
  await page.waitForTimeout(5000);
  
  console.log('\n=== 测试 4: 创建新路径 ===');
  const newPathBtn = page.locator('button').filter({ hasText: /新建/ }).first();
  if (await newPathBtn.isVisible()) {
    await newPathBtn.click();
    console.log('已点击新建路径');
    await page.waitForTimeout(1000);
  }
  
  console.log('\n=== 测试 5: 截图 ===');
  await page.screenshot({ path: 'path-planning-test.png', fullPage: true });
  console.log('截图已保存到 path-planning-test.png');
  
  console.log('\n=== 控制台错误 ===');
  if (errors.length > 0) {
    errors.forEach(e => console.log('ERROR:', e));
  } else {
    console.log('无控制台错误');
  }
  
  await browser.close();
  console.log('\n测试完成');
})();
