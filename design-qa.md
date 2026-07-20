# S3 计分栏 Design QA

## 验收范围

- 设计基准：三套已确认的 S3 计分栏设计图。
- 默认方案：`S3 四叶合页`。
- 实现方式：ImageGen 生成并精修透明 PNG 底图；选手名、比分、赛制和头像保持实时可编辑。
- 标准画布：1920 x 1080。
- 响应式画布：1280 x 720、2560 x 1440。
- 截图状态：9:1、BO5、默认隐藏头像、关闭动效以便稳定比对。

## 视觉证据

- `output/playwright/s3-storybook-comparison.png`
- `output/playwright/s3-prism-bookmark-comparison.png`
- `output/playwright/s3-clover-hinge-comparison.png`
- `output/playwright/s3-clover-hinge-room.png`
- `output/playwright/s3-clover-hinge-avatar-visible.png`
- `output/playwright/s3-player-bar-settings.png`
- `output/playwright/s3-clover-hinge-desktop-live.png`

## 对照结果

- 三套结构、计分位置、左右阵营关系和 S3 彩铅材质均按设计图落地。
- 方案 2 的比分位于最左和最右，中央 VS/BO5 保持独立固定。
- 方案 3 使用白色比分和四叶草合页构图，设为新建项目默认值。
- 三套均保留比分、选手名、赛制、头像显隐和切换动效。
- 隐藏头像后，S3 样式的双方选手名在各自区域居中，不保留空头像占位。
- 计分栏在 720p、1080p、1440p 下按相同比例缩放，不挤压直播安全区。

## 修正记录

- 第一轮高度和字号偏小：已放大栏体、选手名与比分。
- 方案 3 比分颜色偏暗：已改为设计图对应的白色。
- 方案 2 的 BO5 与装饰重叠：已上移并重新校准。
- 固定像素导致 720p 比例异常：已改为容器比例单位。
- 旧头像隐藏态测试仍要求经典栏偏移：已更新为 S3 默认样式的居中规则。

## 结论

- 未发现 P0、P1、P2 级视觉缺陷。
- final result: passed
