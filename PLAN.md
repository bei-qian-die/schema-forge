# schema-forge · 项目计划书

> **Schema 驱动的可视化搭建 / 表单引擎**
> 一句话定位：让「表单」从**写死的组件树**变成**一份可编译、可迁移、可校验的 Schema**，
> 并且这份 Schema 既能被**人手写**，也能被**画布拖拽**，两边永远同步。
>
> **2026-10-21 复验更新**：§8 已替换为仓库内可复跑的实测值；未实现的虚拟滚动、npm 发布、
> 协同编辑等条目均明确标注，不再作为性能承诺。历史预估数字已删除。

| 项 | 内容 |
| --- | --- |
| 项目代号 | `schema-forge` · 中文名「Schema 熔炉」 |
| 技术栈 | TypeScript 5 / Vue 3.5 / Vite 6 / pnpm Monorepo / Vitest / tsdown |
| 目标产出 | 3 个可发布 npm 包 + 在线 Designer + Playground 压测靶场 + 1 篇技术文章 |
| 建议周期 | 8 周（每周 ~15h，可与实习/毕设并行） |
| 简历定位 | **框架能力 / 低代码引擎方向**，证明你不是"会写页面"，而是"会做给别人写页面的东西" |

---

## 0. 为什么这个项目值得做（写给面试官看 30 秒）

"低代码表单"确实是应届生高频题目 —— **但 95% 的人做到"拖拽生成 JSON"就停了**。
那个版本面试官一天能看八份，因为它的技术含量止步于 `v-for` + `JSON.parse`。

真正值钱的是后面三层：

1. **联动** —— 字段之间不是独立的。"发票类型=企业" 才显示"纳税人识别号"。
   当表单有 200 个字段、120 条联动规则时，**谁先算、谁后算、有环怎么办、改一个值要重算多少** —— 这是**编译原理 + 图论**问题，不是 CRUD 问题。
2. **性能** —— 500 字段的表单，如果每次输入都全量扫描全部联动表达式，开销会随规则数量线性增长。
   要做**依赖收集 + 精准脏值传播**，只更新受影响的字段。
3. **工程化** —— Schema 会演进（v1 → v2 → v3），老数据不能崩，需要**迁移链**；
   设计器要撤销重做，需要 **JSON Patch**；属性面板自己也是用这套引擎渲染的，叫**自举（bootstrap）**。

这三件事，做完一件就能在面试里聊 15 分钟。

### 竞品差距矩阵（README 里放这张表 = 你研究过）

| 能力 | Formily | amis | form-render | **schema-forge** |
| --- | :---: | :---: | :---: | :---: |
| Schema 驱动渲染 | ✅ | ✅ | ✅ | ✅ |
| 可视化设计器 | 内部版 | ✅ | 基础 | ✅ |
| **core 框架无关（可换 React）** | ❌ 强绑 React | ❌ 绑 React | ❌ 绑 React | ✅ |
| **双向同步：手改 JSON 反驱画布** | 部分 | ❌ | ❌ | ✅ |
| **联动依赖图 + 拓扑求值 + 环检测** | 副作用钩子，无图 | 弱 | 弱 | ✅ ★ |
| **字段级精准更新（脏值传播）** | 响应式，粗粒度 | ❌ | ❌ | ✅ ★ |
| **TS 类型推导 `InferFormData<S>`** | 部分 | ❌ | ❌ | ✅ |
| **Schema 版本迁移链（migrate）** | ❌ | ❌ | ❌ | ✅ |
| **JSON Patch 撤销重做 + 协同预留** | ❌ | ❌ | ❌ | ✅ |
| **表达式沙箱（不用 `new Function`）** | ❌ | ❌ | ❌ | ✅ |
| **属性面板自举（用引擎渲染引擎）** | ❌ | ❌ | ❌ | ✅ |
| **500 字段性能实测数据** | — | — | — | ✅ |

**差异化一句话**：Formily 是"表单框架"，amis 是"页面配置器"；
schema-forge 是**一个把 Schema 当源码处理的编译器** —— 有词法、有 AST、有依赖图、有求值调度、有版本号。

---

## 0.5 关键流程（用户最该先想清楚的四条链路）

### 流程 A · 引擎运行时链路（编译期 / 运行期分离）

