import { test, expect } from '@playwright/test';

test('地图管理页面简单测试', async ({ page }) => {
  console.log('访问地图管理页面...');
  
  await page.goto('http://192.168.3.121:3000/#/maps');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  // 截图
  await page.screenshot({ path: 'test-results/map-page.png', fullPage: true });
  console.log('截图已保存');
  
  // 检查页面 URL
  const url = page.url();
  console.log('当前 URL:', url);
  
  // 检查页面内容
  const content = await page.content();
  console.log('页面内容长度:', content.length);
  
  // 检查是否有地图管理相关元素
  const hasMapText = content.includes('地图');
  console.log('是否包含"地图"文字:', hasMapText);
  
  // 检查控制台错误
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  
  console.log('JavaScript 错误数量:', errors.length);
  if (errors.length > 0) {
    console.log('错误详情:', errors);
  }
});
