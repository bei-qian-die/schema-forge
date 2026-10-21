# schema-forge · 复验报告

> 对照 `PLAN.md`（2026-10-21 制定）逐项核验实际实现，给出**可复现的实测数据**与**修改优先级**。
> 复验时间：2026-10-21 16:50 · 环境：Windows / Node 22.22.2 / pnpm 9.15.9

---

## 0. 复验方法（每条结论都可自己再跑一遍）

```bash
pnpm test        # 70 passed (5 files)
pnpm typecheck   # vue-tsc 通过，0 error
pnpm build       # core + playground 均构建成功
```

基准数据用 core 的**构建产物**实测（`packages/core/dist/index.js`），脚本复刻
`BenchmarkPanel.vue` 的方法（400 次 × 5 轮取中位数，含 warmup，对照组同样预编译 AST）：

| 字段数 | 表达式数 | 依赖图传播 | 全量扫描 | 加速比 | 每次实际求值 |
| --- | :---: | ---: | ---: | ---: | ---: |
| 120 | 20 | 0.00194 ms | 0.00090 ms | **0.46×** | 1 / 20 |
| 300 | 80 | 0.00271 ms | 0.00737 ms | 2.72× | 2 / 80 |
| 500 | 120 | 0.00231 ms | 0.01256 ms | **5.4×** | 2 / 120 |
| 1000 | 240 | 0.00083 ms | 0.02536 ms | **30.7×** | 2 / 240 |

---

## 1. 结论速览

**整体：核心壁垒全部落地且质量高于预期，工程化门面落后于计划书。**

| 维度 | 评价 | 说明 |
| --- | --- | --- |
| 算法正确性 | ✅ 优秀 | 70 单测全绿、strict TS 零错误；`$status` 效果链、`$self` 依赖回填、环检测都实测可用 |
| 代码质量 | ✅ 优秀 | 中文注释解释设计意图、`CompileIssue` 带行列号、承诺书式的 honest README |
| 计划兑现度 | 🟡 78% | L1 引擎内核 100%、L2 渲染/设计器 90%、L3 与工程化 40% |
| **简历数字可用性** | 🔴 **有风险** | 计划书里的 6 个数字有 3 个不可复现、2 个未实现、1 个未测量（见 §3） |
| **门面可验证性** | 🔴 **阻塞** | **没有 git 仓库** → CI badge / Pages / 提交历史全部不存在 |

---

## 2. 计划书逐项兑现情况

| 计划书条目 | 状态 | 实测证据 |
| --- | :---: | --- |
| core 零框架依赖 | ✅ | `grep "from 'vue'" packages/core/src` → 0 命中 |
| 不用 `new Function` / eval | ✅ | 全仓库无 `new Function`；parser 用优先级爬升（`parser.ts:161`），错误带 line/column |
| 表达式：路径/三元/逻辑/函数 | ✅ | `$form/$values/$self/$index/$status` 五个作用域齐全，`WHITELIST_FUNCTIONS` 7 个函数 |
| 依赖收集 | ✅ | `expression/deps.ts`，并额外做了 `$self` 回填（`compile.ts:304`）—— 这是计划书没写到的加分点 |
| Kahn 拓扑排序 | ✅ | `graph/toposort.ts`，插入序确定 → 快照稳定 |
| DFS 三色环检测 | ✅ | `graph/cycle.ts`，`compile.ts:389` 转成 `CIRCULAR_DEPENDENCY` issue |
| 精准脏值传播 | ✅ | `Uint32Array` 版本位图（`create-store.ts:177`）+ `downstreamClosure` |
| 校验引擎 同步/异步/防抖/合并 | ✅ | `asyncCoalesced` 计数器 + 300ms（站点用 420ms）防抖 |
| JSON Patch 撤销重做 | ✅ | `patch/operations.ts` 全 6 种 op、`history.ts` 300ms 合并 + 200 步上限 |
| Vue3 渲染器 + 布局容器 | ✅ | card / grid / tabs / tab / collapse / array 六种 |
| 属性面板自举 | ✅ | `PropsForm.vue` 用 `SchemaRenderer` 渲染物料的 `propsSchema` |
| Schema 双向同步 | ✅ | `SchemaPanel.vue` + `replaceSchema()` |
| `InferFormData<S>` | ✅ | `protocol/infer.ts`，protocol.test 覆盖 |
| Schema 版本迁移链 | ✅ | `migrate.ts` v1.0 → v1.1 → v2.0，失败保留原值并告警 |
| 依赖图可视化 | ✅ | `DependencyGraph.vue` |
| 物料注册表 | ✅ | `registry.ts` |
| 大表单虚拟滚动 | ❌ | README「已知边界」已承认 |
| npm 发布 / changesets / size-limit | ❌ | README 已承认 |
| 出码 codegen、协同编辑 | ❌ | 计划书列为 L3，可接受 |

---

## 3. 🔴 计划书里**不能写进简历**的数字（重点）