```
 ┌─ 编译期（只跑一次，结果可缓存） ──────────────────────────┐
 │  Schema JSON                                             │
 │    ↓ migrate()        版本迁移链 v1→v2→v3                 │
 │    ↓ parse()          协议校验 + 默认值填充 + key 去重     │
 │    ↓ compile()        每个表达式 → AST → 闭包 + deps 集合   │
 │    ↓ buildDepGraph()  字段依赖图 → Kahn 拓扑序 + 环检测    │
 └──────────────────────────────────────────────────────────┘
                            ↓ FormProgram（可序列化缓存）
 ┌─ 运行期（每次交互） ──────────────────────────────────────┐
 │  createStore(program)  value 树 / status 树 / version 位图 │
 │    ↓ 渲染  SchemaRenderer 按 layout 布局，字段级订阅       │
 │    ↓ 交互  setValue(path, v)                              │
 │          → dirty 入队 → 沿反向边求下游闭包 R                │
 │          → 只重算 R 内表达式 → 只 bump R 内 version         │
 │    ↓ 校验  同步规则立即跑 → 异步规则防抖 300ms 合并          │
 │    ↓ 提交  validateGate() 全量校验 → serialize()           │
 └──────────────────────────────────────────────────────────┘
```

**面试可讲**：编译期/运行期分离，是**所有**引擎类项目（Vue 模板编译、Babel、Vite 依赖预构建）的通用范式。
编译时把能算的都算完（AST、依赖、执行顺序），运行时只做"查表 + 传播"。

### 流程 B · 设计器编辑链路（不可变 + 补丁）

```
拖拽物料 → makeNode(type) 生成 FieldNode（默认 props，key 全局去重）
   ↓ diff 生成 RFC 6902 JSON Patch（add / replace / move / remove）
   ↓ applyPatch(immutable) 产出新 Schema（旧引用不变，便于 time-travel）
   ↓ pushUndo()  300ms 连续输入合并为一个 undo 单元
   ↓ recompile(增量) 只重编译受影响子树的表达式
   ↓ 画布精准重渲染（按 version 位图）+ Schema 面板同步高亮
   ↓ autosave  localStorage debounce 800ms（带 schemaVersion 标记）
```

**面试可讲**：为什么用 JSON Patch 而不是直接改对象 —— 因为 Patch 是可传输的最小差异，
将来做**多人协同编辑**（OT/CRDT）时，网络上传的就是 Patch，不用改架构。这是**前瞻性设计**。

### 流程 C · 联动配置链路（这是产品的灵魂）

```
选中字段「纳税人识别号」
  → 属性面板切到「联动」Tab
  → 添加规则：当 $form.invoiceType === 'COMPANY' 时 visible = true
  → 编译器在后台：解析表达式 → 收集 deps = ['invoiceType']
  → 建边 invoiceType → taxNo.visible
  → 拓扑排序得到求值序；若成环（A 依赖 B，B 依赖 A）→ 编辑器红线报错 + 打印环路径
  → 画布上两个字段之间画一条依赖连线（可视化依赖图，面试讲这个很加分）
```

### 流程 D · 工程化链路

```
pnpm monorepo + changesets 版本管理
  → vitest 单测（core 层零 DOM 依赖，纯函数好测，原定目标 ≥ 90%，当前行覆盖 85.1%）
  → tsdown 打包 ESM + CJS + d.ts（core 目标 gzip < 15 KB）
  → GitHub Actions：install → lint → test → build → size check → 发布 beta
  → Playground 自动部署 GitHub Pages（面试官可直接点开玩）
```

---

## 1. 核心能力（MVP 分三级，砍需求时从 L3 砍）

### L1 · 引擎内核（必须做）

| # | 能力 | 实现要点 |
| --- | --- | --- |
| 1.1 | Schema 协议 | `FormSchema` v2：fields 树 + layout 网格 + effects + rules |
| 1.2 | 表达式引擎 | 自研 lexer + 优先级爬升 parser + 求值器（**不用 `new Function`**） |
| 1.3 | 依赖收集 | 遍历 AST 抽取 `$form.a.b` 路径 → `Set<string>` |
| 1.4 | 依赖图 | 有向图 + Kahn 拓扑排序 + DFS 三色环检测 |
| 1.5 | 状态树 | `value / visible / disabled / errors / version` 五棵树，扁平路径索引 |
| 1.6 | 校验引擎 | JSON Schema 子集 + 自定义规则 + 异步防抖 + 错误树定位 |
| 1.7 | 精准更新 | 脏值沿反向边传播，只 bump 下游字段 version |

