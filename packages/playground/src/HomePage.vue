<script setup lang="ts">
import { computed } from 'vue'
import { compileSchema } from '@schema-forge/core'
import LiveDemo from './components/LiveDemo.vue'
import BenchmarkPanel from './components/BenchmarkPanel.vue'
import { demoSchema } from './demo'

const program = compileSchema(demoSchema)
const orderPosition = new Map(program.order.map((id, index) => [id, index]))

const orderedEffects = program.effects
  .filter((effect) => !effect.literal && effect.expression)
  .sort((a, b) => (orderPosition.get(a.id) ?? 0) - (orderPosition.get(b.id) ?? 0))
  .map((effect) => ({
    id: effect.id,
    order: orderPosition.get(effect.id) ?? 0,
    deps:
      effect.expression?.dependencies.map((dep) =>
        dep.kind === 'status' ? `$status.${dep.path}` : dep.path,
      ) ?? [],
  }))

const traceEffects = orderedEffects.slice(0, 4)

const metrics = [
  {
    label: '数据字段',
    value: String(program.stats.leafCount),
    note: `${program.stats.fieldCount} 个编译节点`,
  },
  {
    label: '联动表达式',
    value: String(program.stats.expressionCount),
    note: 'AST 静态抽取依赖',
  },
  {
    label: '依赖边',
    value: String(program.stats.edgeCount),
    note: `${program.stats.nodeCount} 个图节点`,
  },
  {
    label: 'core 运行时依赖',
    value: '0',
    note: '框架无关 · 无 DOM',
  },
]

const trace = computed(() => [
  { step: 'migrate', detail: 'v2.0 · chain ok' },
  { step: 'parse', detail: `${program.stats.expressionCount} expressions → AST` },
  { step: 'graph', detail: `${program.stats.nodeCount} nodes / ${program.stats.edgeCount} edges` },
  { step: 'toposort', detail: `${program.stats.orderLength} nodes ordered` },
  { step: 'cycle', detail: `${program.stats.cycleCount} cycles` },
])

const matrixRows = [
  {
    label: 'Schema 驱动渲染',
    cells: [
      { text: '✓', tone: 'yes' },
      { text: '✓', tone: 'yes' },
      { text: '✓', tone: 'yes' },
      { text: '✓', tone: 'own' },
    ],
  },
  {
    label: '可视化设计器',
    cells: [
      { text: '生态', tone: 'partial' },
      { text: '✓', tone: 'yes' },
      { text: '基础', tone: 'partial' },
      { text: '✓', tone: 'own' },
    ],
  },
  {
    label: 'Vue 3 原生栈',
    cells: [
      { text: '部分', tone: 'partial' },
      { text: '—', tone: 'none' },
      { text: '—', tone: 'none' },
      { text: '✓', tone: 'own' },
    ],
  },
  {
    label: '联动依赖图 + 环路径',
    cells: [
      { text: '未强调', tone: 'none' },
      { text: '—', tone: 'none' },
      { text: '—', tone: 'none' },
      { text: '✓', tone: 'own' },
    ],
  },
  {
    label: '下游闭包 + 版本位图',
    cells: [
      { text: '响应式追踪', tone: 'partial' },
      { text: '—', tone: 'none' },
      { text: '—', tone: 'none' },
      { text: '✓', tone: 'own' },
    ],
  },
  {
    label: 'RFC 6902 撤销 / 重做',
    cells: [
      { text: '未强调', tone: 'none' },
      { text: '未强调', tone: 'none' },
      { text: '未强调', tone: 'none' },
      { text: '✓', tone: 'own' },
    ],
  },
  {
    label: 'Schema 版本迁移链',
    cells: [
      { text: '—', tone: 'none' },
      { text: '—', tone: 'none' },
      { text: '—', tone: 'none' },
      { text: '✓', tone: 'own' },
    ],
  },
  {
    label: '属性面板自举',
    cells: [
      { text: '—', tone: 'none' },
      { text: '—', tone: 'none' },
      { text: '—', tone: 'none' },
      { text: '✓', tone: 'own' },
    ],
  },
  {
    label: 'TS 类型推导',
    cells: [
      { text: '部分', tone: 'partial' },
      { text: '—', tone: 'none' },
      { text: '—', tone: 'none' },
      { text: '✓', tone: 'own' },
    ],
  },
]

const testFiles = [
  { name: 'expression.test.ts', count: 17, note: 'lexer / parser / AST / 依赖 / 沙箱' },
  { name: 'graph.test.ts', count: 9, note: 'Kahn / 三色环 / 闭包 / 传播' },
  { name: 'patch.test.ts', count: 11, note: 'RFC 6902 / diff / undo 合并' },
  { name: 'protocol.test.ts', count: 14, note: '迁移链 / 规范化 / 类型推导' },
  { name: 'store.test.ts', count: 20, note: '联动 / 校验 / 异步 / 序列化 / 只读视图' },
]

const roadmap = [
  { week: 'W1', title: '协议设计 + monorepo 脚手架', status: 'done', note: 'FormSchema v2.0 · pnpm workspace' },
  { week: 'W2', title: '表达式引擎', status: 'done', note: 'lexer / parser / eval / deps' },
  { week: 'W3', title: '依赖图 + 拓扑 + 环检测', status: 'done', note: 'Kahn / DFS 三色 / 传播' },
  { week: 'W4', title: '状态树 + 校验引擎', status: 'done', note: '同步规则 / 异步合并 / serialize' },
  { week: 'W5', title: 'Vue 3 渲染器', status: 'partial', note: '已落地；虚拟滚动未做' },
  { week: 'W6', title: '设计器', status: 'done', note: '拖拽 / Patch / undo / 自举面板 / LogicBoard' },
  { week: 'W7', title: '迁移链 + 类型推导 + 压测', status: 'done', note: 'migrate v1→2.0 / InferFormData / 基准面板' },
  { week: 'W8', title: 'Playground + CI/Pages + 文章', status: 'partial', note: 'Playground、CI/Pages 与技术文章已就绪；npm 发布不在计划内' },
]

