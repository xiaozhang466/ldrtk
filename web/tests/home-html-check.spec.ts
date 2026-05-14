import { test } from '@playwright/test';

test('首页 HTML 结构', async ({ page }) => {
  await page.goto('http://192.168.3.121:3000/#/login');
  await page.waitForLoadState('networkidle');
  
  // 登录
  await page.fill('input[placeholder="用户名"]', 'admin');
  await page.fill('input[placeholder="密码"]', 'Sigu@2026');
  await page.click('button:has-text("登 录")');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  // 获取 HTML
  const html = await page.content();
  
  // 检查关键元素
  const checks = [
    { name: '地图管理', test: html.includes('地图') },
    { name: '导航', test: html.includes('导航') },
    { name: 'ant-menu', test: html.includes('ant-menu') },
    { name: 'Home 组件', test: html.includes('Home') || html.includes('home') },
  ];
  
  console.log('HTML 检查结果:');
  for (const check of checks) {
    console.log(`  ${check.name}: ${check.test ? '✅' : '❌'}`);
  }
  
  // 保存 HTML
  const fs = require('fs');
  fs.writeFileSync('test-results/home-page.html', html);
  console.log('HTML 已保存到 test-results/home-page.html');
});