### L2 · 渲染与设计器（核心竞争力）

| # | 能力 | 实现要点 |
| --- | --- | --- |
| 2.1 | Vue3 渲染器 | `SchemaRenderer` 递归 + `provide/inject` 上下文 + 字段级 `shallowRef` 订阅 |
| 2.2 | 布局容器 | Grid（12 栅格）/ Card / Tabs / Collapse / ArrayTable（增删行） |
| 2.3 | 大表单虚拟化 | 路线图：虚拟滚动 + 折叠容器懒挂载（未实现） |
| 2.4 | 设计器画布 | HTML5 DnD + 放置指示线 + 选中框 + 键盘操作（上下移动/复制/删除） |
| 2.5 | 属性面板**自举** | 属性面板自己也是一份 Schema，用 core 渲染 —— 引擎描述引擎 |
| 2.6 | 撤销重做 | JSON Patch 双栈，300ms 合并窗口，上限 200 步 |
| 2.7 | Schema 双向同步 | JSON 编辑器（CodeMirror 可选）改动实时反驱画布，语法错误行级提示 |
| 2.8 | 类型推导 | `InferFormData<S>` 类型体操，让 `form.company.taxNo` 有提示 |

### L3 · 锦上添花（有余力再做）

- Schema 版本迁移链 + `schema-forge migrate` CLI
- 依赖图可视化面板（DAG 力导向图，环标红）
- 物料市场（第三方 npm 注册 `registerMaterial()`）
- 协同编辑（Yjs CRDT，复用 Patch 通道）
- 出码：Schema → Vue SFC 源码（`schema-forge codegen`）

---

## 2. 架构设计（pnpm monorepo）

```
schema-forge/
├─ packages/
│  ├─ core/                       # 纯 TS，零框架、零 DOM 依赖
│  │  └─ src/
│  │     ├─ protocol/
│  │     │  ├─ schema.ts          # FormSchema / FieldNode / Effect 类型
│  │     │  ├─ infer.ts           # ★ InferFormData<S> 类型推导
│  │     │  └─ migrate/           # v1→v2→v3 迁移链
│  │     ├─ expression/
│  │     │  ├─ lexer.ts           # 词法：数字/字符串/路径/操作符
│  │     │  ├─ parser.ts          # 优先级爬升 → AST
│  │     │  ├─ evaluate.ts        # 作用域求值（白名单函数）
│  │     │  └─ deps.ts            # AST → 依赖路径集合
│  │     ├─ graph/
│  │     │  ├─ dep-graph.ts       # 建图 + 反向邻接表
│  │     │  ├─ toposort.ts        # Kahn 拓扑排序
│  │     │  └─ cycle.ts           # DFS 三色标记环检测
│  │     ├─ store/
│  │     │  ├─ create-store.ts    # 值树 + 状态树 + version 位图
│  │     │  ├─ propagate.ts       # ★ 脏值传播调度器
│  │     │  └─ path.ts            # 'a.b[0].c' ↔ 对象读写
│  │     ├─ validate/
│  │     │  ├─ engine.ts          # 同步/异步/防抖/错误树
│  │     │  └─ rules.ts           # required/len/range/pattern/自定义
│  │     ├─ patch/                # RFC 6902 JSON Patch + undo/redo 栈
│  │     └─ registry.ts           # 物料注册表（type → MaterialSpec）
│  ├─ renderer-vue/               # Vue3 适配层（薄，< 400 行）
│  │  └─ src/
│  │     ├─ SchemaRenderer.vue
│  │     ├─ FieldNode.vue         # 只订阅自己路径的 version
│  │     ├─ useField.ts           # core store → Vue ref 桥接
│  │     └─ VirtualList.vue
│  ├─ designer/                   # 可视化设计器（依赖 renderer-vue）
│  │  └─ src/
│  │     ├─ panels/{Material,Canvas,Props,Schema,Deps}.vue
│  │     ├─ composables/useDnD.ts
│  │     └─ props-schema/         # ★ 属性面板自己的 Schema（自举）
│  ├─ materials/                  # 内置物料（input/select/date/number/switch/grid/card/array）
│  └─ playground/                 # 演示 + 500 字段压测靶场
├─ .github/workflows/ci.yml
└─ README.md
```

