<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  compileSchema,
  createForm,
  evaluate,
  type FieldNode,
  type FieldStatus,
  type FormSchema,
} from '@schema-forge/core'

interface BenchResult {
  compileMs: number
  initMs: number
  compiledPerOpMs: number
  naivePerOpMs: number
  speedup: number
  compiledEffects: number
  naiveEffects: number
  skipRatio: number
  nodeCount: number
  edgeCount: number
  fieldCount: number
  expressionCount: number
  iterations: number
  rounds: number
  totalFields: number
  measuredAt: string
}

const ITERATIONS = 400
const ROUNDS = 5
const TOTAL_FIELDS = 500
const TRIGGERS = 60

const running = ref(false)
const result = ref<BenchResult | null>(null)
const errorMessage = ref('')
let autoRan = false

function makeNode(index: number): FieldNode {
  const key = `f${String(index).padStart(3, '0')}`
  if (index < TRIGGERS) {
    return {
      key,
      type: 'switch',
      label: `触发器 ${key}`,
      layout: { colSpan: 4 },
      defaultValue: false,
    }
  }
  return {
    key,
    type: 'input',
    label: `字段 ${key}`,
    layout: { colSpan: 4 },
    defaultValue: '',
  }
}

function buildSchema(): FormSchema {
  const fields: FieldNode[] = []
  for (let i = 0; i < TOTAL_FIELDS; i++) fields.push(makeNode(i))

  // 60 visibility effects: f000..f059 → f100..f159.visible
  for (let i = 0; i < TRIGGERS; i++) {
    const target = fields[100 + i] as FieldNode
    target.visible = `$form.f${String(i).padStart(3, '0')} === true`
  }

  // 60 required effects chained through $status: f100.visible → f200.required
  for (let i = 0; i < TRIGGERS; i++) {
    const target = fields[200 + i] as FieldNode
    target.required = `$status.f${String(100 + i)}.visible`
  }

  return {
    version: '2.0',
    id: 'benchmark-500-fields',
    title: '500 字段联动基准',
    layout: { type: 'grid', columns: 12, gutter: 12 },
    fields,
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number)
}

function measureCompile(schema: FormSchema): number {
  const samples: number[] = []
  for (let round = 0; round < ROUNDS; round++) {
    const startedAt = performance.now()
    compileSchema(schema)
    samples.push(performance.now() - startedAt)
  }
  return median(samples)
}

function measureInit(program: ReturnType<typeof compileSchema>): number {
  const samples: number[] = []
  for (let round = 0; round < ROUNDS; round++) {
    const startedAt = performance.now()
    createForm(program, { validateOn: 'submit' })
    samples.push(performance.now() - startedAt)
  }
  return median(samples)
}

function runCompiled(program: ReturnType<typeof compileSchema>): {
  perOpMs: number
  effects: number
} {
  const form = createForm(program, { validateOn: 'submit' })
  let last = form.setValue('f000', false)

  for (let i = 0; i < 20; i++) {
    last = form.setValue('f000', i % 2 === 1)
  }

  const samples: number[] = []
  let effects = last.evaluated.length
  for (let round = 0; round < ROUNDS; round++) {
    form.setValue('f000', false)
    const startedAt = performance.now()
    for (let i = 0; i < ITERATIONS; i++) {
      last = form.setValue('f000', i % 2 === 0)
    }
    samples.push((performance.now() - startedAt) / ITERATIONS)
    effects = last.evaluated.length
  }
  return { perOpMs: median(samples), effects }
}

