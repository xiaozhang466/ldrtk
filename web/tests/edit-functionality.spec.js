/**
 * 编辑功能测试
 * 测试范围：重命名、修改坐标、验证规则
 */

import { test, expect } from '@playwright/test'

test.describe('编辑功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000')
    await page.waitForSelector('table', { timeout: 10000 })
  })

  test('1. 打开编辑对话框', async ({ page }) => {
    const editBtn = page.locator('button:has-text("编辑")').first()
    await editBtn.click()
    
    // 验证对话框打开
    await page.waitForSelector('.ant-modal', { timeout: 5000 })
    await expect(page.locator('.ant-modal')).toBeVisible()
    
    // 验证标题
    const title = page.locator('.ant-modal-title')
    await expect(title).toContainText('编辑')
  })

  test('2. 地图名称输入框', async ({ page }) => {
    const editBtn = page.locator('button:has-text("编辑")').first()
    await editBtn.click()
    
    // 验证名称输入框
    const nameInput = page.locator('input[placeholder*="名称"]')
    await expect(nameInput).toBeVisible()
  })

  test('3. GPS 坐标输入框', async ({ page }) => {
    const editBtn = page.locator('button:has-text("编辑")').first()
    await editBtn.click()
    
    // 验证纬度输入框
    const latInput = page.locator('input[placeholder*="纬度"]')
    await expect(latInput).toBeVisible()
    
    // 验证经度输入框
    const lngInput = page.locator('input[placeholder*="经度"]')
    await expect(lngInput).toBeVisible()
    
    // 验证海拔输入框
    const altInput = page.locator('input[placeholder*="海拔"]')
    await expect(altInput).toBeVisible()
  })

  test('4. 坐标验证 - 有效值', async ({ page }) => {
    const editBtn = page.locator('button:has-text("编辑")').first()
    await editBtn.click()
    
    // 输入有效坐标
    const latInput = page.locator('input[placeholder*="纬度"]')
    await latInput.fill('30.4779')
    
    const lngInput = page.locator('input[placeholder*="经度"]')
    await lngInput.fill('114.3609')
    
    // 验证无错误提示
    await page.waitForTimeout(500)
    const errorText = page.locator('text=纬度范围')
    await expect(errorText).not.toBeVisible()
  })

  test('5. 坐标验证 - 无效纬度', async ({ page }) => {
    const editBtn = page.locator('button:has-text("编辑")').first()
    await editBtn.click()
    
    // 输入无效纬度（超出范围）
    const latInput = page.locator('input[placeholder*="纬度"]')
    await latInput.fill('100')  // 超出 -90 到 90
    
    // 触发验证
    await latInput.press('Tab')
    
    // 验证错误提示
    await page.waitForTimeout(500)
    const errorText = page.locator('text=纬度范围')
    await expect(errorText).toBeVisible()
  })

  test('6. 坐标验证 - 无效经度', async ({ page }) => {
    const editBtn = page.locator('button:has-text("编辑")').first()
    await editBtn.click()
    
    // 输入无效经度（超出范围）
    const lngInput = page.locator('input[placeholder*="经度"]')
    await lngInput.fill('200')  // 超出 -180 到 180
    
    // 触发验证
    await lngInput.press('Tab')
    
    // 验证错误提示
    await page.waitForTimeout(500)
    const errorText = page.locator('text=经度范围')
    await expect(errorText).toBeVisible()
  })

  test('7. 中文地图名称支持', async ({ page }) => {
    const editBtn = page.locator('button:has-text("编辑")').first()
    await editBtn.click()
    
    // 输入中文名称
    const nameInput = page.locator('input[placeholder*="名称"]')
    await nameInput.fill('华农果园测试')
    
    // 触发验证
    await nameInput.press('Tab')
    
    // 验证无错误提示
    await page.waitForTimeout(500)
    const errorText = page.locator('text=只能包含')
    await expect(errorText).not.toBeVisible()
  })

  test('8. 提示信息显示', async ({ page }) => {
    const editBtn = page.locator('button:has-text("编辑")').first()
    await editBtn.click()
    
    // 验证提示信息存在
    const hint = page.locator('text=修改坐标后')
    await expect(hint).toBeVisible()
  })
})
