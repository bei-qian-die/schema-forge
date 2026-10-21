# Schema 熔炉 · schema-forge

[![license](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![tests](https://img.shields.io/badge/core%20tests-71%20passed-brightgreen.svg)](#测试与覆盖率)
[![coverage](https://img.shields.io/badge/coverage-85.1%25%20lines-ff2d78.svg)](#测试与覆盖率)
[![bundle](https://img.shields.io/badge/core%20gzip-12.6%20KB-blue.svg)](#构建)
[![npm](https://img.shields.io/badge/npm-not%20published-lightgrey.svg)](#已知边界)
[![runtime deps](https://img.shields.io/badge/runtime%20deps-0-black.svg)](packages/core/package.json)
[![ci](https://img.shields.io/badge/CI-GitHub%20Actions-2088ff.svg)](.github/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883.svg)](https://vuejs.org/)

![schema-forge 预览](docs/assets/hero.png)

Schema 驱动的表单引擎与可视化设计器。把表单当成源码：**迁移 → 归一化 → 表达式编译 → 依赖建图 → 拓扑排序 → 运行时 store**。

- 运行时内核零框架依赖，Vue 只是适配层
- 自研表达式引擎，不调用 `new Function`
- 依赖图 + Kahn 拓扑排序 + DFS 三色环检测
- 精确脏传播：只重算受影响的下游表达式
- RFC 6902 JSON Patch 撤销 / 重做
- `InferFormData<S>` 从 schema 推导表单数据类型

## 快速开始

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
```

首页是项目说明与真实运行时演示；设计器在 `#/designer`。

Windows 下也可以直接双击根目录的 `start.bat`：自动检查 Node 与 pnpm、安装缺失依赖，启动后打开浏览器。`start.bat --no-open` 只启动服务、不打开浏览器。

```bash
pnpm test           # core 单测，71 条
pnpm test:coverage  # v8 覆盖率报告
pnpm typecheck      # vue-tsc 全仓库
pnpm build          # core 产物 + 静态站点（packages/playground/dist）
pnpm preview        # 预览构建产物
```

要求 Node ≥ 20，包管理器固定为 pnpm 9.15.9。

## 工程证据

| 指标 | 当前值 | 测量方式 |
| --- | --- | --- |
| core 单测 | **71 条 / 5 文件** | `pnpm test` |
| 行覆盖率 | **85.1%**（分支 74.0% / 函数 85.3%） | `pnpm test:coverage`（v8） |
| core 体积 | **35.4 KB → 12.6 KB gzip** | tsdown `minify: true` |
| 运行时依赖 | **0** | `packages/core/package.json` |
| 500 字段单次求值 | **120 → 2 条 effect**（跳过 98.3%） | 首页实时基准 |
| 500 字段传播加速 | 本机多次测量约 **4–7×** | 同上，随机器与负载波动 |

这些数字取自仓库当前状态，可以复跑；未测量的指标不会写成已实现。

## 仓库结构

```text
packages/
  core/          # 协议、编译、表达式、依赖图、store、校验、Patch（无框架依赖）
  renderer-vue/  # SchemaRenderer / FieldNode / useField，字段级订阅
  materials/     # 内置控件与 propsSchema（属性面板的元数据来源）
  designer/      # 设计器：画布、属性自举、逻辑板、预览、Schema 双向编辑
  playground/    # 演示站：首页、真实运行时、实时基准、设计器入口
```

依赖方向：`core ← renderer-vue ← materials ← designer ← playground`。设计器与渲染器之间只通过 schema 协议和物料注册表通信。

## 编译管线

```text
schema v1.x ──migrate──▶ v2.0 ──normalize──▶ defaults / key 去重
  ──compile expressions──▶ AST + 静态依赖
  ──build graph──▶ Kahn 拓扑排序 + DFS 三色环检测
  ──runtime store──▶ 版本号 / 脏传播 / 校验 / 事件
```

编译结果是一个 `FormProgram`，包含字段索引、效果列表、依赖图、计算顺序、统计信息与 schema 哈希。`createForm()` 接受 schema 或已编译的 program——设计器内部复用后者，避免预览时重复编译。

### 表达式

作用域：`$form` / `$values` / `$self` / `$index` / `$status.<path>.visible|disabled|required`。

```text
$form.trip.type === 'INTERNATIONAL'
len($form.employee.name) >= 2
$status.passport.no.visible
includes($form.employee.name, '重名')
```

解析器是手写的词法分析 + **优先级爬升**（precedence climbing）。白名单函数：`len`、`includes`、`empty`、`sum`、`date`、`upper`、`lower`。**不支持方法调用**（`.includes()` 这类写法会被解析器拒绝），也不存在 `new Function` / `eval`。

### 循环依赖与精准传播

对值路径和效果节点（`field.visible|disabled|required`）统一建图。拓扑排序后仍有入度的节点参与 DFS 三色环检测，环会以 `compile issue` 的形式返回，而不是在运行时死循环。

运行时维护字段版本号，变更时沿反向边求下游闭包，只对闭包内节点按拓扑序求值。数组行字段不参与编译建图，`FieldNode` 在本地求值 flags，并用「行路径 + 表达式静态依赖」过滤版本号，避免一行输入导致所有行重渲染。

## 设计器

- **设计**：左侧物料库，中间画布，右侧属性面板。属性面板由物料的 `propsSchema` 驱动，走的是同一个表单引擎。
- **逻辑**：查看表达式效果与依赖，编辑联动规则，编译问题实时反馈。
- **预览**：真实 `createForm` 运行时，联调可见性、禁用、必填与异步校验。
- **Schema**：双向编辑 JSON，导入 / 导出。
- 快捷键：`Ctrl/Cmd + Z` 撤销，`Ctrl/Cmd + Shift + Z` 重做。

设计器默认 schema 覆盖了发票场景，包括 `$status` 三链（切换类型 → 税号可见 → 税号必填）与异步远程校验。本地状态写入 `localStorage`，可用设计器内的重置入口恢复。编辑时编译会做 150ms 防抖，画布本身仍然即时更新。

## 基准：500 字段到底省了什么

`packages/playground/src/components/BenchmarkPanel.vue` 在浏览器里现场构建 500 字段、120 个表达式的 schema：

- 60 个可见性表达式 + 60 个必填表达式，后者依赖 `$status` 效果节点，形成链式依赖
- 触发 `f000` 只影响 `f100.visible → f200.required` 这 2 条 effect；全量实现每轮扫描全部 120 条
- 对照组为“已预编译 AST、但每次全量扫描 120 条表达式”的朴素实现，对朴素实现更有利
- 传播取 1000 次 × 5 轮的中位数，预热 500 次；另有 120 / 300 / 500 / 1000 字段的扫描曲线

页面同时画出交叉曲线：**小表单上依赖图传播可能并不更快（约 1×，甚至略慢）**，字段规模上来后结构跳过的收益才明显。基准只测 core 的传播路径，不包含 Vue 渲染、DOM、网络；数据随机器、浏览器版本和后台负载变化，不应外推为通用性能结论。页面上的数字是现场测量结果，不是写死的营销值。

![实时基准与交叉曲线](docs/assets/benchmark.png)

## 测试与覆盖率

```text
expression.test.ts  17  词法 / 语法 / 白名单 / 方法调用拒绝 / 错误定位
graph.test.ts        9  建图 / 拓扑 / 环检测 / 下游闭包
patch.test.ts       11  apply / diff / invert / 历史合并
protocol.test.ts    14  归一化 / 迁移 / 默认值 / 类型推导
store.test.ts       20  读写 / 可见性 / 校验 / 异步节流 / 序列化 / 事件 / 克隆 / 只读视图
```

最近一次 `pnpm test:coverage`（2026-10-21，v8）：

```text
Statements  85.12%   Branches  73.96%   Functions  85.27%   Lines  85.12%
```

覆盖率只统计 `packages/core/src`，排除纯类型文件与导出入口。core 不依赖 DOM，lexer、拓扑、Patch、迁移都能用纯函数直接测试。

## 构建

core 使用 tsdown 输出 ESM + CJS + `.d.ts`，并开启 `minify`：

```text
dist/index.js    35.4 KB │ gzip: 12.6 KB
dist/index.cjs   35.8 KB │ gzip: 12.6 KB
```

Playground 使用相对 `base` 构建，静态产物位于 `packages/playground/dist`。

## CI 与 GitHub Pages

`.github/workflows/ci.yml` 包含两个 job：

1. **quality**：install → typecheck → test → build，并上传 `playground-dist` 构件
2. **pages**：仅 main 分支 push 时运行，下载同一份构件，经 `configure-pages` / `upload-pages-artifact` / `deploy-pages` 发布

仓库需在 Settings → Pages 中选择 **GitHub Actions** 作为 Source；启用前不会生成在线地址。

## 竞品定位

三者定位不同，下表是基于公开文档的粗粒度对照，不是功能评测，也不构成优劣结论。

| 维度 | Formily | amis | schema-forge |
| --- | --- | --- | --- |
| 定位 | 响应式表单框架 | JSON 页面配置器 | Schema 编译内核 + Vue 渲染层 |
| 框架耦合 | React 为主，另有 Vue 适配 | React | core 无框架，Vue 可替换 |
| 表达式依赖 | 运行时响应式追踪 | 运行时表达式求值 | AST 静态依赖 + 显式依赖图 |
| 依赖图 / 环检测 | 以响应式联动为主 | 以页面配置为主 | 一等公民：Kahn + DFS 三色 |
| Schema 迁移链 | 需自行实现 | 需自行实现 | v1.0 → v1.1 → v2.0 有序迁移 |
| JSON Patch 历史 | 未内置 | 未内置 | RFC 6902，300ms 合并 / 200 步 |
| 可视化设计器 | Designable 生态 | amis-editor | 内置，属性面板自举 |
| 成熟度 | 成熟，社区大 | 成熟，企业使用广 | 个人项目，未发 npm，无虚拟滚动 |

schema-forge 不是 Formily / amis 的替代品。它更小、更偏底层，把表达式、依赖图、环检测、迁移链和 JSON Patch 当作编译系统的一等公民，适合用来研究「Schema 编译」这件事本身。

## 已知边界

- 渲染器目前只有 Vue 版本，`renderer-react` 在路线图里，未实现
- 长表单尚未做虚拟滚动；首屏与 DOM 节点数没有测量数据
- 编译是全量的，没有增量编译或编译缓存
- 未发布 npm 包，没有 changesets / size-limit
- 设计器状态存 `localStorage`，没有后端协作与多人编辑
- 竞品对比只是基于公开文档的粗粒度定位，不是评测

## 技术文章

[《我写了一个把 Schema 当源码编译的表单引擎》](docs/schema-as-source.md)：从编译管线、表达式解析、依赖图与环检测，到精准传播、Patch 历史和设计器自举，记录这套引擎的设计取舍与踩坑。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动 playground 开发服务器 |
| `pnpm build` | 构建 core，再构建静态站点 |
| `pnpm preview` | 预览构建产物 |
| `pnpm test` | 运行 vitest |
| `pnpm test:watch` | 监听模式 |
| `pnpm test:coverage` | v8 覆盖率报告（HTML 输出到 `coverage/`） |
| `pnpm typecheck` | `vue-tsc --noEmit` |

## 技术栈

TypeScript 5.7 · Vue 3.5 · Vite 6 · Vitest 2 · tsdown · pnpm workspace。

## License

[MIT](LICENSE) © 2026 schema-forge contributors