function runNaive(program: ReturnType<typeof compileSchema>): {
  perOpMs: number
  effects: number
} {
  // Pre-compile every AST: the naive implementation gets the same head start.
  const compiled = program.effects
    .filter((effect) => !effect.literal && effect.expression)
    .map((effect) => ({ effect, ast: effect.expression!.ast }))

  const values: Record<string, unknown> = {}
  for (let i = 0; i < TOTAL_FIELDS; i++) {
    values[`f${String(i).padStart(3, '0')}`] = i < TRIGGERS ? false : ''
  }

  const statuses = new Map<string, FieldStatus>()
  for (const field of program.allFields) {
    statuses.set(field.key, { visible: true, disabled: false, required: false })
  }

  const resolveStatus = (statusPath: string): unknown => {
    const lastDot = statusPath.lastIndexOf('.')
    if (lastDot === -1) return undefined
    const field = statusPath.slice(0, lastDot)
    const prop = statusPath.slice(lastDot + 1) as keyof FieldStatus
    const entry = statuses.get(field)
    if (!entry) return prop === 'visible' ? true : false
    return entry[prop]
  }

  const scan = () => {
    for (const { effect, ast } of compiled) {
      const next = Boolean(
        evaluate(ast, {
          form: values,
          values,
          self: values[effect.fieldKey],
          resolveStatus,
        }),
      )
      const entry = statuses.get(effect.fieldKey)
      if (entry) entry[effect.prop] = next
    }
  }

  for (let i = 0; i < 5; i++) {
    values.f000 = i % 2 === 1
    scan()
  }

  const samples: number[] = []
  for (let round = 0; round < ROUNDS; round++) {
    values.f000 = false
    scan()
    const startedAt = performance.now()
    for (let i = 0; i < ITERATIONS; i++) {
      values.f000 = i % 2 === 0
      scan()
    }
    samples.push((performance.now() - startedAt) / ITERATIONS)
  }
  return { perOpMs: median(samples), effects: compiled.length }
}

function run(): void {
  if (running.value) return
  running.value = true
  errorMessage.value = ''
  window.setTimeout(() => {
    try {
      const schema = buildSchema()
      const program = compileSchema(schema)
      const compileMs = measureCompile(schema)
      const initMs = measureInit(program)
      const compiled = runCompiled(program)
      const naive = runNaive(program)
      const speedup = compiled.perOpMs > 0 ? naive.perOpMs / compiled.perOpMs : 0
      result.value = {
        compileMs,
        initMs,
        compiledPerOpMs: compiled.perOpMs,
        naivePerOpMs: naive.perOpMs,
        speedup,
        compiledEffects: compiled.effects,
        naiveEffects: naive.effects,
        skipRatio: naive.effects > 0 ? 1 - compiled.effects / naive.effects : 0,
        nodeCount: program.stats.nodeCount,
        edgeCount: program.stats.edgeCount,
        fieldCount: program.stats.fieldCount,
        expressionCount: program.stats.expressionCount,
        iterations: ITERATIONS,
        rounds: ROUNDS,
        totalFields: TOTAL_FIELDS,
        measuredAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      running.value = false
    }
  }, 60)
}

onMounted(() => {
  if (autoRan) return
  autoRan = true
  window.setTimeout(run, 400)
})

const maxMs = computed(() =>
  Math.max(result.value?.compiledPerOpMs ?? 0, result.value?.naivePerOpMs ?? 0, 0.0001),
)

const compiledWidth = computed(() =>
  result.value ? Math.max(2, (result.value.compiledPerOpMs / maxMs.value) * 100) : 0,
)

const naiveWidth = computed(() =>
  result.value ? Math.max(2, (result.value.naivePerOpMs / maxMs.value) * 100) : 0,
)

const skipLabel = computed(() =>
  result.value ? `${(result.value.skipRatio * 100).toFixed(1)}%` : '—',
)

function ms(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value < 0.01) return value.toFixed(4)
  if (value < 1) return value.toFixed(3)
  return value.toFixed(2)
}
</script>

