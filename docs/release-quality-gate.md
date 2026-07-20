# 发布质量门控

这份门控覆盖当前优先做的优化项：1、4、2、5、6、7、9、10。

## 覆盖关系

- 1 真包验收：`npm run verify:package` 启动打包后的 Electron，截 GUI、OBS、透明窗口、PNG 导出。
- 4 OBS 像素验收：`verify:package` 和 `npm run visual:evidence` 校验透明中心、1920 x 1080、单队 420 x 1080、可见像素比例。
- 2 视觉回归证据：`release-evidence/vX.Y.Z/*.png` 是当前版本基线，`visual:evidence` 会检查关键截图齐全且尺寸正确。
- 5 桌面 UI 路径验收：`verify:package` 覆盖素材搜索、懒加载、阵容输入、预设切换、导出 PNG、采集窗口。
- 6 交付清单门控：`npm run release:gate -- --strict` 检查脚本、README、飞书交付文档、截图证据和安装包。
- 7 布局安全区：`tests/roomDesign.test.ts` 和 `verify:package` 检查比赛文字不压阵容栏。
- 9 素材质量扫描：`npm run assets:quality` 全量扫描 seed-data 的 PNG、名称、旧来源标记、缺图和占位图风险。
- 10 release bot：`npm run release:bot` 串起素材、测试、lint、E2E、build 和交付门控。

## 常用命令

开发期快速门控：

```powershell
npm run assets:quality
npm run test
npm run lint
npm run e2e
npm run build
npm run release:gate
```

已有真包和截图证据时：

```powershell
npm run visual:evidence
npm run release:gate -- --strict
```

完整发布前：

```powershell
npm run release:bot -- --dist --verify-package --strict-gate
```

飞书交付按 `docs/feishu-delivery.md` 执行：安装包不分包，上传云盘后逐个 `drive +inspect` 读回校验。
