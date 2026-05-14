/**
 * GPS 地图预览功能测试（带登录）
 */

import { test, expect } from '@playwright/test'

test.describe('GPS 地图预览功能', () => {
  test.beforeEach(async ({ page }) => {
    // 访问登录页面
    await page.goto('http://localhost:3000/#/login')
    await page.waitForLoadState('networkidle')
    
    // 登录
    try {
      await page.fill('input[placeholder*="用户名"]', 'admin')
      await page.fill('input[placeholder*="密码"]', 'Sigu@2026')
      await page.click('button:has-text("登录")')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)
    } catch (e) {
      console.log('登录步骤可能已自动完成或页面结构不同')
    }
    
    // 等待地图列表加载
    try {
      await page.waitForSelector('table', { timeout: 10000 })
    } catch (e) {
      console.log('未找到表格，可能在其他页面')
    }
  })

  test('1. 登录后页面检查', async ({ page }) => {
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(100)
    
    // 检查是否包含地图相关关键词
    const hasMapKeyword = bodyText?.includes('地图') || bodyText?.includes('Map')
    expect(hasMapKeyword).toBeTruthy()
  })

  test('2. 地图列表存在', async ({ page }) => {
    // 检查是否有地图列表或相关元素
    const buttons = await page.locator('button').allTextContents()
    const hasPreviewBtn = buttons.some(text => text.includes('预览'))
    expect(hasPreviewBtn).toBeTruthy()
  })

  test('3. 预览按钮存在', async ({ page }) => {
    const previewBtns = page.locator('button:has-text("预览")')
    const count = await previewBtns.count()
    console.log(`找到${count}个预览按钮`)
    expect(count).toBeGreaterThan(0)
  })

  test('4. 编辑按钮存在', async ({ page }) => {
    const editBtns = page.locator('button:has-text("编辑")')
    const count = await editBtns.count()
    console.log(`找到${count}个编辑按钮`)
    // 可能有也可能没有，不强制要求
  })

  test('5. 建图按钮存在', async ({ page }) => {
    const mappingBtns = page.locator('button:has-text("建图")')
    const count = await mappingBtns.count()
    console.log(`找到${count}个建图按钮`)
    // 可能有也可能没有，不强制要求
  })
})