**分层理由（面试必背）**：

> `core` 不认识 Vue，只认识「一份 Schema + 一组数据」。
> 它是一台**纯函数编译器**：`(schema, data) → (可见性, 校验错误, 值)`。
> 所以 `renderer-vue` 只是 300 行的适配层，将来接 React 只需再写一层 `renderer-react`。
> 这是**依赖倒置**——低代码引擎最容易被问死的问题就是"绑死框架"。

---

## 3. ★ 核心壁垒：表达式依赖图 + 拓扑求值 + 精准脏值传播

这是整个项目**唯一有技术壁垒**的地方，也是你跟其它"表单生成器"拉开身位的一段。

### 3.1 问题从哪来

朴素做法：每次 `setValue` 后，把所有字段的 `visible` / `disabled` 表达式全跑一遍。

- 500 字段 × 120 条联动 → 每次输入全量扫描 120 条表达式，且求值顺序取决于遍历序；
- 联动有先后顺序（A 的值决定 B 可见，B 可见又决定 C 必填），全量重算时**顺序是遍历序**，结果不稳定；
- 出现循环依赖（A 依赖 B、B 依赖 A）时会静默算错，或者栈溢出。

### 3.2 算法流程

```
Input: 编译后的表达式列表 E = [{target, ast, deps, fn}]

1. 建图 G：
     节点 = 字段路径（'invoice.type'、'taxNo.visible'…）
     边   = dep → target      （dep 变化会影响 target）
     同时建 reverse 邻接表（target → 所有 dep 的反向，即「谁依赖我」）

2. Kahn 拓扑排序：
     inDeg = 0 的节点入队 → 出队时把后继 inDeg-- → 得到 evalOrder
     若 evalOrder.length < 节点数 ⇒ 剩余节点构成环

3. 环检测（DFS 三色）：
     white(未访问) → gray(在栈) → black(已完成)
     遇到 gray 邻居 ⇒ 回溯栈打印环路径：
     CircularDependency: taxNo.visible → invoice.type → taxNo.visible

4. 运行时 setValue(p)：
     R = reverseBFS(p)             // p 的下游闭包（含自身）
     for node of evalOrder ∩ R:    // 只按拓扑序重算 R 内的节点
        重新求值 → 若结果变化则 bump version[node]
     version 用 Uint32Array 位图存，Vue 侧靠它做 computed 失效

5. 精准渲染：
     FieldNode.vue 只订阅 version[key]，version 没变 → diff 直接跳过
```

### 3.3 关键代码片段（README 里放这段最有说服力）

```ts
// packages/core/src/graph/toposort.ts
export interface DepGraph {
  nodes: string[]
  adj: Map<string, Set<string>>       // dep -> targets
  rev: Map<string, Set<string>>       // target -> deps
}

/** Kahn 拓扑排序；返回值不含的节点即为环内节点 */
export function toposort(g: DepGraph): { order: string[]; cyclic: string[] } {
  const indeg = new Map<string, number>(g.nodes.map((n) => [n, 0]))
  for (const [, tos] of g.adj) for (const t of tos) indeg.set(t, (indeg.get(t) ?? 0) + 1)

  const q: string[] = g.nodes.filter((n) => (indeg.get(n) ?? 0) === 0)
  const order: string[] = []

  for (let i = 0; i < q.length; i++) {
    const n = q[i]
    order.push(n)
    for (const t of g.adj.get(n) ?? []) {
      const d = (indeg.get(t) ?? 0) - 1
      indeg.set(t, d)
      if (d === 0) q.push(t)
    }
  }
  const cyclic = g.nodes.filter((n) => !order.includes(n))
  return { order, cyclic }
}

/** ★ 脏值传播：只重算 p 的下游闭包，且严格按拓扑序 */
export function propagate(p: string, g: DepGraph, order: string[], version: Map<string, number>) {
  const down = new Set<string>([p])
  const stack = [p]
  while (stack.length) {
    const cur = stack.pop()!
    for (const t of g.adj.get(cur) ?? []) {
      if (!down.has(t)) { down.add(t); stack.push(t) }
    }
  }
  const touched: string[] = []
  for (const n of order) {            // 顺序 = 拓扑序，保证求值正确
    if (!down.has(n)) continue
    version.set(n, (version.get(n) ?? 0) + 1)
    touched.push(n)
  }
  return touched                       // 交给 Vue 层做精准 patch
}
```

