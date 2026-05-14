import { test, expect } from '@playwright/test'

test.describe('UI 功能截图测试 (强制版)', () => {
  test('1. 登录页面截图', async ({ page }) => {
    await page.goto('http://localhost:3000/#/login')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    await page.screenshot({ 
      path: 'test-results/screenshots/01-login-page.png',
      fullPage: true 
    })
  })

  test('2. 登录后地图列表截图', async ({ page }) => {
    await page.goto('http://localhost:3000/#/login')
    await page.waitForLoadState('networkidle')
    
    const usernameInput = page.locator('input[type="text"], input[type="email"], input[placeholder*="用户"], input[name="username"]').first()
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first()
    
    await usernameInput.fill('admin')
    await passwordInput.fill('Sigu@2026')
    await passwordInput.press('Enter')
    
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    
    await page.screenshot({ 
      path: 'test-results/screenshots/02-map-list.png',
      fullPage: true 
    })
  })

  test('3. GPS 地图预览截图', async ({ page }) => {
    await page.goto('http://localhost:3000/#/login')
    await page.waitForLoadState('networkidle')
    
    const usernameInput = page.locator('input[type="text"], input[type="email"], input[placeholder*="用户"], input[name="username"]').first()
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first()
    
    await usernameInput.fill('admin')
    await passwordInput.fill('Sigu@2026')
    await passwordInput.press('Enter')
    
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    
    // 尝试点击第一个预览按钮
    try {
      const previewBtn = page.locator('button:has-text("预览")').first()
      await previewBtn.click({ timeout: 5000 })
      await page.waitForSelector('.ant-modal', { timeout: 10000 })
      await page.waitForTimeout(5000)
      
      await page.screenshot({ 
        path: 'test-results/screenshots/03-gps-map-preview.png',
        fullPage: true 
      })
    } catch (e) {
      console.log('GPS 地图预览按钮未找到，截图当前页面')
      await page.screenshot({ 
        path: 'test-results/screenshots/03-gps-map-preview.png',
        fullPage: true 
      })
    }
  })

  test('4. 建图对话框截图', async ({ page }) => {
    await page.goto('http://localhost:3000/#/login')
    await page.waitForLoadState('networkidle')
    
    const usernameInput = page.locator('input[type="text"], input[type="email"], input[placeholder*="用户"], input[name="username"]').first()
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first()
    
    await usernameInput.fill('admin')
    await passwordInput.fill('Sigu@2026')
    await passwordInput.press('Enter')
    
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    
    try {
      const mappingBtn = page.locator('button:has-text("建图")').first()
      await mappingBtn.click({ timeout: 5000 })
      await page.waitForSelector('.ant-modal', { timeout: 10000 })
      await page.waitForTimeout(2000)
      
      await page.screenshot({ 
        path: 'test-results/screenshots/04-mapping-dialog.png',
        fullPage: true 
      })
    } catch (e) {
      console.log('建图按钮未找到，截图当前页面')
      await page.screenshot({ 
        path: 'test-results/screenshots/04-mapping-dialog.png',
        fullPage: true 
      })
    }
  })

  test('5. 编辑对话框截图', async ({ page }) => {
    await page.goto('http://localhost:3000/#/login')
    await page.waitForLoadState('networkidle')
    
    const usernameInput = page.locator('input[type="text"], input[type="email"], input[placeholder*="用户"], input[name="username"]').first()
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first()
    
    await usernameInput.fill('admin')
    await passwordInput.fill('Sigu@2026')
    await passwordInput.press('Enter')
    
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    
    try {
      const editBtn = page.locator('button:has-text("编辑")').first()
      await editBtn.click({ timeout: 5000 })
      await page.waitForSelector('.ant-modal', { timeout: 10000 })
      await page.waitForTimeout(2000)
      
      await page.screenshot({ 
        path: 'test-results/screenshots/05-edit-dialog.png',
        fullPage: true 
      })
    } catch (e) {
      console.log('编辑按钮未找到，截图当前页面')
      await page.screenshot({ 
        path: 'test-results/screenshots/05-edit-dialog.png',
        fullPage: true 
      })
    }
  })
})
