# 版本维护说明

## 版本规则

项目使用 `major.minor.patch`：

- `major`：旧配置、OBS 地址或主要工作流出现不兼容变化。
- `minor`：新增功能、赛季素材体系、主要预设或可见工作流。
- `patch`：缺陷修复、样式打磨、性能和兼容性调整。

`package.json` 与 `package-lock.json` 的版本必须一致。正式版本必须有对应 Git tag 和 GitHub Release。

## 分支与提交

- `main` 始终保持可构建状态。
- 功能分支使用 `feature/<name>`，修复分支使用 `fix/<name>`。
- 合并前通过 CI；合并后自动删除远端分支。
- 版本提交建议使用 `Release vX.Y.Z`。

## 发布清单

1. 确认工作区只包含本次版本改动。
2. 更新 `package.json`、`package-lock.json` 和 `CHANGELOG.md`。
3. 安装锁定依赖并执行基础门控：

```powershell
npm ci
npm run lint
npm test
npm run assets:quality
npm run build
```

4. 执行交互和视觉回归：

```powershell
npm run e2e
npm run visual:evidence
```

5. 构建并验证真实安装包：

```powershell
npm run dist
npm run verify:package
```

6. 真机检查编辑器、快捷控制、OBS 左队/右队/双方/直播间、透明窗口和 PNG 导出。
7. 计算安装包 SHA256：

```powershell
Get-FileHash -Algorithm SHA256 ".\release\阵容叠加器 Setup X.Y.Z.exe"
```

8. 提交 `Release vX.Y.Z`，创建 `vX.Y.Z` tag 和 GitHub Release。
9. 上传安装包，在 Release Notes 中写入变更摘要、兼容说明和 SHA256。
10. 从 GitHub 回下载安装包并复核大小与 SHA256。

## 仓库边界

以下内容不进入 Git 历史：

- `node_modules/`、`dist/`、`dist-electron/`、`release/`；
- Playwright 输出、发布截图和本地审计记录；
- 飞书交付 token、消息回执及内部交接文档；
- 用户运行数据与自定义导入素材。

可复现源码、内置素材、测试、构建脚本和通用文档必须随版本提交。