### 3.4 表达式引擎：为什么不用 `new Function`

| 维度 | `new Function` | 自研 parser |
| --- | --- | --- |
| CSP `unsafe-eval` | 被禁（很多内网/政企项目直接白屏） | ✅ 可用 |
| 静态依赖收集 | 只能正则猜，会漏 | ✅ 从 AST 精确抽 |
| 报错定位 | 只有 SyntaxError | ✅ 能给到行列号 |
| 性能 | 每次重新编译 | ✅ AST 编译一次，换 scope 复用 |
| 安全 | 原型链污染风险 | ✅ 白名单函数 + 路径只读作用域 |

支持语法（够用即止，不要贪）：

```
$form.a.b      $self      $index      $values
'str'  123  true  null
=== !== > >= < <=   && || !   ?:   ()
白名单函数：len() includes() empty() sum() date() upper() lower()
```

### 3.5 性能优化清单（已按实现状态回填）

| 手段 | 状态 / 实测 |
| --- | --- |
| 表达式 AST 编译一次，运行期只换 scope | 已实现；交互期不重复解析 |
| 反向边 BFS 求下游闭包，而非全量 | 已实现；500 字段 / 120 联动单次只求值 2 条 effect（跳过 98.3%） |
| `Uint32Array` version 位图 | 已实现；字段 key → 下标固定映射，O(1) 读写 |
| 异步校验防抖 + 同 key 请求合并 | 已实现 300ms 防抖；暴露 `asyncScheduled` / `asyncCoalesced` 计数器，未做端到端请求统计 |
| 依赖图编译缓存 | 未实现；设计器对编译做了 150ms debounce |
| 大表单虚拟滚动 + 折叠容器懒挂载 | **未实现**，不宣称 DOM 节点数优化 |

> 依赖图传播有建图、闭包分配、排序和事件派发的固定开销。基准曲线显示：小表单上它可能慢于全量扫描，
> 字段数增大后才占优。站点「方法与边界」里保留现场测量的 crossover 图，不把短板藏起来。

---

## 4. ★ 第二壁垒：类型推导 + 属性面板自举

### 4.1 `InferFormData<S>` —— 让 Schema 有类型

```ts
type S = typeof schema                        // as const
type Data = InferFormData<S>                  // { company: { taxNo: string }, amount: number }

const form = createForm(schema)
form.values.company.taxNo                     // ✅ 有提示、有类型
form.values.company.taxX                      // ❌ 编译报错
```

实现要点：递归映射 `FieldNode` 元组 → `type` 查物料表的 `ValueType` → 按 `key` 中的 `.` 做路径合并。
这一段是**类型体操**，放 README 的 GIF 演示效果最好。

### 4.2 属性面板自举（bootstrap）

物料声明自己的属性**也是一份 Schema**：

```ts
const InputMaterial: MaterialSpec = {
  type: 'input',
  meta: { title: '单行文本', group: '基础', icon: 'text' },
  valueType: 'string',
  // ★ 属性面板用同一套引擎渲染这份 propsSchema
  propsSchema: {
    fields: [
      { key: 'placeholder', type: 'input',  label: '占位提示' },
      { key: 'maxlength',   type: 'number', label: '最大长度' },
      { key: 'clearable',   type: 'switch', label: '可清空',
        visible: "$form.type !== 'textarea'" },   // 属性面板里也有联动！
    ],
  },
}
```

**面试金句**："我用 schema-forge 渲染了 schema-forge 自己的属性面板 —— 这既保证了引擎表达力足够（
连自己都描述得了），也在开发过程中持续 dogfooding，暴露了大大小小 20 多个 API 设计问题。"

---

## 5. Schema 协议设计（v2）

```ts
interface FormSchema {
  version: '2.0'
  id: string
  layout: { type: 'grid'; columns: 12; gutter: 16 }
  fields: FieldNode[]
}

interface FieldNode {
  key: string                       // 'company.taxNo'，点号即嵌套
  type: string                      // 物料 type
  label: string
  props?: Record<string, unknown>
  layout?: { colSpan: number; rowSpan?: number; offset?: number }
  visible?: string | boolean        // 表达式字符串
  disabled?: string | boolean
  required?: string | boolean
  defaultValue?: unknown
  rules?: RuleSpec[]
  children?: FieldNode[]            // 容器 / 数组子项
}

interface RuleSpec {
  kind: 'required' | 'pattern' | 'len' | 'range' | 'async-remote' | 'custom'
  message: string
  when?: string                     // 条件校验
  [k: string]: unknown
}
```

