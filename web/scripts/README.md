# 前端自主测试工具

本目录包含用于前端自动化测试的工具和脚本。

## 工具列表

### autotest.cjs - 自主测试工具

自动化测试前端所有页面，检测 JS 错误和 UI 问题。

#### 功能
- ✅ 自动登录流程测试
- ✅ 页面元素验证
- ✅ JS 错误检测
- ✅ 页面截图保存

#### 使用方法

```bash
# 运行所有测试
node scripts/autotest.cjs

# 只测试登录
node scripts/autotest.cjs login

# 只测试地图管理
node scripts/autotest.cjs maps

# 截取所有页面截图
node scripts/autotest.cjs screenshot

# 错误检测模式
node scripts/autotest.cjs errors
```

#### 输出

- 测试结果输出到控制台
- 截图保存在: `test-results/autotest/`
- 文件命名: `{页面名}.png`

---

## Playwright 测试

项目使用 Playwright 进行 E2E 测试。

### 运行测试

```bash
# 运行所有测试
npx playwright test

# 运行指定测试
npx playwright test tests/home-page-check.spec.ts

# 带 UI 模式运行
npx playwright test --ui

# 生成 HTML 报告
npx playwright test --reporter=html
```

### 注意事项

⚠️ **Ant Design Button 选择器问题**

由于 Ant Design Button 组件会在文本中间插入不可见空格，直接使用 `:has-text()` 可能失败。

❌ 错误写法:
```javascript
await page.click('button:has-text("登录")');
```

✅ 正确写法:
```javascript
// 方式 1: 使用 type 属性
await page.click('button[type="submit"]');

// 方式 2: 使用正则匹配
await page.click('button:has-text(/登\\s*录/)');

// 方式 3: 使用实际文本（包含空格）
await page.click('button:has-text("登 录")');
```

---

## Vitest 单元测试

项目使用 Vitest 进行组件单元测试。

### 运行测试

```bash
# 运行所有单元测试
npx vitest run

# 监听模式
npx vitest

# 生成覆盖率报告
npx vitest run --coverage
```

### 测试文件位置

- Playwright E2E 测试: `tests/*.spec.ts`
- Vitest 单元测试: `tests/*.test.ts`

---

## 调试技巧

### 1. 查看页面实际按钮文本

```javascript
const buttonTexts = await page.locator('button').allTextContents();
console.log(buttonTexts);
```

### 2. 监听页面错误

```javascript
page.on('pageerror', err => console.log('Page Error:', err.message));
page.on('console', msg => {
  if (msg.type() === 'error') console.log('Console Error:', msg.text());
});
```

### 3. 截取当前页面

```javascript
await page.screenshot({ path: 'debug.png', fullPage: true });
```

---

## 测试检查清单

每次代码变更后，运行以下检查:

- [ ] `npm run build` 编译成功
- [ ] `node scripts/autotest.cjs` 所有测试通过
- [ ] 登录流程正常
- [ ] 地图列表加载正常
- [ ] 所有页面无 JS 错误
- [ ] 截图生成成功

---

_最后更新: 2026-03-25_