<template>
  <div class="bench">
    <header class="bench__head">
      <div>
        <p class="bench__kicker">LOCAL BENCHMARK · 实时运行</p>
        <h3>500 字段 / 120 联动，一次输入到底重算多少？</h3>
      </div>
      <button class="bench__run" type="button" :disabled="running" @click="run">
        {{ running ? '测量中…' : result ? '重新测量' : '运行基准' }}
      </button>
    </header>

    <div class="bench__body">
      <div class="bench__chart">
        <div class="bench__chart-cap">
          <span>单次输入传播耗时 · 中位数 / 次</span>
          <b>{{ result ? `${result.iterations} 次 × ${result.rounds} 轮` : '待测' }}</b>
        </div>

        <div class="bench__bar-row">
          <div class="bench__bar-label"><span>全量扫描</span><small>120 条 AST / 次</small></div>
          <div class="bench__bar bench__bar--naive"><i :style="{ width: `${naiveWidth}%` }"></i></div>
          <div class="bench__bar-value">{{ ms(result?.naivePerOpMs) }}<small> ms</small></div>
        </div>

        <div class="bench__bar-row">
          <div class="bench__bar-label"><span>依赖图传播</span><small>{{ result ? result.compiledEffects : '—' }} 条 AST / 次</small></div>
          <div class="bench__bar bench__bar--compiled"><i :style="{ width: `${compiledWidth}%` }"></i></div>
          <div class="bench__bar-value">{{ ms(result?.compiledPerOpMs) }}<small> ms</small></div>
        </div>

        <p v-if="result" class="bench__speedup">
          结构跳过 <b>{{ skipLabel }}</b> 的 effect 求值 ·
          <b>{{ result.speedup > 0 ? `${result.speedup.toFixed(1)}×` : '—' }}</b> 传播加速
        </p>
        <p v-else-if="running" class="bench__speedup">正在构建 500 字段 Schema 并运行 warmup…</p>
        <p v-else class="bench__speedup">基准只测 core，不含 Vue 渲染与 DOM diff。</p>
      </div>

      <dl class="bench__stats">
        <div>
          <dt>图规模</dt>
          <dd>{{ result ? result.nodeCount : '—' }}<small> nodes</small></dd>
          <span>{{ result ? result.edgeCount : '—' }} 条依赖边</span>
        </div>
        <div>
          <dt>编译 / 初始化</dt>
          <dd>{{ ms(result?.compileMs) }}<small> ms</small></dd>
          <span>初始化 {{ ms(result?.initMs) }} ms</span>
        </div>
        <div>
          <dt>单次求值量</dt>
          <dd>{{ result ? result.compiledEffects : '—' }}<small> / 120</small></dd>
          <span>触发字段只影响 2 条 effect</span>
        </div>
        <div>
          <dt>测量时间</dt>
          <dd class="mono">{{ result?.measuredAt ?? '—' }}</dd>
          <span>本机浏览器实测</span>
        </div>
      </dl>
    </div>

    <details class="bench__method">
      <summary>方法与边界（不把测量当宣传）</summary>
      <div>
        <ol>
          <li>Schema：{{ result?.totalFields ?? TOTAL_FIELDS }} 个字段，120 条 effect —— 60 条 <code>visible</code>，60 条 <code>required</code> 通过 <code>$status</code> 串联。</li>
          <li>触发 <code>f000</code> 沿依赖图只影响 <code>f100.visible → f200.required</code> 2 条 effect；全量实现每轮扫描全部 120 条。</li>
          <li>全量对照也预编译 AST，并每轮按声明顺序重算 120 条表达式 —— 对朴素方案更有利。</li>
          <li>结果取 {{ ROUNDS }} 轮 × {{ ITERATIONS }} 次的中位数；不含 Vue 渲染、DOM diff、网络与异步校验。机器、浏览器版本和后台负载都会影响数字。</li>
        </ol>
        <p v-if="errorMessage" class="bench__error">测量失败：{{ errorMessage }}</p>
        <p v-else>当前框架与算法：<code>downstreamClosure</code> → 拓扑序过滤 → 仅求值下游闭包。500 字段是压力样本，不代表业务表单一定这么大。</p>
      </div>
    </details>
  </div>
</template>