---

## 6. 使用示例（README Quick Start）

```ts
import { createForm } from '@schema-forge/core'
import { SchemaRenderer } from '@schema-forge/renderer-vue'
import { basicMaterials } from '@schema-forge/materials'

registerMaterials(basicMaterials)

const form = createForm(schema, {
  effects: true,        // 开启依赖图求解
  validateOn: 'blur',
  asyncDebounce: 300,
})

form.setValue('invoice.type', 'COMPANY')   // 自动联动显示 taxNo
await form.validate()                      // → ErrorTree
form.serialize()                           // → 提交数据
```

```vue
<template>
  <SchemaRenderer :form="form" :schema="schema" @submit="onSubmit" />
</template>
```

---

## 7. 8 周排期（可直接写进简历的「项目周期」）

| 周次 | 目标 | 交付物 | 验收标准 |
| --- | --- | --- | --- |
| W1 | 协议设计 + monorepo 脚手架 | `core/` 骨架 + vitest + tsdown | 协议文档 + `pnpm build` 绿 |
| W2 | **表达式引擎**（lexer/parser/eval/deps） | `expression/*` + 17 单测 | 支持全部语法，错误有行列号 |
| W3 | **依赖图 + 拓扑排序 + 环检测 + 传播** | `graph/*` + `propagate.ts` | 环检测用例通过，传播节点数正确 |
| W4 | 状态树 + 校验引擎 | `store/*` + `validate/*` | 异步防抖合并有单测 |
| W5 | Vue3 渲染器 + 布局容器 | `renderer-vue/` | 六种布局渲染通过；虚拟滚动未实现 |
| W6 | **设计器**：拖拽 + Patch + undo + 属性面板自举 | `designer/` | 拖拽/撤销/重做闭环可用 |
| W7 | 迁移链 + 类型推导 + 压测优化 | `migrate/` + `infer.ts` | 基准面板可复现 2 / 120 effect 求值 |
| W8 | Playground + CI Pages job + 技术文章 | 静态站点 + 部署 job + `docs/` | 本地构建通过；Pages 需在 GitHub 仓库启用 |

**时间不够时的保命组合**：**W2 + W3 + W6**。表达式引擎和依赖图是技术高峰，设计器是视觉冲击点。
砍掉 W7 的迁移链和类型推导不影响主线。

---

## 8. 可量化成果（2026-10-21 实测回填）

基准由 `packages/playground/src/components/BenchmarkPanel.vue` 在浏览器里现场运行：
500 字段 / 120 条 effect，1000 次 × 5 轮取中位数，每次测量前预热 500 次；对照组同样预编译 AST。

| 指标 | 实测 | 说明 |
| --- | --- | --- |
| 单次触发 effect 求值 | **120 条 → 2 条**（跳过 **98.3%**） | 500 字段 / 120 联动，触发 `f000` |
| 传播耗时 | 随机器变化；500 字段下约为全量扫描的 **4–7×** | 站点实时测量；120 字段时可能低于 1×，交叉曲线如实展示 |
| `core` ESM 产物 | **35.4 KB** minified · **12.6 KB** gzip | 未 minify：69.9 KB / 18.7 KB gzip |
| 单测 | **71 条 / 5 文件** | `pnpm test` |
| core 覆盖率 | 行 **85.1%** · 分支 **74.0%** · 函数 **85.3%** | `pnpm test:coverage`（v8） |
| 500 字段首屏渲染 / DOM 节点 | **未测量** | 虚拟滚动未实现，不宣称 |
| 异步校验重复请求 | **未测量** | 已实现防抖与同 key 合并，仅暴露计数器 |
| undo/redo 200 步内存 | **未测量** | 不宣称具体数值 |

> **关键区分**：98.3% 是 effect 求值的**跳过率**，不是耗时降幅。传播本身有闭包分配、排序、
> 事件派发的固定开销，所以耗时加速比远小于 98.3%，且小表单会亏。这两个数字必须分开报。

---

## 9. 简历话术（可直接抄）

