import { test, expect, type Page } from '@playwright/test';

/**
 * 地图管理页面完整测试套件
 * 
 * 测试范围:
 * - 新建地图流程
 * - 地图列表显示
 * - 地图预览功能
 * - 地图操作功能
 */

test.describe('地图管理模块 - 完整测试', () => {
  let page: Page;
  
  // 测试前登录
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    
    // 登录
    await page.goto('http://192.168.3.121:3000/#/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[placeholder="用户名"]', 'admin');
    await page.fill('input[placeholder="密码"]', 'Sigu@2026');
    await page.click('button:has-text("登 录")');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.describe('新建地图流程测试', () => {
    test('应该成功打开新建地图弹窗', async () => {
      await page.goto('http://192.168.3.121:3000/#/maps');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // 点击新建地图按钮
      const createButton = page.locator('button:has-text("新建地图")').first();
      await expect(createButton).toBeVisible();
      await expect(createButton).toBeEnabled();
      await createButton.click();
      await page.waitForTimeout(500);
      
      // 检查弹窗是否显示
      const modal = page.locator('.ant-modal:has-text("新建地图")');
      await expect(modal).toBeVisible();
    });

    test('应该验证地图名称必填', async () => {
      // 直接提交表单（不填名称）
      const okButton = page.locator('.ant-modal .ant-btn-primary:has-text("确定")');
      await okButton.click();
      await page.waitForTimeout(500);
      
      // 应该显示错误提示
      const errorMessages = page.locator('.ant-form-item-explain-error');
      await expect(errorMessages).toHaveCount(1);
    });

    test('应该验证地图名称格式', async () => {
      // 输入非法字符
      const nameInput = page.locator('input[placeholder*="地图名称"]');
      await nameInput.fill('测试地图@#$');
      
      // 提交表单
      const okButton = page.locator('.ant-modal .ant-btn-primary:has-text("确定")');
      await okButton.click();
      await page.waitForTimeout(500);
      
      // 应该显示格式错误
      const errorMessages = page.locator('.ant-form-item-explain-error');
      await expect(errorMessages.first()).toContainText('只能包含字母、数字、下划线和短横线');
    });

    test('应该可以输入 GPS 坐标', async () => {
      // 填写表单
      const nameInput = page.locator('input[placeholder*="地图名称"]');
      await nameInput.fill('playwright_test_map');
      
      const latInput = page.locator('input[placeholder*="纬度"]');
      await latInput.fill('31.2304');
      
      const lonInput = page.locator('input[placeholder*="经度"]');
      await lonInput.fill('121.4737');
      
      const altInput = page.locator('input[placeholder*="海拔"]');
      await altInput.fill('5.2');
      
      // 验证输入值
      await expect(latInput).toHaveValue('31.2304');
      await expect(lonInput).toHaveValue('121.4737');
      await expect(altInput).toHaveValue('5.2');
    });

    test('应该可以取消创建', async () => {
      // 点击取消按钮
      const cancelButton = page.locator('.ant-modal .ant-btn:has-text("取消")');
      await cancelButton.click();
      await page.waitForTimeout(500);
      
      // 弹窗应该关闭
      const modal = page.locator('.ant-modal:has-text("新建地图")');
      await expect(modal).not.toBeVisible();
    });
  });

  test.describe('地图列表显示测试', () => {
    test('应该成功加载地图列表', async () => {
      await page.goto('http://192.168.3.121:3000/#/maps');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // 检查地图列表表格
      const table = page.locator('table.ant-table');
      await expect(table).toBeVisible();
    });

    test('应该显示统计卡片', async () => {
      // 检查统计卡片
      const statistics = page.locator('.ant-statistic');
      await expect(statistics).toHaveCount(4);
      
      // 检查卡片标题
      const titles = await page.locator('.ant-statistic-title').allTextContents();
      expect(titles).toContainEqual(expect.stringContaining('地图总数'));
    });

    test('应该显示地图类型标签', async () => {
      // 检查地图类型标签
      const typeTags = page.locator('.ant-tag');
      const tagTexts = await typeTags.allTextContents();
      
      // 应该包含至少一种地图类型
      const mapTypes = ['空地图', 'GPS 地图', '本地地图', '融合地图'];
      const hasMapType = tagTexts.some(text => mapTypes.some(type => text.includes(type)));
      expect(hasMapType).toBe(true);
    });

    test('应该可以刷新地图列表', async () => {
      // 点击刷新按钮
      const refreshButton = page.locator('button:has-text("刷新")');
      await refreshButton.click();
      await page.waitForTimeout(2000);
      
      // 表格应该仍然可见
      const table = page.locator('table.ant-table');
      await expect(table).toBeVisible();
    });
  });

  test.describe('地图预览功能测试', () => {
    test('空地图预览按钮应该禁用', async () => {
      await page.goto('http://192.168.3.121:3000/#/maps');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // 查找空地图行
      const emptyMapRow = page.locator('tr:has(.ant-tag:has-text("空地图"))').first();
      const previewButton = emptyMapRow.locator('button[title="预览"]');
      
      // 按钮应该禁用
      await expect(previewButton).toBeDisabled();
    });

    test('非空地图预览按钮应该可用', async () => {
      // 查找非空地图行（GPS 地图、本地地图或融合地图）
      const mapRow = page.locator('tr:has(.ant-tag:has-text("GPS 地图")), tr:has(.ant-tag:has-text("本地地图")), tr:has(.ant-tag:has-text("融合地图"))').first();
      
      if (await mapRow.count() > 0) {
        const previewButton = mapRow.locator('button[title="预览"]');
        await expect(previewButton).toBeEnabled();
      }
    });

    test('点击空地图预览应该提示', async () => {
      // 查找空地图行
      const emptyMapRow = page.locator('tr:has(.ant-tag:has-text("空地图"))').first();
      const previewButton = emptyMapRow.locator('button[title="预览"]');
      
      if (await previewButton.count() > 0) {
        await previewButton.click();
        await page.waitForTimeout(500);
        
        // 应该显示警告提示
        const warningMessage = page.locator('.ant-message-warning, .ant-message-info');
        await expect(warningMessage.first()).toContainText('未建图');
      }
    });
  });

  test.describe('地图操作功能测试', () => {
    test('应该显示操作按钮', async () => {
      await page.goto('http://192.168.3.121:3000/#/maps');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // 检查操作按钮
      const actionButtons = page.locator('td:last-child button');
      await expect(actionButtons.first()).toBeVisible();
    });

    test('删除地图应该显示确认对话框', async () => {
      // 查找删除按钮（可能有多个，取第一个非禁用的）
      const deleteButtons = page.locator('button[title="删除"]');
      const enabledDeleteButton = deleteButtons.first();
      
      if (await enabledDeleteButton.count() > 0) {
        await enabledDeleteButton.click();
        await page.waitForTimeout(500);
        
        // 应该显示确认对话框
        const confirmDialog = page.locator('.ant-popover:has-text("确定要删除")');
        await expect(confirmDialog).toBeVisible();
        
        // 点击取消
        const cancelButton = page.locator('.ant-popover button:has-text("取消")');
        await cancelButton.click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('API 集成测试', () => {
    test('地图列表 API 应该返回成功', async () => {
      const response = await page.request.get('http://192.168.3.121:5000/api/maps');
      expect(response.ok()).toBe(true);
      
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('maps');
    });

    test('创建地图 API 应该接受空地图', async () => {
      const response = await page.request.post('http://192.168.3.121:5000/api/maps', {
        data: {
          name: 'api_test_empty_map_' + Date.now()
        }
      });
      
      // 应该成功创建（即使没有坐标）
      expect(response.ok()).toBe(true);
    });

    test('创建地图 API 应该接受 GPS 地图', async () => {
      const response = await page.request.post('http://192.168.3.121:5000/api/maps', {
        data: {
          name: 'api_test_gps_map_' + Date.now(),
          origin: {
            lat: 31.2304,
            lon: 121.4737,
            alt: 5.2
          }
        }
      });
      
      // 应该成功创建
      expect(response.ok()).toBe(true);
    });
  });
});
