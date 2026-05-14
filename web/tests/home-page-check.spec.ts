import { test, expect } from '@playwright/test';

test('首页元素检查', async ({ page }) => {
  console.log('访问首页...');
  await page.goto('http://192.168.3.121:3000/#/login');
  await page.waitForLoadState('networkidle');
  
  // 登录
  await page.fill('input[placeholder*="用户名"]', 'admin');
  await page.fill('input[placeholder*="密码"]', 'Sigu@2026');
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  console.log('登录后 URL:', page.url());
  
  // 获取页面文本
  const bodyText = await page.locator('body').textContent();
  console.log('页面文本长度:', bodyText?.length);
  
  // 搜索关键词
  const keywords = ['地图', '导航', '建图', '系统', 'ROS', 'GPS'];
  for (const keyword of keywords) {
    const found = bodyText?.includes(keyword);
    console.log(`包含"${keyword}":`, found);
  }
  
  // 检查按钮
  const buttons = await page.locator('button').allTextContents();
  console.log('按钮文本:', buttons.slice(0, 10));
  
  // 截图
  await page.screenshot({ path: 'test-results/home-page.png', fullPage: true });
  console.log('截图已保存');
});
