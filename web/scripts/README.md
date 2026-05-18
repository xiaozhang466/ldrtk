# 前端脚本说明

当前保留的脚本：

- `autotest.cjs`：基于 Playwright 的自主冒烟测试脚本。

## 使用方式

```bash
cd web
node scripts/autotest.cjs
node scripts/autotest.cjs login
node scripts/autotest.cjs maps
node scripts/autotest.cjs screenshot
node scripts/autotest.cjs errors
```

脚本会访问本地前端服务，执行登录、地图管理页面检查、页面错误检测和截图。截图输出到 `test-results/autotest/`。

## 常规测试命令

```bash
cd web
npm run build
npx playwright test
npx vitest run
```

配置文件：

- `playwright.config.ts`：E2E 测试，测试目录为 `tests/`。
- `vitest.config.ts`：单元/组件测试，匹配 `tests/**/*.{test,spec}.*`。

## 注意事项

- `test-results/` 和 `playwright-report/` 是生成目录，不应作为源码提交。
- 旧的一次性调试脚本已经清理，不再从根目录运行 `test-debug*.cjs` 或 `test-path-planning*.cjs`。
- Ant Design 按钮文本可能包含空格，测试中优先使用 role、label、placeholder 或更稳定的选择器。

最后整理：2026-05-18