`PLAN.md` §8 与 §9 的数字是**立项时的预估**，实测不成立。直接抄会在面试追问时塌方。

| 计划书原数字 | 实测 | 处置 |
| --- | --- | --- |
| 单次输入重算 **480 ms → 9.4 ms（−98%）** | 500 字段：全量扫描 0.0126 ms → 依赖图 0.0023 ms，**约 5.4×** | **改成**：「单次触发的 effect 求值从 120 条降到 2 条（跳过 98.3%），传播耗时约为全量扫描的 1/5」 |
| 500 字段首屏 **2100 ms → 380 ms** | 未实现（无虚拟滚动） | **删除** |
| 首屏 DOM **8400 → 610** | 未实现 | **删除** |
| core gzip **12.8 KB** | **18.70 KB**（未开 minify） | 加 `minify: true` 后可到 **13.09 KB**（实测），再改数字 |
| 单测覆盖率 **91%（core 96%）** | **无法测量** —— 缺 `@vitest/coverage-v8`，且无 `test:coverage` 脚本 | 装依赖 + 加脚本后重测，或直接删掉这句 |
| 异步校验重复请求 **−78%** | 合并逻辑已实现，但无计数器暴露到 UI | 把 `asyncScheduled / asyncCoalesced` 显示出来，或删掉 |

**关键认知修正**：计划书把「跳过 98.3% 的 effect 求值」和「耗时降低 98%」当成一回事了。
这两者在实测上差很远 —— 因为依赖图传播本身有固定开销（Set 分配、排序、Map 读写、事件派发）。
**−98% 是跳过率，不是提速比。** 面试时把这两个概念分清，反而显得你真测过。

---

## 4. 实现缺陷清单（按优先级）

### P0 · 会被面试官当场问穿

**P0-1｜小表单上精准传播反而更慢，且没有任何地方说明**
120 字段 / 20 表达式时，依赖图传播 **0.46×** —— 比朴素全量扫描还慢一倍。
交叉点在 200～300 字段之间。
> 修法（选一）：
> ① core 加 `propagationStrategy: 'auto'`，节点数 < 阈值时直接走全量扫描；
> ② 或者把这条曲线做成图表放进 Playground「方法与边界」——
> **坦白边界比遮掩更有说服力**，面试官问「什么时候它不划算」时能直接答。

**P0-2｜没有 git 仓库 → 整个项目的立论前提不成立**
`PLAN.md` §0 的第一句卖点是「被真实项目依赖、可验证」。当前根目录无 `.git`，
于是 CI badge、GitHub Pages、提交历史、PR 记录全部为零，简历上放链接会 404。
> 修法：`git init` → 首次提交 → 推 GitHub → CI 里加 Pages 部署 job（现在只有 `upload-artifact`）。

### P1 · 影响真实性能体验

**P1-1｜数组行字段在任何一次 setValue 时全部重渲染**
`renderer-vue/src/useField.ts:18-21` —— 当传入 `localStatus` 时，**不做路径过滤，直接 `tick.value++`**。
而 `FieldNode.vue:74` 对所有非编译字段（即数组行子字段）都会传 `localStatus`。
结果：50 行 × 8 字段的数组，每敲一个字符，400 个组件全部重渲染。
> 修法：`localStatus` 分支也要过滤——只有当事件 `touched` 命中自己所在的行前缀时才 bump。

**P1-2｜局部表达式求值里对整表做了 6 次深拷贝**
`FieldNode.vue:43-44`：`form: props.form.getValues()` 与 `values: props.form.getValues()` 各调一次，
而 `getValues()` 内部是 `deepClone(values)`。**每条带表达式的数组行字段，每次渲染最多 6 次全表单深拷贝。**
> 修法：表达式是只读的，给 `evaluateExpression` 传一个非克隆的读视图（`form.getValue(path)` 取 `$self` 即可）。

**P1-3｜设计器每次 schema 变更都全量重编译**
`designer/src/useDesigner.ts:131` `const program = computed(() => compileSchema(schema.value))`。
500 字段 schema 冷编译约 8 ms，属性面板连续输入会掉帧。README 已承认，但影响体感。
> 修法：至少对 `updateSelected` 做 debounce；进一步按变更的 JSON Pointer 只重编译受影响子树。

**P1-4｜`diff()` 对数组退化为整体 replace**
`patch/operations.ts` 的 `diffInto` 不处理数组索引对齐，数组内移动一行/字段不会产生 `move` op，
而是整段 `replace` —— undo 粒度粗、Patch 体积大，与「为协同预留增量通道」的说法自相矛盾。
> 修法：加一层数组 LCS / 键对齐，产出 `move` 与按索引的 `replace`。

### P2 · 打磨项

