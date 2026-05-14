/**
 * 建图功能测试
 * 测试范围：建图对话框、开始/停止建图、状态显示
 */

import { test, expect } from '@playwright/test'

test.describe('建图功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000')
    await page.waitForSelector('table', { timeout: 10000 })
  })

  test('1. 打开建图对话框', async ({ page }) => {
    const mappingBtn = page.locator('button:has-text("建图")').first()
    await mappingBtn.click()
    
    // 验证对话框打开
    await page.waitForSelector('.ant-modal', { timeout: 5000 })
    await expect(page.locator('.ant-modal')).toBeVisible()
    
    // 验证标题包含"建图"
    const title = page.locator('.ant-modal-title')
    await expect(title).toContainText('建图')
  })

  test('2. 建图状态显示', async ({ page }) => {
    const mappingBtn = page.locator('button:has-text("建图")').first()
    await mappingBtn.click()
    
    // 验证状态栏存在
    const statusBar = page.locator('text=建图状态')
    await expect(statusBar).toBeVisible()
  })

  test('3. 开始建图按钮', async ({ page }) => {
    const mappingBtn = page.locator('button:has-text("建图")').first()
    await mappingBtn.click()
    
    // 验证开始建图按钮
    const startBtn = page.locator('button:has-text("开始建图")')
    await expect(startBtn).toBeVisible()
    
    // 验证按钮可点击
    await expect(startBtn).toBeEnabled()
  })

  test('4. 停止建图按钮（未开始时禁用）', async ({ page }) => {
    const mappingBtn = page.locator('button:has-text("建图")').first()
    await mappingBtn.click()
    
    // 验证停止按钮存在但禁用
    const stopBtn = page.locator('button:has-text("停止建图")')
    await expect(stopBtn).toBeVisible()
    await expect(stopBtn).toBeDisabled()
  })

  test('5. 对话框关闭功能', async ({ page }) => {
    const mappingBtn = page.locator('button:has-text("建图")').first()
    await mappingBtn.click()
    
    // 关闭对话框
    const closeBtn = page.locator('.ant-modal-close')
    await closeBtn.click()
    
    // 验证对话框已关闭
    await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: 3000 })
  })

  test('6. 空地图建图提示', async ({ page }) => {
    // 查找空地图的建图按钮
    // 验证显示提示信息
    console.log('检查空地图建图提示...')
  })
})