const statusLabel: Record<string, string> = {
  done: '已完成',
  partial: '部分完成',
}

const testTotal = testFiles.reduce((total, file) => total + file.count, 0)
</script>

<template>
  <div class="lp" id="top">
    <header class="lp-top">
      <div class="shell lp-top__in">
        <a class="lp-brand" href="#top" aria-label="schema-forge 首页">
          <span class="lp-brand__mark">sf</span>
          <span class="lp-brand__name">schema<em>·</em>forge</span>
        </a>

        <nav class="lp-nav" aria-label="页面导航">
          <a href="#why">定位</a>
          <a href="#flow">链路</a>
          <a href="#runtime">运行时</a>
          <a href="#architecture">架构</a>
          <a href="#algorithm">算法</a>
          <a href="#engineering">工程化</a>
        </nav>

        <a class="lp-top__cta" href="#/designer">
          打开设计器
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </header>

    <main>
      <!-- ───────────────────────── hero ───────────────────────── -->
      <section class="lp-hero">
        <div class="shell lp-hero__grid">
          <div class="lp-hero__copy">
            <p class="lp-eyebrow">
              <i aria-hidden="true"></i>
              Schema-driven · Compiler mindset
            </p>

            <h1 class="lp-hero__title">
              <span class="lp-hero__zh">Schema 熔炉</span>
              <span>把表单</span>
              <span>当<em>源码</em>编译</span>
            </h1>

            <p class="lp-hero__lede">
              一份 Schema，既是运行时的数据契约，也是画布上的搭建产物。
              中间那层不是模板字符串 —— 是手写词法分析、依赖图、拓扑求值，
              以及按下游闭包执行的精准脏值传播。
            </p>

            <div class="lp-hero__actions">
              <a class="lp-btn lp-btn--primary" href="#/designer">
                打开可视化设计器
                <span aria-hidden="true">↗</span>
              </a>
              <a class="lp-btn lp-btn--ghost" href="#runtime">
                试跑运行时
                <span aria-hidden="true">↓</span>
              </a>
            </div>

            <dl class="lp-metrics">
              <div v-for="metric in metrics" :key="metric.label">
                <dt>{{ metric.label }}</dt>
                <dd>{{ metric.value }}</dd>
                <span>{{ metric.note }}</span>
              </div>
            </dl>
          </div>

          <div class="lp-stack" aria-label="编译产物示意">
            <article class="lp-card lp-card--schema">
              <div class="lp-card__cap">
                <span>form.schema.json</span>
                <span>v2.0</span>
              </div>
              <pre class="lp-code lp-code--json"><span class="p">{</span>
  <span class="k">"key"</span><span class="p">:</span> <span class="s">"passport.no"</span><span class="p">,</span>
  <span class="k">"type"</span><span class="p">:</span> <span class="s">"input"</span><span class="p">,</span>
  <span class="k">"visible"</span><span class="p">:</span>
    <span class="s">"$form.trip.type === 'INTERNATIONAL'"</span><span class="p">,</span>
  <span class="k">"required"</span><span class="p">:</span>
    <span class="s">"$status.passport.no.visible"</span>
<span class="p">}</span></pre>
              <p class="lp-card__note">一条表达式能依赖另一条 effect 的结果。</p>
            </article>

            <article class="lp-card lp-card--trace">
              <div class="lp-card__cap">
                <span>compile(schema) · 本页实时</span>
                <b>✓ {{ program.stats.cycleCount }} cycles</b>
              </div>

              <ol class="lp-trace">
                <li v-for="(step, index) in trace" :key="step.step">
                  <span class="lp-trace__no">{{ String(index + 1).padStart(2, '0') }}</span>
                  <code>{{ step.step }}</code>
                  <span class="lp-trace__detail">{{ step.detail }}</span>
                </li>
              </ol>

              <div class="lp-trace__effects">
                <p class="lp-trace__label">实际求值边 · 拓扑序片段</p>
                <p v-for="effect in traceEffects" :key="effect.id" class="lp-trace__edge">
                  <code>{{ effect.deps.join(' + ') }}</code>
                  <span>→</span>
                  <code>{{ effect.id }}</code>
                </p>
              </div>
            </article>

            <div class="lp-stamp" aria-hidden="true">
              <b>v2.0</b>
              <span>COMPILED<br />0 CYCLES</span>
            </div>
          </div>
        </div>

        <div class="shell">
          <div class="lp-pipe" aria-label="编译流水线">
            <span v-for="stage in ['migrate', 'normalize', 'lexer', 'parser', 'deps', 'graph', 'Kahn', 'runtime']" :key="stage">
              <i aria-hidden="true"></i>{{ stage }}
            </span>
            <b>{{ program.stats.compileMs < 1 ? '< 1' : program.stats.compileMs.toFixed(1) }} ms · 本机编译</b>
          </div>
        </div>
      </section>

      <!-- ───────────────────────── 01 定位 ───────────────────────── -->
      <section class="lp-section" id="why">
        <div class="shell">
          <header class="lp-head">
            <p class="lp-sec-no">§ 01 — 定位</p>
            <h2>不是又一个<br />拖拽表单生成器</h2>
            <p>
              低代码表单是高频练手题，真正稀缺的是底下那层工程能力。
              这张表只描述本项目的关注点，不是竞品评测。
            </p>
          </header>

          <div class="lp-matrix-wrap">
            <table class="lp-matrix">
              <thead>
                <tr>
                  <th>能力 / 取向</th>
                  <th>Formily</th>
                  <th>amis</th>
                  <th>form-render</th>
                  <th class="is-own">schema-forge</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in matrixRows" :key="row.label">
                  <td>{{ row.label }}</td>
                  <td v-for="(cell, index) in row.cells" :key="index" :class="[cell.tone, { 'is-own': index === 3 }]">
                    {{ cell.text }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="lp-footnote">
            竞品信息基于公开文档与常见用法，仅用于表达产品定位；生态成熟度、功能深度与稳定性均需以各项目现状为准。
          </p>

          <div class="lp-callout">
            <b>一句话定位</b>
            <p>
              Formily 是响应式表单框架，amis 是页面配置器，而 schema-forge 把 Schema
              当源码处理：有 AST、有依赖图、有求值调度、有版本号，也有迁移链。
            </p>
          </div>
        </div>
      </section>

      <!-- ───────────────────────── 02 四条链路 ───────────────────────── -->
      <section class="lp-section lp-section--tint" id="flow">
        <div class="shell">
          <header class="lp-head lp-head--row">
            <div>
              <p class="lp-sec-no">§ 02 — 四条链路</p>
              <h2>流程决定架构</h2>
            </div>
            <p>
              四条链路全部在仓库里有对应实现与入口。设计器不是截图，
              是可以点开操作的 Vue 应用。
            </p>
          </header>

          <div class="lp-flows">
            <article class="lp-flow">
              <div class="lp-flow__top">
                <span class="lp-flow__id">A</span>
                <span class="lp-tag lp-tag--ok">已实现 · 有单测</span>
              </div>
              <h3>引擎运行时</h3>
              <p class="lp-flow__note">编译期能算的，绝不拖到交互期。</p>
              <ol>
                <li><code>migrateSchema()</code> 逐级迁移到 v2.0</li>
                <li>规范化：默认值、key 去重、布局补全</li>
                <li><code>compileExpression()</code> → AST + 静态依赖</li>
                <li><code>buildDepGraph()</code> → Kahn 拓扑 / DFS 环检测</li>
                <li><code>createForm()</code> 状态树、校验、序列化</li>
              </ol>
              <p class="lp-flow__gain">交互期只沿反向边求下游闭包，不再扫描整张表单。</p>
            </article>

            <article class="lp-flow">
              <div class="lp-flow__top">
                <span class="lp-flow__id">B</span>
                <span class="lp-tag lp-tag--ok">已实现</span>
              </div>
              <h3>设计器编辑</h3>
              <p class="lp-flow__note">编辑不是改对象，而是生成可传输的增量。</p>
              <ol>
                <li>拖入物料 → <code>makeFieldNode()</code> 补默认 props</li>
                <li><code>diff()</code> 生成 RFC 6902 JSON Patch</li>
                <li><code>PatchHistory</code> 300ms 合并、上限 200 步</li>
                <li>应用 Patch → 不可变替换 → 整树重编译</li>
                <li>800ms 自动保存 localStorage，可直接导入导出</li>
              </ol>
              <p class="lp-flow__gain">增量子树编译尚未实现，已明确列在路线图里，没有假装完成。</p>
            </article>

            <article class="lp-flow">
              <div class="lp-flow__top">
                <span class="lp-flow__id">C</span>
                <span class="lp-tag lp-tag--ok">已实现 · 可视化</span>
              </div>
              <h3>联动配置</h3>
              <p class="lp-flow__note">顺序错了，联动就会静默算错。</p>
              <ol>
                <li><code>visible</code> / <code>disabled</code> / <code>required</code> 三类 effect</li>
                <li>从 AST 精确收集 <code>$form</code> 与 <code>$status</code> 依赖</li>
                <li>建边：<code>field.path → field.prop</code></li>
                <li>Kahn 剩余节点 + DFS 三色回溯完整环路径</li>
                <li>逻辑板展示 DAG、拓扑序与表达式 AST</li>
              </ol>
              <p class="lp-flow__gain">表达式支持 <code>$status.passport.no.visible</code>，effect 可以依赖 effect。</p>
            </article>

            <article class="lp-flow">
              <div class="lp-flow__top">
                <span class="lp-flow__id">D</span>
                <span class="lp-tag lp-tag--ok">已实现</span>
              </div>
              <h3>工程化</h3>
              <p class="lp-flow__note">决定它像不像一个正经项目。</p>
              <ol>
                <li>pnpm workspace · 5 个包 · TS strict</li>
                <li>71 个 core 单测，零 DOM 依赖好测</li>
                <li>tsdown 输出 ESM + CJS + <code>.d.ts</code></li>
                <li><code>vue-tsc --noEmit</code> 全仓库类型检查</li>
                <li>GitHub Actions：typecheck → test → build → Pages</li>
              </ol>
              <p class="lp-flow__gain">core 只依赖 TypeScript 与浏览器标准 API，发布包无运行时依赖。</p>
            </article>
          </div>
        </div>
      </section>

      <!-- ───────────────────────── 03 运行时 ───────────────────────── -->
      <section class="lp-section" id="runtime">
        <div class="shell">
          <header class="lp-head lp-head--row">
            <div>
              <p class="lp-sec-no">§ 03 — 运行时（真的能跑）</p>
              <h2>把「差旅类型」切到国际<br />看联动发生</h2>
            </div>
            <p>
              右侧观测窗不是设计稿：它读取真实 <code>FormEvent</code>，
              打印每次求值、touched 路径与耗时。输入「重名」还能触发异步校验。
            </p>
          </header>

          <LiveDemo />
        </div>
      </section>

      <!-- ───────────────────────── 04 架构 ───────────────────────── -->
      <section class="lp-section lp-section--tint" id="architecture">
        <div class="shell">
          <header class="lp-head">
            <p class="lp-sec-no">§ 04 — 架构</p>
            <h2>core 不认识 Vue，<br />才值钱</h2>
            <p>
              依赖方向是单向的：designer → renderer-vue → core。
              渲染层可以替换，编译内核一行不改。
            </p>
          </header>

          <div class="lp-arch">
            <div class="lp-tree">
              <div class="lp-tree__cap"><span>schema-forge / monorepo</span><b>5 packages</b></div>
              <pre><span class="h">packages/core</span>              <span class="c">← 纯 TS · 零框架 · 零运行时依赖</span>
├─ <span class="d">protocol/</span>
│  ├─ <span class="f">schema.ts</span>          <span class="c">FormSchema / FieldNode</span>
│  ├─ <span class="f">infer.ts</span>           <span class="c">InferFormData&lt;S&gt;</span>
│  └─ <span class="f">migrate.ts</span>         <span class="c">v1.0 → v1.1 → v2.0</span>
├─ <span class="d">expression/</span>
│  ├─ <span class="f">lexer.ts</span> <span class="f">parser.ts</span>
│  ├─ <span class="f">evaluate.ts</span> <span class="f">deps.ts</span> <span class="f">functions.ts</span>
├─ <span class="d">graph/</span>
│  ├─ <span class="f">dep-graph.ts</span>
│  ├─ <span class="f">toposort.ts</span>        <span class="c">Kahn</span>
│  ├─ <span class="f">cycle.ts</span>           <span class="c">DFS 三色</span>
│  └─ <span class="f">propagate.ts</span>       <span class="c">下游闭包</span>
├─ <span class="d">store/</span> <span class="f">create-store.ts</span> <span class="f">path.ts</span>
├─ <span class="d">validate/</span> <span class="f">rules.ts</span>
└─ <span class="d">patch/</span> <span class="f">operations.ts</span> <span class="f">history.ts</span>

<span class="h">packages/renderer-vue</span>        <span class="c">← 适配层</span>
├─ <span class="f">SchemaRenderer.vue</span> <span class="f">FieldNode.vue</span>
└─ <span class="f">useField.ts</span>          <span class="c">只订阅 touched 路径</span>

<span class="h">packages/materials</span>            <span class="c">← 18 个物料 / 12 个 Vue 控件</span>
<span class="h">packages/designer</span>             <span class="c">← 画布 / 属性 / 逻辑板 / 预览</span>
<span class="h">packages/playground</span>           <span class="c">← 本页</span></pre>
            </div>

            <div class="lp-layers">
              <article class="lp-layer lp-layer--core">
                <span>L1 · CORE</span>
                <h3>编译内核</h3>
                <p>
                  只认识「一份 Schema + 一组数据」，是一台纯函数编译器：
                  <code>(schema, data) → (status, errors, values)</code>。
                  可在 Node、Worker 或无 DOM 环境运行。
                </p>
                <p class="lp-layer__meta">@schema-forge/core · 0 运行时依赖</p>
              </article>

              <article class="lp-layer">
                <span>L2 · ADAPTER</span>
                <h3>渲染适配</h3>
                <p>
                  把 store 的 touched / version 桥接成 Vue 响应式。
                  每个字段只在命中自己的路径时更新，避免整表重渲染。
                </p>
                <p class="lp-layer__meta">@schema-forge/renderer-vue · useField</p>
              </article>

              <article class="lp-layer">
                <span>L3 · APP</span>
                <h3>设计器与物料</h3>
                <p>
                  Designer 是最大的 dogfooding 场景：属性面板、联动配置、
                  预览表单全部由 L1 + L2 渲染，不再额外写一套表单代码。
                </p>
                <p class="lp-layer__meta">designer · materials · playground</p>
              </article>

              <div class="lp-boundary">
                <b>真实边界</b>
                <p>
                  当前没有 renderer-react、虚拟滚动、协同编辑与增量子树编译。
                  它们属于后续项，不以“已完成”的姿态出现。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ───────────────────────── 05 算法 ───────────────────────── -->
      <section class="lp-section" id="algorithm">
        <div class="shell">
          <header class="lp-head">
            <p class="lp-sec-no">§ 05 — 核心算法</p>
            <h2>表达式 → 依赖图<br />→ 拓扑求值 → 精准传播</h2>
            <p>
              朴素做法每改一个输入就重跑全部表达式，顺序取决于遍历顺序，有环时静默算错。
              这里把顺序和影响范围都变成编译期可计算的东西。
            </p>
          </header>

          <div class="lp-algo">
            <article class="lp-algo__card">
              <span class="lp-algo__no">01 / SANDBOX</span>
              <h3>手写表达式引擎</h3>
              <p>
                词法分析 + 优先级爬升 parser，支持路径、三元、逻辑与白名单函数。
                不使用 <code>new Function</code>，可在 CSP <code>unsafe-eval</code> 环境运行。
              </p>
              <div class="lp-minicode">
                <span class="c">// parser.ts · 白名单</span><br />
                <span class="k">if</span> (!isWhitelistedFunction(name))<br />
                &nbsp;&nbsp;<span class="k">throw new</span> ExpressionError(<span class="s">'未授权的函数'</span>)<br />
                <span class="c">// deps.ts · AST 精确抽依赖</span><br />
                <span class="k">const</span> deps = collectDependencies(ast)
              </div>
              <ul>
                <li>错误携带行 / 列 / 字符位置</li>
                <li>作用域：<code>$form</code> / <code>$values</code> / <code>$self</code> / <code>$index</code> / <code>$status</code></li>
                <li>AST 编译一次，交互期反复复用</li>
              </ul>
            </article>

            <article class="lp-algo__card">
              <span class="lp-algo__no">02 / ORDER</span>
              <h3>依赖图 + 环检测</h3>
              <p>
                节点是字段值与 effect id，边是「谁依赖谁」。
                Kahn 拓扑排序确定求值序；剩余节点交给 DFS 三色回溯，输出完整环路径。
              </p>
              <div class="lp-minicode">
                <span class="c">// toposort.ts · Kahn</span><br />
                <span class="k">const</span> queue = nodes.filter(inDegree === <span class="n">0</span>)<br />
                <span class="k">for</span> (<span class="k">let</span> i = <span class="n">0</span>; i &lt; queue.length; i++) {<br />
                &nbsp;&nbsp;order.push(node)<br />
                &nbsp;&nbsp;<span class="c">// 入度归零 → 入队</span><br />
                }<br />
                <span class="c">// cycle.ts · 三色</span><br />
                <span class="k">if</span> (color === GRAY) cycles.push(path)
              </div>
              <ul>
                <li>环不是异常退出，而是可诊断结果</li>
                <li>设计器红线展示：<code>a → b → a</code></li>
                <li>拓扑序稳定，便于快照与测试</li>
              </ul>
            </article>

            <article class="lp-algo__card">
              <span class="lp-algo__no">03 / PRECISION</span>
              <h3>精准脏值传播</h3>
              <p>
                输入变化时，沿正向边求下游闭包，过滤出 effect 并按拓扑序执行。
                只 bump 受影响节点的版本号，其余字段不参与求值。
              </p>
              <div class="lp-minicode">
                <span class="c">// propagate.ts · 闭包</span><br />
                <span class="k">const</span> down = downstreamClosure(graph, path)<br />
                <span class="c">// 按拓扑序只执行闭包内 effect</span><br />
                <span class="k">for</span> (<span class="k">const</span> node <span class="k">of</span> order) {<br />
                &nbsp;&nbsp;<span class="k">if</span> (!down.has(node)) <span class="k">continue</span><br />
                &nbsp;&nbsp;bump(node)
                }
              </div>
              <ul>
                <li><code>Uint32Array</code> 版本位图，O(1) 读写</li>
                <li><code>touched</code> 路径列表驱动字段级更新</li>
                <li>异步校验 420ms 防抖，同字段请求合并</li>
              </ul>
            </article>
          </div>

          <div class="lp-proofline">
            <div class="lp-codecard">
              <div class="lp-codecard__cap">
                <span>graph/toposort.ts</span>
                <b>实际源码</b>
              </div>
              <pre><span class="k">export function</span> <span class="f">toposort</span>(graph: DepGraph): TopoResult {
  <span class="k">const</span> indegree = <span class="k">new</span> Map&lt;string, number&gt;()
  <span class="k">for</span> (<span class="k">const</span> node <span class="k">of</span> graph.nodes) indegree.set(node, <span class="n">0</span>)
  <span class="k">for</span> (<span class="k">const</span> targets <span class="k">of</span> graph.adj.values())
    <span class="k">for</span> (<span class="k">const</span> target <span class="k">of</span> targets)
      indegree.set(target, (indegree.get(target) ?? <span class="n">0</span>) + <span class="n">1</span>)

  <span class="k">const</span> queue = graph.nodes.filter(
    (node) =&gt; (indegree.get(node) ?? <span class="n">0</span>) === <span class="n">0</span>,
  )
  <span class="k">const</span> order: string[] = []

  <span class="k">for</span> (<span class="k">let</span> i = <span class="n">0</span>; i &lt; queue.length; i++) {
    <span class="k">const</span> node = queue[i] <span class="k">as</span> string
    order.push(node)
    <span class="k">for</span> (<span class="k">const</span> target <span class="k">of</span> graph.adj.get(node) ?? []) {
      <span class="k">const</span> next = (indegree.get(target) ?? <span class="n">0</span>) - <span class="n">1</span>
      indegree.set(target, next)
      <span class="k">if</span> (next === <span class="n">0</span>) queue.push(target)
    }
  }
  <span class="k">return</span> { order, cyclic: graph.nodes.filter((n) =&gt; !order.includes(n)) }
}</pre>
            </div>

            <div class="lp-topolist">
              <div class="lp-topolist__cap">
                <span>demo schema · 实际拓扑序</span>
                <b>{{ program.stats.orderLength }} nodes · {{ program.stats.cycleCount }} cycles</b>
              </div>
              <ol>
                <li v-for="effect in orderedEffects" :key="effect.id">
                  <span class="lp-topolist__order">#{{ effect.order }}</span>
                  <code>{{ effect.id }}</code>
                  <span class="lp-topolist__deps">
                    <template v-if="effect.deps.length">← {{ effect.deps.join(', ') }}</template>
                    <template v-else>literal</template>
                  </span>
                </li>
              </ol>
              <p>
                这个顺序由依赖图实时算出。切换差旅类型时，引擎只执行闭包内节点。
              </p>
            </div>
          </div>

          <BenchmarkPanel />

          <div class="lp-nofn">
            <div>
              <p class="lp-sec-no">WHY NOT eval</p>
              <h3>为什么坚持自研 parser</h3>
              <p>
                不是为了炫技，而是 <code>new Function</code> 在 CSP、依赖收集和错误定位上都不合格。
              </p>
            </div>
            <table>
              <thead>
                <tr><th>维度</th><th><code>new Function</code></th><th class="is-own">自研 parser</th></tr>
              </thead>
              <tbody>
                <tr><td>CSP <code>unsafe-eval</code></td><td class="no">直接不可用</td><td class="own">✓ 可运行</td></tr>
                <tr><td>静态依赖收集</td><td class="no">正则猜测，易漏</td><td class="own">AST 精确提取</td></tr>
                <tr><td>报错定位</td><td class="no">只有 SyntaxError</td><td class="own">行 / 列 / 字符</td></tr>
                <tr><td>运行期开销</td><td class="no">重复编译字符串</td><td class="own">AST 编译一次</td></tr>
                <tr><td>安全性</td><td class="no">作用域难以限制</td><td class="own">白名单 + 只读作用域</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ───────────────────────── 06 设计器 ───────────────────────── -->
      <section class="lp-designer" id="designer">
        <div class="shell lp-designer__grid">
          <div class="lp-designer__copy">
            <p class="lp-sec-no">§ 06 — 可视化设计器</p>
            <h2>用引擎<br />渲染引擎自己</h2>
            <p class="lp-designer__lede">
              属性面板不是手写的 if/else 表单。每个物料的 <code>propsSchema</code>
              会交给同一个 core 编译、同一个 renderer 渲染 —— 自举，也持续 dogfooding。
            </p>

            <ul class="lp-designer__list">
              <li><b>三栏舱体</b>物料库 / 12 栅格画布 / 属性面板</li>
              <li><b>编辑即 Patch</b>拖拽、移动、删除都生成 JSON Patch</li>
              <li><b>联动逻辑板</b>依赖 DAG、拓扑序、环路径、AST</li>
              <li><b>双向 JSON</b>手改 Schema 反驱画布，带行号与错误定位</li>
              <li><b>真实预览</b><code>createForm()</code> + 异步校验 + 提交闸门</li>
            </ul>

            <div class="lp-designer__actions">
              <a class="lp-btn lp-btn--accent" href="#/designer">
                进入设计器
                <span aria-hidden="true">↗</span>
              </a>
              <span>会话自动保存到 localStorage</span>
            </div>
          </div>

          <div class="lp-cockpit" aria-label="设计器能力速览">
            <div class="lp-cockpit__bar">
              <span class="lp-cockpit__logo">sf</span>
              <span class="lp-cockpit__title">schema-forge <small>designer</small></span>
              <span class="lp-cockpit__seg">
                <i class="is-on">设计</i><i>逻辑</i><i>预览</i><i>Schema</i>
              </span>
              <span class="lp-cockpit__state">synced</span>
            </div>

            <div class="lp-cockpit__body">
              <div class="lp-cockpit__rail">
                <p>OUTLINE <b>{{ program.stats.fieldCount }}</b></p>
                <span v-for="(field, index) in ['section.applicant', 'employee.name', 'employee.department', 'trip.type', 'passport.no', 'passport.expiry', 'budget.amount', 'cost.center', 'urgent', 'approval.reason']" :key="field" :class="{ 'is-sel': index === 4 }">
                  <i>{{ index + 1 }}</i>{{ field }}
                </span>
              </div>

              <div class="lp-cockpit__canvas">
                <div class="lp-cockpit__crumb">
                  form / travel-request / 画布
                  <b>{{ program.effects.length }} effects</b>
                </div>
                <div class="lp-cockpit__fields">
                  <div class="lp-cockpit__field is-wide">
                    <span>trip.type</span><b>差旅类型</b><i>radio</i>
                  </div>
                  <div class="lp-cockpit__field">
                    <span>passport.no</span><b>护照号码</b><i>visible</i>
                  </div>
                  <div class="lp-cockpit__field is-sel">
                    <span>passport.no</span><b>护照号码</b><i>required</i>
                  </div>
                  <div class="lp-cockpit__field">
                    <span>approval.reason</span><b>紧急说明</b><i>visible</i>
                  </div>
                </div>
                <div class="lp-cockpit__graph">
                  <p>dependency graph · live</p>
                  <svg viewBox="0 0 360 130" role="img" aria-label="联动依赖示意：trip.type 到 passport.no.visible 再到 required">
                    <defs>
                      <marker id="lp-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 z" fill="#4C7DF0"></path>
                      </marker>
                      <marker id="lp-arrow-hot" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 z" fill="#FF2E88"></path>
                      </marker>
                    </defs>
                    <rect x="8" y="42" width="96" height="30" rx="1" class="node-key"></rect>
                    <text x="18" y="61">trip.type</text>
                    <rect x="136" y="14" width="120" height="30" rx="1"></rect>
                    <text x="146" y="33">passport.no.visible</text>
                    <rect x="136" y="82" width="130" height="30" rx="1" class="node-hot"></rect>
                    <text x="146" y="101">passport.no.required</text>
                    <path d="M104,55 C118,55 120,29 134,29" marker-end="url(#lp-arrow)"></path>
                    <path d="M104,59 C118,59 120,97 134,97" marker-end="url(#lp-arrow)"></path>
                    <path d="M256,29 C280,29 260,97 268,97" marker-end="url(#lp-arrow-hot)"></path>
                  </svg>
                  <p class="lp-cockpit__graph-note">0 cycles · order solved</p>
                </div>
              </div>

              <div class="lp-cockpit__inspector">
                <div class="lp-cockpit__tabs"><i class="is-on">属性</i><i>联动</i><i>校验</i><i>高级</i></div>
                <p class="lp-cockpit__label">visible · 表达式</p>
                <p class="lp-cockpit__expr">$form.trip.type === 'INTERNATIONAL'</p>
                <p class="lp-cockpit__deps">deps <b>{ trip.type }</b> <span>✓ no cycle</span></p>
                <p class="lp-cockpit__label">propsSchema · 自举</p>
                <div class="lp-cockpit__input"><span>占位提示</span><b>请输入护照号码</b></div>
                <div class="lp-cockpit__input"><span>最大长度</span><b>17</b></div>
                <div class="lp-cockpit__toggle"><i></i><span>等宽字体 mono</span></div>
                <p class="lp-cockpit__label">JSON Patch</p>
                <p class="lp-cockpit__patch">replace /fields/4/required<br /><span>undo stack · 12</span></p>
              </div>
            </div>

            <div class="lp-cockpit__footer">
              <span>schema hash <b>compiled</b></span>
              <span>topo order <b>{{ program.stats.orderLength }}</b></span>
              <span>cycles <b>{{ program.stats.cycleCount }}</b></span>
              <span>mode <b>design</b></span>
            </div>
          </div>
        </div>
      </section>

      <!-- ───────────────────────── 07 工程化 ───────────────────────── -->
      <section class="lp-section" id="engineering">
        <div class="shell">
          <header class="lp-head lp-head--row">
            <div>
              <p class="lp-sec-no">§ 07 — 工程化</p>
              <h2>核心能力之外，<br />是工程证据</h2>
            </div>
            <p>
              全部数字取自仓库当前状态：测试可以复跑，构建可以复现，
              性能基准就在上一节实时测量。
            </p>
          </header>

          <div class="lp-stats">
            <div><b>5</b><span>workspace 包</span></div>
            <div><b>{{ testTotal }}</b><span>core 单测 / 5 文件</span></div>
            <div><b>0</b><span>core 运行时依赖</span></div>
            <div><b>3</b><span>构建产物：ESM / CJS / d.ts</span></div>
          </div>

          <div class="lp-engineering">
            <div class="lp-testcard">
              <div class="lp-testcard__cap"><span>packages/core/test</span><b>71 passed</b></div>
              <ul>
                <li v-for="file in testFiles" :key="file.name">
                  <div>
                    <code>{{ file.name }}</code>
                    <span>{{ file.note }}</span>
                  </div>
                  <div class="lp-testcard__bar">
                    <i :style="{ width: `${(file.count / 20) * 100}%` }"></i>
                  </div>
                  <b>{{ file.count }}</b>
                </li>
              </ul>
              <p>
                core 不依赖 DOM，所以 lexer、拓扑、Patch、迁移都能用纯函数直接测试。
              </p>
            </div>

            <div class="lp-gates">
              <div class="lp-gates__block">
                <div class="lp-gates__cap"><span>本地命令</span><b>pnpm</b></div>
                <div class="lp-cmd"><code>pnpm install</code><span>安装 workspace 依赖</span></div>
                <div class="lp-cmd"><code>pnpm dev</code><span>启动本页与设计器</span></div>
                <div class="lp-cmd"><code>pnpm test</code><span>71 条 core 单测</span></div>
                <div class="lp-cmd"><code>pnpm typecheck</code><span>vue-tsc 全仓库</span></div>
                <div class="lp-cmd"><code>pnpm build</code><span>core 产物 + 静态站点</span></div>
              </div>

              <div class="lp-gates__block">
                <div class="lp-gates__cap"><span>CI 质量门禁</span><b>GitHub Actions</b></div>
                <div class="lp-pipeline">
                  <span>install</span><i>→</i><span>typecheck</span><i>→</i><span>test</span><i>→</i><span>build</span>
                </div>
                <p>
                  流水线定义在 <code>.github/workflows/ci.yml</code>：main 分支先跑质量门禁，再把构建产物发布到 GitHub Pages（仓库需启用 Pages）。
                </p>
                <p class="lp-gates__note">
                  尚未发布 npm 包，也未接入 changesets / size-limit —— 这些是路线图，不是已完成项。
                </p>
              </div>
            </div>
          </div>

          <div class="lp-packages">
            <article><span>@schema-forge/core</span><b>编译内核</b><p>表达式、依赖图、store、校验、Patch。零框架依赖。</p></article>
            <article><span>@schema-forge/renderer-vue</span><b>Vue 适配</b><p>SchemaRenderer / FieldNode / useField，字段级订阅。</p></article>
            <article><span>@schema-forge/materials</span><b>物料库</b><p>12 个控件 + 属性 Schema，注册式扩展。</p></article>
            <article><span>@schema-forge/designer</span><b>设计器</b><p>画布、属性自举、逻辑板、预览、Schema 双向编辑。</p></article>
            <article><span>@schema-forge/playground</span><b>演示站</b><p>本页：真实运行时、实时基准、设计器入口。</p></article>
          </div>
        </div>
      </section>

      <!-- ───────────────────────── 08 路线图 ───────────────────────── -->
      <section class="lp-section lp-section--tint" id="roadmap">
        <div class="shell">
          <header class="lp-head lp-head--row">
            <div>
              <p class="lp-sec-no">§ 08 — 8 周路线图</p>
              <h2>技术高峰已经落地</h2>
            </div>
            <p>
              W2 表达式、W3 依赖图、W6 设计器是本项目的必保项。
              这里如实标注完成度，避免把计划写成既成事实。
            </p>
          </header>

          <div class="lp-roadmap">
            <div v-for="item in roadmap" :key="item.week" class="lp-roadmap__row" :class="`is-${item.status}`">
              <span class="lp-roadmap__week">{{ item.week }}</span>
              <div class="lp-roadmap__main">
                <b>{{ item.title }}</b>
                <span>{{ item.note }}</span>
              </div>
              <span class="lp-roadmap__status">{{ statusLabel[item.status] }}</span>
            </div>
          </div>

          <div class="lp-callout lp-callout--compact">
            <b>W2 + W3 + W6 全部落地</b>
            <p>
              表达式引擎有 17 条单测，图算法 9 条，设计器可从本页右上角直接打开。
              其余项按真实边界标注，不用“即将上线”掩盖未完成。
            </p>
          </div>
        </div>
      </section>

      <!-- ───────────────────────── 09 FAQ ───────────────────────── -->
      <section class="lp-section" id="decisions">
        <div class="shell">
          <header class="lp-head">
            <p class="lp-sec-no">§ 09 — 设计决策</p>
            <h2>会被追问的七个问题</h2>
            <p>答案对应代码里的真实实现，不背概念。</p>
          </header>

          <div class="lp-faq">
            <details>
              <summary>为什么不用 <code>new Function</code> / <code>eval</code>？</summary>
              <p>
                三个硬伤：CSP 开启 <code>unsafe-eval</code> 限制时直接不可用；无法从字符串精确提取字段依赖，
                只能正则猜测；报错往往只有一句 SyntaxError。自研 parser 同时解决了静态依赖、行列定位与 AST 复用。
              </p>
            </details>
            <details>
              <summary>循环依赖怎么处理？</summary>
              <p>
                建图后跑 Kahn 拓扑排序，没有进入队列的节点就是环参与者；再用 DFS 三色标记回溯调用栈，
                输出完整环路径，如 <code>a → b → a</code>。设计器把编译 issue 直接显示出来，不静默算错。
              </p>
            </details>
            <details>
              <summary>字段级精准更新具体怎么落地？</summary>
              <p>
                core 用扁平 key → 下标映射维护 <code>Uint32Array</code> 版本号；每次 <code>setValue</code>
                只 bump 下游闭包内的节点，并在事件里携带 <code>touched</code> 路径。
                <code>useField</code> 只有命中自己路径时才更新本地 tick，其余字段的 computed 不会重新求值。
              </p>
            </details>
            <details>
              <summary>撤销重做为什么用 JSON Patch？</summary>
              <p>
                Patch 是最小增量、可序列化、可传输。直接存整份 Schema 快照会迅速膨胀；
                Patch 栈可以合并 300ms 内的连续输入，并为未来接协同编辑保留通道。当前上限 200 步。
              </p>
            </details>
            <details>
              <summary>Schema 升级后老数据怎么办？</summary>
              <p>
                <code>migrateSchema()</code> 维护 v1.0 → v1.1 → v2.0 的有序迁移链，每级都是纯函数。
                编译时自动迁移并记录迁移轨迹；迁移失败会保留原值并报告告警，而不是静默丢数据。
              </p>
            </details>
            <details>
              <summary>大表单卡顿怎么解决？目前还缺什么？</summary>
              <p>
                已解决「全量重算」：依赖图 + 下游闭包，把 500 字段 / 120 联动场景下的单次 effect 求值从
                120 条降到 2 条（见基准面板）。尚未做虚拟滚动与折叠容器懒挂载，因此不宣称 DOM 节点数优化。
                校验风暴方面已实现同步立即校验、异步 420ms 防抖与同字段请求合并。
              </p>
            </details>
            <details>
              <summary>和 Formily / amis 的差异是什么？</summary>
              <p>
                Formily 是成熟的响应式表单框架，amis 是页面配置器。本项目更小、更偏底层：
                core 无框架依赖，Vue 渲染层可替换，并把表达式、依赖图、环检测、迁移链、JSON Patch
                作为一等公民。它不是竞品替代，而是一次把表单引擎当编译系统来写的工程实践。
              </p>
            </details>
          </div>

          <div class="lp-quote">
            <p>
              “先把 Schema 当源码，<br />
              再谈搭建。”
            </p>
            <a class="lp-btn lp-btn--primary" href="#/designer">
              打开设计器
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>
    </main>

    <footer class="lp-footer">
      <div class="shell lp-footer__in">
        <div>
          <a class="lp-brand" href="#top">
            <span class="lp-brand__mark">sf</span>
            <span class="lp-brand__name">schema<em>·</em>forge</span>
          </a>
          <p>Schema 驱动的表单引擎与可视化设计器。</p>
        </div>
        <div class="lp-footer__links">
          <a href="#why">定位</a>
          <a href="#runtime">运行时</a>
          <a href="#architecture">架构</a>
          <a href="#roadmap">路线图</a>
          <a href="#/designer">设计器</a>
        </div>
        <p class="lp-footer__meta">
          TypeScript 5.7 · Vue 3.5 · Vite 6 · pnpm monorepo<br />
          protocol v2.0 · 71 tests · 0 core runtime deps<br />
          2026 · built from source, not from a template
        </p>
      </div>
    </footer>
  </div>
</template>
