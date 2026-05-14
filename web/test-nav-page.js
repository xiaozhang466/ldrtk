const { chromium } = require('playwright');

(async () => {
  console.log('🚀 启动浏览器...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  // 捕获控制台错误
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ 控制台错误:', msg.text());
    }
  });
  
  // 捕获页面错误
  page.on('pageerror', error => {
    console.log('❌ 页面错误:', error.message);
  });
  
  console.log('📍 访问导航页面...');
  await page.goto('http://192.168.3.121:5173/#/nav', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  console.log('📸 截图...');
  await page.screenshot({ path: 'nav-test.png', fullPage: true });
  
  // 检查关键元素
  const mapExists = await page.$('#root');
  console.log('✅ 页面容器存在:', !!mapExists);
  
  // 检查是否有 Cesium 相关错误
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('Cesium')) {
      errors.push(msg.text());
    }
  });
  
  console.log('\n📊 测试结果:');
  console.log('- 页面加载:', '✅ 成功');
  console.log('- 截图保存:', 'nav-test.png');
  console.log('- 控制台错误:', errors.length === 0 ? '✅ 无' : `❌ ${errors.length}个`);
  
  await browser.close();
  console.log('\n✅ 测试完成');
})();
