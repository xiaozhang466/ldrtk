import { test, expect } from '@playwright/test';

test('首页检查', async ({ page }) => {
  await page.goto('http://192.168.3.121:3000/#/login');
  await page.waitForLoadState('networkidle');
  
  // 登录
  await page.fill('input[placeholder="用户名"]', 'admin');
  await page.fill('input[placeholder="密码"]', 'Sigu@2026');
  await page.click('button:has-text("登 录")');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  console.log('登录后 URL:', page.url());
  
  // 获取所有链接
  const links = await page.locator('a').allTextContents();
  console.log('链接文本:', links.slice(0, 20));
  
  // 获取所有菜单项
  const menuItems = await page.locator('.ant-menu-item, .ant-menu-submenu').allTextContents();
  console.log('菜单项:', menuItems);
  
  // 截图
  await page.screenshot({ path: 'test-results/home-page-after-login.png', fullPage: true });
  console.log('截图已保存');
});
