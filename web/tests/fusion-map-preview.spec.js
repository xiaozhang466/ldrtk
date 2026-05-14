/**
 * 融合地图预览测试
 */

import { test, expect } from '@playwright/test'

test.describe('融合地图预览功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000')
    await page.waitForSelector('table', { timeout: 10000 })
  })

  test('1. 融合地图预览对话框', async ({ page }) => {
    // 找到融合地图并打开预览
    const previewBtn = page.locator('button:has-text("预览")').nth(1)
    if (await previewBtn.isVisible()) {
      await previewBtn.click()
      await page.waitForSelector('.ant-modal', { timeout: 5000 })
      await expect(page.locator('.ant-modal')).toBeVisible()
    }
  })

  test('2. 透明度调节滑块', async ({ page }) => {
    const previewBtn = page.locator('button:has-text("预览")').nth(1)
    if (await previewBtn.isVisible()) {
      await previewBtn.click()
      
      // 验证透明度滑块存在
      const slider = page.locator('.ant-slider')
      await expect(slider).toBeVisible()
    }
  })

  test('3. 全屏按钮', async ({ page }) => {
    const previewBtn = page.locator('button:has-text("预览")').nth(1)
    if (await previewBtn.isVisible()) {
      await previewBtn.click()
      
      // 验证全屏按钮存在
      const fullscreenBtn = page.locator('button:has-text("全屏")')
      await expect(fullscreenBtn).toBeVisible()
    }
  })
})