- **可访问性**：`focus-visible` 只在 `designer.css`，`renderer.css` / `home.css` 缺失 —— 渲染器是给第三方嵌的，焦点圈必须有；`prefers-reduced-motion` 只在 `home.css`。
- **体积**：`tsdown.config.ts` 未开 `minify`。加上后 gzip **18.70 KB → 13.09 KB（−30%）**，正好兑现计划书的 12.8 KB 目标。
- **`propagate()` 是事实上的死代码**：只被 `graph.test.ts` 调用，store 走的是自己的内联逻辑（`create-store.ts:515-525`）。
  它作为公开 API 没问题，但 README/计划书把「propagate」讲成核心路径，读源码会对不上。建议在文档里说明它是 API 形态，store 用的是其内联变体。
- **README 缺计划书要求的三件套**：npm badge、CI badge、**顶部效果图**。竞品对比矩阵也只在站点首页，没进 README。

---

## 5. 修改优先级清单

### 本周必做（不做完别投简历）

| # | 事项 | 预计 |
| --- | --- | --- |
| 1 | `git init` + 首次提交 + 推 GitHub | 10 min |
| 2 | CI 加 GitHub Pages 部署 job（现在只有 upload-artifact） | 15 min |
| 3 | `tsdown.config.ts` 加 `minify: true` → 体积达标 | 2 min |
| 4 | 装 `@vitest/coverage-v8` + 加 `test:coverage` 脚本，测出真实覆盖率写进 README | 15 min |
| 5 | **修正 PLAN.md §8/§9 与首页的所有数字**（§3 表格照抄） | 30 min |
| 6 | 补 `LICENSE`（MIT） | 2 min |
| 7 | README 顶部加 badge + 效果图（`preview/index.html` 截一张）+ 竞品矩阵 | 20 min |

### 下周（决定能不能聊满 15 分钟）

| # | 事项 |
| --- | --- |
| 8 | P1-1 数组行字段精准订阅（改 `useField` 的 localStatus 分支） |
| 9 | P1-2 去掉 `getValues()` 深拷贝 |
| 10 | P0-1 的 crossover 曲线做成图表放进 Playground「方法与边界」—— 把短板变成谈资 |
| 11 | P1-3 设计器编译 debounce |
| 12 | 写技术文章：《我写了一个把 Schema 当源码编译的表单引擎》

### 有余力

13. P1-4 数组 diff 产出 `move` op
14. 长表单虚拟滚动（兑现计划书「DOM 8400 → 610」，但目前没做就别写）
15. `renderer-react` 骨架（哪怕 100 行，能坐实「框架无关」的说法）

---

## 6. 复验后可直接抄的简历话术（数字已全部替换为实测值）

> **schema-forge** · 作者 / 独立开发 · TypeScript + Vue 3 + pnpm Monorepo
>
> - 自研 Schema 驱动的表单引擎与可视化搭建平台，拆分为**零框架依赖的 core 编译内核**与 Vue3 适配层（约 300 行）。
> - 实现**表达式引擎**：手写词法分析与优先级爬升 parser，支持 `$form/$self/$index/$status` 作用域、三元、逻辑运算与白名单函数；不使用 `new Function`，规避 CSP `unsafe-eval`，并支持从 AST 精确收集字段依赖、报错定位到行列。
> - 设计**字段联动依赖图**：以字段与效果节点（`field.visible|disabled|required`）统一建图，Kahn 拓扑排序确定求值顺序，DFS 三色标记检测循环依赖并以编译期 issue 输出环路径。
> - 实现**精准脏值传播**：变更时沿正向边求下游闭包，按拓扑序仅重算受影响效果，`Uint32Array` 版本位图驱动字段级订阅。500 字段 / 120 联动下，单次触发的 effect 求值从 **120 条降到 2 条（跳过 98.3%）**，传播耗时约为全量扫描的 **1/5**（实测 5.4×，1000 字段时 30×）。
> - 基于 **RFC 6902 JSON Patch** 实现撤销重做（300ms 合并窗口、200 步上限），为协同编辑预留增量通道。
> - 属性面板**自举**：用引擎自身渲染物料的属性配置界面；实现 `InferFormData<S>` 类型推导与 v1.0→v1.1→v2.0 Schema 迁移链。
> - 70 条单测 + strict TS + `vue-tsc` 全量类型检查；CI 覆盖 typecheck / test / build。

**新增的高分追问应答**（复验发现的点，主动说出来更可信）：

| 追问 | 应答 |
| --- | --- |
| 你这个优化是不是所有场景都更快？ | 不是。我测过交叉点：120 字段时依赖图传播的固定开销反而比全量扫描慢一倍，200–300 字段之间才开始占优，1000 字段时约 30×。所以引擎里应该有个规模阈值，小表单直接走全量更划算 |
| 98% 到底指什么？ | 是 effect 求值的**跳过率**（120 → 2），不是耗时降幅。耗时降幅实测约 5 倍，因为传播本身有 Set 分配、排序、事件派发的固定开销。这两个数字我分开报 |
| 还没做什么？ | 虚拟滚动没做，所以我不宣称 DOM 节点数优化；npm 还没发；异步合并有计数器但没有实测百分比 |
