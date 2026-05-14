import { test, expect } from '@playwright/test';

test('登录页面检查', async ({ page }) => {
  console.log('访问登录页面...');
  await page.goto('http://192.168.3.121:3000/#/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // 截图
  await page.screenshot({ path: 'test-results/login-page.png', fullPage: true });
  console.log('登录页面截图已保存');
  
  // 获取所有输入框
  const inputs = await page.locator('input').all();
  console.log('输入框数量:', inputs.length);
  
  for (let i = 0; i < inputs.length; i++) {
    const placeholder = await inputs[i].getAttribute('placeholder');
    const type = await inputs[i].getAttribute('type');
    console.log(`输入框${i}: type=${type}, placeholder=${placeholder}`);
  }
  
  // 获取所有按钮
  const buttons = await page.locator('button').all();
  console.log('按钮数量:', buttons.length);
  
  for (let i = 0; i < buttons.length; i++) {
    const text = await buttons[i].textContent();
    console.log(`按钮${i}: ${text?.trim()}`);
  }
  
  // 获取页面文本
  const bodyText = await page.locator('body').textContent();
  console.log('页面文本长度:', bodyText?.length);
  
  // 检查是否包含关键词
  const keywords = ['登录', '用户名', '密码', 'admin'];
  for (const keyword of keywords) {
    const found = bodyText?.includes(keyword);
    console.log(`包含"${keyword}":`, found);
  }
});
