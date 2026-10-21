# schema-forge · 界面效果图预览

计划书本体见 `../PLAN.md`。本目录是**可交互的界面效果图**，用于照着做界面与确认视觉方向。

打开方式：直接双击 `index.html`（无构建、无 CDN 依赖，字体走 Google Fonts，断网时回退系统字体仍可用）。

## 设计定调说明（Design Direction Note）

- **受众**：① 你自己（照图施工）；② 面试官（README 顶部截图 / 点开 Playground）。
- **方向**：**Technical Blueprint / 工程制图**——描图纸底、靛蓝结构线、等宽标注、品红批注笔。
  选择理由：低代码引擎的本质是「把结构画成图纸再交给机器施工」，蓝图语义与产品语义同构，
  天然区别于常见的「白底紫渐变 / 三张卡片」类 AI 味页面。
- **主题**：主动选择 Light（描图纸 `#EFECE3` + 近黑墨 `#101418`），不使用纯白/纯黑。
  Designer 产品舱体用**深色**反转，形成「图纸 vs 屏幕」的对比，也是截图在 README 里的记忆点。
- **字体**：展示 `Chakra Petch`（技术棱角），正文 `Public Sans`（工业公文感），
  等宽 `Space Mono`（图纸标注）。中文回退 PingFang SC / 微软雅黑。
- **配色**：靛蓝 `#16336B` 主结构 60%，纸面 30%，**单一强调色品红 `#D6006E`** 10%，
  只用于选中态、关键动作、编号与批注。
- **记忆点**：① 右上角旋转的 `v1.0.0 RESUME READY` 图章；② 深色 Designer 舱体；
  ③ §06 那块**真的会跑的迷你引擎**（改发票类型 → 日志打印词法/依赖/拓扑/传播全过程）。

## 设计令牌

全部集中在 `assets/tokens.css` 的 `:root`，组件内零硬编码色值。
关键项：

| 类别 | 令牌 |
| --- | --- |
| 表面 | `--paper` `--paper-2` `--surface` `--surface-2` `--surface-sunk` |
| 墨色 | `--ink` `--ink-2` `--muted` `--muted-2` |
| 结构线 | `--line` `--line-soft` `--line-strong` |
| 主色 | `--blueprint` `--blueprint-2` `--blueprint-wash` |
| 强调 | `--accent` `--accent-ink` `--accent-wash` |
| 深色舱体 | `--dk-bg` `--dk-surface*` `--dk-text` `--dk-muted` `--dk-accent` `--dk-blue` |
| 字阶 | `--fs-hero` … `--fs-xxs`（1.25 modular） |
| 间距 | `--s1`(4) … `--s8`(144) |
| 动效 | `--ease-out` `--dur-fast`(160) `--dur-base`(320) `--dur-slow`(640) |

## 动效说明（Motion Spec）

- **入场序列**：`.reveal` + `data-d="1..5"`，组间隔 80ms，`IntersectionObserver` 触发，只动 `opacity / translateY`。
- **微交互**：物料卡 `translateY(-1px)` + 边框转强调色（160ms）；属性面板 Tab 切换 `fadeUp` 320ms；
  画布字段选中四角括号 + 品红内描边；联动字段出现时 `linkIn` 640ms 缩放淡入。
- **降级**：全站包在 `@media (prefers-reduced-motion: reduce)` 内关闭所有动画与平滑滚动。

## 自检结果

| 关卡 | 结果 |
| --- | --- |
| 定调说明 | ✅ 已写（见上） |
| 展示字 + 正文字 | ✅ Chakra Petch / Public Sans / Space Mono，均不在禁用清单 |
| 对比度实测 | ✅ ink/paper 16:1；muted 5.2:1；accent-ink 6.6:1；blueprint 10.3:1；dk-text 15.5:1；dk-muted 6.2:1；dk-accent 5.4:1 |
| 编排好的入场序列 | ✅ 5 组，80ms 错峰 |
| 降级动效 | ✅ 已验证 |
| 氛围层 | ✅ 26px 图纸网格 + feTurbulence 噪点 + 三级带环境色阴影 |
| 状态覆盖 | ✅ 默认/悬停/按下/聚焦可见/禁用/选中/错误/隐藏/空（日志窗空态） |
| 375 / 768 / 1440 三档 | ✅ 断点 1080 / 760，舱体三栏逐级降为两栏→单栏 |
| 反 AI 味清单 | ✅ 0 项未修复命中（无 Inter/Roboto、无紫渐变、非居中三卡首屏、有图章破格元素、文案无"赋能/新一代"） |
| 可直接运行 | ✅ 双击即用，资源均为相对路径 |

## 目录

```
preview/
├─ index.html              # 结构、语义地标、内容
└─ assets/
   ├─ tokens.css           # 设计令牌 + 重置 + 入场序列 + 氛围层
   ├─ components.css       # 组件与构成
   └─ main.js              # 入场/导航/舱体交互 + ★ 迷你表达式引擎
```

`main.js` 里的 `lex / parse / collectDeps / evalAst / buildGraph / toposort / propagate`
是一份**可直接运行的引擎原型**，建议直接作为 PLAN.md 中 W2–W3 的起点代码。
