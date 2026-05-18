#!/usr/bin/env node
/**
 * 前端自主测试工具
 * 功能：
 * 1. 自动检测页面错误
 * 2. 验证页面元素
 * 3. 测试用户交互流程
 * 4. 截图和日志输出
 * 
 * 使用方法：
 *   node scripts/autotest.js                    # 运行所有测试
 *   node scripts/autotest.js login              # 只测试登录
 *   node scripts/autotest.js maps               # 只测试地图管理
 *   node scripts/autotest.js screenshot         # 截取所有页面截图
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-results', 'autotest');

// 确保目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 共享浏览器实例
let browser = null;
let page = null;

async function init() {
  console.log('🧪 初始化浏览器...');
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  
  // 监听错误
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`❌ Console Error: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    console.log(`❌ Page Error: ${err.message}`);
  });
  
  return { browser, page };
}

async function cleanup() {
  if (browser) {
    await browser.close();
    console.log('🔒 浏览器已关闭');
  }
}

// 测试登录流程
async function testLogin() {
  console.log('\n📋 测试: 登录流程');
  
  await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'networkidle', timeout: 15000 });
  
  // 检查登录表单
  const usernameInput = await page.locator('input[placeholder=用户名]').count();
  const passwordInput = await page.locator('input[placeholder=密码]').count();
  const submitBtn = await page.locator('button[type=submit]').count();
  
  console.log(`  - 用户名输入框: ${usernameInput > 0 ? '✅' : '❌'}`);
  console.log(`  - 密码输入框: ${passwordInput > 0 ? '✅' : '❌'}`);
  console.log(`  - 提交按钮: ${submitBtn > 0 ? '✅' : '❌'}`);
  
  // 执行登录
  await page.fill('input[placeholder=用户名]', 'admin');
  await page.fill('input[placeholder=密码]', 'Sigu@2026');
  await page.click('button[type=submit]');
  await page.waitForTimeout(3000);
  
  // 验证登录成功
  const url = page.url();
  const loggedIn = url.includes('/#') && !url.includes('/login');
  console.log(`  - 登录成功: ${loggedIn ? '✅' : '❌'}`);
  
  await page.screenshot({ path: `${SCREENSHOT_DIR}/login.png`, fullPage: true });
  
  return loggedIn;
}

// 测试地图管理页面
async function testMaps() {
  console.log('\n📋 测试: 地图管理页面');
  
  await page.goto(`${BASE_URL}/#/maps`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  
  // 检查页面元素
  const hasMapList = await page.locator('text=地图列表').count() > 0;
  const hasNewBtn = await page.locator('button').filter({ hasText: '新' }).count() > 0;
  const hasRefreshBtn = await page.locator('button').filter({ hasText: '刷' }).count() > 0;
  
  console.log(`  - 地图列表: ${hasMapList ? '✅' : '❌'}`);
  console.log(`  - 新建按钮: ${hasNewBtn ? '✅' : '❌'}`);
  console.log(`  - 刷新按钮: ${hasRefreshBtn ? '✅' : '❌'}`);
  
  // 获取地图数量
  const mapItems = await page.locator('.ant-table-row').count();
  console.log(`  - 地图数据: ${mapItems} 条`);
  
  await page.screenshot({ path: `${SCREENSHOT_DIR}/maps.png`, fullPage: true });
  
  return hasMapList;
}

// 测试其他页面
async function testOtherPages() {
  console.log('\n📋 测试: 其他页面');
  
  const pages = [
    { path: '/#/', name: '首页' },
    { path: '/#/settings', name: '设置' },
    { path: '/#/nav', name: '导航' },
    { path: '/#/maps', name: '地图管理' },
  ];
  
  for (const p of pages) {
    try {
      await page.goto(`${BASE_URL}${p.path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
      
      const title = await page.title();
      console.log(`  - ${p.name}: ✅ (${title})`);
      
      await page.screenshot({ path: `${SCREENSHOT_DIR}/${p.name}.png`, fullPage: true });
    } catch (e) {
      console.log(`  - ${p.name}: ❌ (${e.message})`);
    }
  }
}

// 全面错误检测
async function checkErrors() {
  console.log('\n🔍 错误检测:');
  
  const pages = [
    '/#/login',
    '/#/',
    '/#/maps',
    '/#/settings',
    '/#/nav',
    '/#/maps',
  ];
  
  const errors = [];
  
  for (const p of pages) {
    const pageErrors = [];
    
    page.on('pageerror', err => pageErrors.push(err.message));
    
    await page.goto(`${BASE_URL}${p}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);
    
    if (pageErrors.length > 0) {
      errors.push({ page: p, errors: pageErrors });
    }
  }
  
  if (errors.length === 0) {
    console.log('  ✅ 所有页面无 JS 错误');
  } else {
    console.log(`  ❌ 发现 ${errors.length} 个页面有错误:`);
    errors.forEach(e => {
      console.log(`    - ${e.page}: ${e.errors.join(', ')}`);
    });
  }
  
  return errors;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  try {
    await init();
    
    switch (command) {
      case 'login':
        await testLogin();
        break;
      case 'maps':
        await testLogin(); // 先登录
        await testMaps();
        break;
      case 'screenshot':
        await testLogin();
        await testOtherPages();
        break;
      case 'errors':
        await checkErrors();
        break;
      default:
        console.log('🧪 运行所有测试...\n');
        await testLogin();
        await testMaps();
        await testOtherPages();
        await checkErrors();
    }
    
    console.log('\n✅ 测试完成！');
    console.log(`📁 截图保存在: ${SCREENSHOT_DIR}`);
    
  } catch (e) {
    console.error('❌ 测试失败:', e);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();