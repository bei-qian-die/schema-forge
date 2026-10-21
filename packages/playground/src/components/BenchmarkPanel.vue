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

interface SweepPoint {
  fields: number
  effects: number
  compiledPerOpMs: number
  naivePerOpMs: number
  speedup: number
}

const ITERATIONS = 1000
const ROUNDS = 5
const TOTAL_FIELDS = 500
const TRIGGERS = 60
const WARMUP = 500
const SWEEP_SCALES = [
  { fields: 120, triggers: 10 },
  { fields: 300, triggers: 30 },
  { fields: 500, triggers: 60 },
  { fields: 1000, triggers: 120 },
]

const running = ref(false)
const result = ref<BenchResult | null>(null)
const errorMessage = ref('')
const sweepPoints = ref<SweepPoint[]>([])
let autoRan = false

function makeNode(index: number, triggers: number): FieldNode {
  const key = `f${String(index).padStart(3, '0')}`
  if (index < triggers) {
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

function buildSchema(totalFields = TOTAL_FIELDS, triggers = TRIGGERS): FormSchema {
  const fields: FieldNode[] = []
  for (let i = 0; i < totalFields; i++) fields.push(makeNode(i, triggers))

  // triggers → visibility, then visibility → required through $status.
  for (let i = 0; i < triggers; i++) {
    const source = `f${String(i).padStart(3, '0')}`
    const visibleTarget = fields[triggers + i] as FieldNode
    visibleTarget.visible = `$form.${source} === true`

    const statusSource = `f${String(triggers + i).padStart(3, '0')}`
    const requiredTarget = fields[triggers * 2 + i] as FieldNode
    requiredTarget.required = `$status.${statusSource}.visible`
  }

  return {
    version: '2.0',
    id: `benchmark-${totalFields}-fields`,
    title: `${totalFields} 字段联动基准`,
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

function measureCompile(schema: FormSchema, rounds = ROUNDS): number {
  const samples: number[] = []
  for (let round = 0; round < rounds; round++) {
    const startedAt = performance.now()
    compileSchema(schema)
    samples.push(performance.now() - startedAt)
  }
  return median(samples)
}

function measureInit(program: ReturnType<typeof compileSchema>, rounds = ROUNDS): number {
  const samples: number[] = []
  for (let round = 0; round < rounds; round++) {
    const startedAt = performance.now()
    createForm(program, { validateOn: 'submit' })
    samples.push(performance.now() - startedAt)
  }
  return median(samples)
}

function runCompiled(
  program: ReturnType<typeof compileSchema>,
  iterations = ITERATIONS,
  rounds = ROUNDS,
): {
  perOpMs: number
  effects: number
} {
  const form = createForm(program, { validateOn: 'submit' })
  let last = form.setValue('f000', false)

  for (let i = 0; i < WARMUP; i++) {
    last = form.setValue('f000', i % 2 === 1)
  }

  const samples: number[] = []
  let effects = last.evaluated.length
  for (let round = 0; round < rounds; round++) {
    form.setValue('f000', false)
    const startedAt = performance.now()
    for (let i = 0; i < iterations; i++) {
      last = form.setValue('f000', i % 2 === 0)
    }
    samples.push((performance.now() - startedAt) / iterations)
    effects = last.evaluated.length
  }
  return { perOpMs: median(samples), effects }
}

function runNaive(
  program: ReturnType<typeof compileSchema>,
  totalFields = TOTAL_FIELDS,
  triggers = TRIGGERS,
  iterations = ITERATIONS,
  rounds = ROUNDS,
): {
  perOpMs: number
  effects: number
} {
  // Pre-compile every AST: the naive implementation gets the same head start.
  const compiled = program.effects
    .filter((effect) => !effect.literal && effect.expression)
    .map((effect) => ({ effect, ast: effect.expression!.ast }))

  const values: Record<string, unknown> = {}
  for (let i = 0; i < totalFields; i++) {
    values[`f${String(i).padStart(3, '0')}`] = i < triggers ? false : ''
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

  for (let i = 0; i < WARMUP; i++) {
    values.f000 = i % 2 === 1
    scan()
  }

  const samples: number[] = []
  for (let round = 0; round < rounds; round++) {
    values.f000 = false
    scan()
    const startedAt = performance.now()
    for (let i = 0; i < iterations; i++) {
      values.f000 = i % 2 === 0
      scan()
    }
    samples.push((performance.now() - startedAt) / iterations)
  }
  return { perOpMs: median(samples), effects: compiled.length }
}

async function run(): Promise<void> {
  if (running.value) return
  running.value = true
  errorMessage.value = ''
  sweepPoints.value = []
  await new Promise<void>((resolve) => window.setTimeout(resolve, 60))
  try {
    const schema = buildSchema()
    const program = compileSchema(schema)
    const compileMs = measureCompile(schema)
    const initMs = measureInit(program)

    for (const scale of SWEEP_SCALES) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      const isMain = scale.fields === TOTAL_FIELDS
      const scaleProgram = isMain ? program : compileSchema(buildSchema(scale.fields, scale.triggers))
      const compiled = runCompiled(scaleProgram, ITERATIONS, ROUNDS)
      const naive = runNaive(
        scaleProgram,
        scale.fields,
        scale.triggers,
        ITERATIONS,
        ROUNDS,
      )
      const speedup = compiled.perOpMs > 0 ? naive.perOpMs / compiled.perOpMs : 0
      const skipRatio = naive.effects > 0 ? 1 - compiled.effects / naive.effects : 0
      sweepPoints.value = [
        ...sweepPoints.value,
        {
          fields: scale.fields,
          effects: compiled.effects,
          compiledPerOpMs: compiled.perOpMs,
          naivePerOpMs: naive.perOpMs,
          speedup,
        },
      ]

      if (isMain) {
        result.value = {
          compileMs,
          initMs,
          compiledPerOpMs: compiled.perOpMs,
          naivePerOpMs: naive.perOpMs,
          speedup,
          compiledEffects: compiled.effects,
          naiveEffects: naive.effects,
          skipRatio,
          nodeCount: scaleProgram.stats.nodeCount,
          edgeCount: scaleProgram.stats.edgeCount,
          fieldCount: scaleProgram.stats.fieldCount,
          expressionCount: scaleProgram.stats.expressionCount,
          iterations: ITERATIONS,
          rounds: ROUNDS,
          totalFields: TOTAL_FIELDS,
          measuredAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        }
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    running.value = false
  }
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

const speedChart = computed(() => {
  const data = sweepPoints.value
  if (data.length === 0) return null
  const width = 560
  const height = 210
  const padding = { top: 24, right: 30, bottom: 32, left: 36 }
  const speeds = data.map((point) => Math.max(point.speedup, 0.01))
  const minLog = Math.min(Math.log10(0.4), Math.log10(Math.min(...speeds)) - 0.1)
  const maxLog = Math.max(Math.log10(2), Math.log10(Math.max(...speeds)) + 0.1)
  const span = Math.max(0.3, maxLog - minLog)
  const x = (index: number) =>
    padding.left +
    (index / Math.max(1, data.length - 1)) * (width - padding.left - padding.right)
  const y = (value: number) =>
    padding.top +
    ((maxLog - Math.log10(Math.max(value, 0.01))) / span) *
      (height - padding.top - padding.bottom)
  const points = data.map((point, index) => ({
    ...point,
    x: x(index),
    y: y(point.speedup),
    anchor: index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle',
  }))
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
  const ticks = [0.25, 0.5, 1, 2, 5, 10, 20, 40]
    .filter(
      (value) =>
        Math.log10(value) >= minLog - 0.001 && Math.log10(value) <= maxLog + 0.001,
    )
    .map((value) => ({ value, y: y(value), label: `${value}×` }))
  return { width, height, padding, points, path, ticks, evenY: y(1) }
})

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
          <span class="bench__speedup-note">500 字段时的结果；小表单的交叉点见「方法与边界」。</span>
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
          <li>触发 <code>f000</code> 沿依赖图只影响 <code>f060.visible → f120.required</code> 2 条 effect；全量实现每轮扫描全部 120 条。</li>
          <li>全量对照也预编译 AST，并每轮按声明顺序重算 120 条表达式 —— 对朴素方案更有利。</li>
          <li>四个规模均取 5 轮 × 1000 次的中位数，每轮前预热 500 次；不含 Vue 渲染、DOM diff、网络与异步校验。机器、浏览器版本和后台负载都会影响数字。</li>
          <li>交叉曲线沿用同一结构，在 120 / 300 / 500 / 1000 字段下现场计算加速比；500 字段这一点与上方结果来自同一次测量。</li>
        </ol>

        <div class="bench__cross">
          <div class="bench__cross-cap">
            <span>传播加速比 × 字段规模 · 对数纵轴</span>
            <b>{{ running ? `测量中 ${sweepPoints.length}/${SWEEP_SCALES.length}` : '本机实测' }}</b>
          </div>
          <svg
            v-if="speedChart"
            class="bench__cross-svg"
            :viewBox="`0 0 ${speedChart.width} ${speedChart.height}`"
            role="img"
            aria-label="依赖图传播相对全量扫描的加速比随字段规模变化的折线图"
          >
            <g v-for="tick in speedChart.ticks" :key="tick.value">
              <line
                class="bench__cross-grid"
                :class="{ 'is-even': tick.value === 1 }"
                :x1="speedChart.padding.left"
                :x2="speedChart.width - speedChart.padding.right"
                :y1="tick.y"
                :y2="tick.y"
              />
              <text class="bench__cross-tick" x="2" :y="tick.y + 3">{{ tick.label }}</text>
            </g>
            <path class="bench__cross-line" :d="speedChart.path" />
            <g v-for="point in speedChart.points" :key="point.fields">
              <circle
                class="bench__cross-dot"
                :class="{ 'is-loss': point.speedup < 1 }"
                :cx="point.x"
                :cy="point.y"
                r="4"
              />
              <text
                class="bench__cross-value"
                :class="{ 'is-loss': point.speedup < 1 }"
                :x="point.x"
                :y="point.y - 10"
                :text-anchor="point.anchor"
              >
                {{ point.speedup.toFixed(1) }}×
              </text>
              <text
                class="bench__cross-x"
                :x="point.x"
                :y="speedChart.height - 8"
                :text-anchor="point.anchor"
              >
                {{ point.fields }}
              </text>
            </g>
          </svg>
          <p v-else class="bench__cross-empty">
            正在依次测量 {{ SWEEP_SCALES.map((scale) => scale.fields).join(' / ') }} 字段四种规模…
          </p>
          <p class="bench__cross-note">
            1× 以下表示依赖图传播比全量扫描更慢——这是小表单的真实短板。交叉点会随 effect 密度、触发扇出和机器变化，图上每个点都是当前浏览器现场测量。
          </p>
        </div>

        <p v-if="errorMessage" class="bench__error">测量失败：{{ errorMessage }}</p>
        <p v-else>当前框架与算法：<code>downstreamClosure</code> → 拓扑序过滤 → 仅求值下游闭包。500 字段是压力样本，不代表业务表单一定这么大。</p>
      </div>
    </details>
  </div>
</template>