> **schema-forge** · 作者 / 独立开发 · TypeScript + Vue 3 + Vite + pnpm Monorepo
>
> - 自研 Schema 驱动的表单引擎与可视化搭建平台，拆分为**框架无关的 core 编译内核**与 Vue 3 适配层（约 300 行）；core 无运行时依赖。
> - 实现**表达式引擎**：手写词法分析与优先级爬升 parser，支持 `$form/$values/$self/$index/$status` 作用域、三元、逻辑运算与 7 个白名单函数；
>   不使用 `new Function`，规避 CSP `unsafe-eval`，并支持从 AST 精确收集字段依赖、报错定位到行列。
> - 设计**字段联动依赖图**：以字段值与 effect 节点（`field.visible|disabled|required`）统一建图，Kahn 拓扑排序确定求值顺序，
>   DFS 三色标记检测循环依赖并以编译期 issue 输出环路径。
> - 实现**精准脏值传播**：变更时沿正向边求下游闭包，按拓扑序仅重算受影响 effect，`Uint32Array` 版本位图驱动字段级订阅。
>   500 字段 / 120 联动下，单次触发的 effect 求值从 **120 条降到 2 条（跳过 98.3%）**，传播耗时约为全量扫描的 **4–7×**（站点现场测量，随机器变化）。
> - 基于 **RFC 6902 JSON Patch** 实现撤销重做（300ms 合并窗口、200 步上限），为协同编辑预留增量通道。
> - 属性面板**自举**：用引擎自身渲染物料的属性配置界面；实现 `InferFormData<S>` 类型推导与 v1.0→v1.1→v2.0 Schema 迁移链。
> - **71 条单测** + strict TS + `vue-tsc` 全量类型检查；core 行覆盖率 85.1%；CI 覆盖 typecheck / test / build，并含 GitHub Pages 部署 job。

**面试高频追问准备清单**

| 追问 | 应答要点 |
| --- | --- |
| 和 Formily 有什么区别？ | Formily 是响应式表单框架、强绑 React；我把 Schema 当源码编译，core 零框架依赖、可换渲染层，且多了依赖图/环检测/迁移链 |
| 为什么不用 `new Function` / eval？ | CSP unsafe-eval 会直接白屏；而且无法从字符串精确抽依赖，只能正则猜 |
| 循环依赖怎么处理？ | 建图后 Kahn 拓扑，剩余节点即环；再用 DFS 三色回溯打印环路径，在编辑器里红线报错，不静默算错 |
| 精准更新怎么做到？ | 版本号位图 `Uint32Array`，字段组件只订阅自己的 version；version 不变则 Vue diff 直接跳过 |
| 大表单为什么卡？ | 三个来源：全量重算、全量渲染、校验风暴。已解决全量重算与异步校验风暴；虚拟滚动未实现，不宣称 DOM 指标 |
| 精准传播是不是永远更快？ | 不是。120 字段时固定开销可能让传播慢于全量扫描，数百字段后才占优；站点方法与边界里有现场 crossover 曲线 |
| 撤销重做为什么用 Patch？ | 增量最小、可传输、可序列化；将来接 Yjs 做协同时不用改架构 |
| key 冲突怎么办？ | `makeNode()` 生成时查全局索引，重名自动加后缀 `taxNo_2`，并在属性面板标黄 |
| Schema 升级老数据崩了怎么办？ | migrate 迁移链：`v1→v2→v3` 逐级函数，跑完写回 `version` 字段，失败保留原值并告警 |
| 怎么测纯逻辑？ | core 零 DOM 依赖，vitest + fixture schema；当前 71 条单测，含环检测/拓扑序/异步校验用例 |

---

## 10. 立项 Checklist

- [x] pnpm workspace 搭建（**未引入 changesets**，发布前再补）
- [x] 先写 `protocol/schema.ts` 类型，再写任何实现（协议先行）
- [x] vitest + fixture：默认发票 Schema / 500 字段基准 / 带环的坏 Schema
- [x] core 打包用 `tsdown` + `minify`，ESM gzip 12.6 KB（**size-limit 未接入**）
- [x] README 顶部：项目 badge + 效果图 + 30 秒 Quick Start
- [x] Playground 可静态构建，CI 含 GitHub Pages 部署 job（**仓库推送与 Pages 启用待完成**）
- [x] 技术文章：《我写了一个把 Schema 当源码编译的表单引擎》（`docs/`）
- [x] Designer 所在站点内置「500 字段基准」与 crossover 曲线，可现场演示
