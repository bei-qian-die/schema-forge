<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import {
  createForm,
  deepClone,
  type Form,
  type FormEvent,
} from '@schema-forge/core'
import { SchemaRenderer } from '@schema-forge/renderer-vue'
import { DEMO_PRESETS, DEMO_VALUES, demoSchema, type DemoPreset } from '../demo'

interface EffectLog {
  id: string
  changed: boolean
  value: boolean
}

type LogKind = 'init' | 'set' | 'validate' | 'reset'

interface LogEntry {
  id: number
  kind: LogKind
  title: string
  meta: string
  effects: EffectLog[]
  durationMs: number
}

interface Snapshot {
  revision: number
  lastDurationMs: number
  lastEvaluated: number
  lastTouched: number
  asyncScheduled: number
  asyncCoalesced: number
}

interface SubmitResult {
  valid: boolean
  errors: string[]
  payload: Record<string, unknown>
}

const form = shallowRef<Form>(
  createForm(deepClone(demoSchema), {
    initialValues: deepClone(DEMO_VALUES),
    validateOn: 'input',
    asyncDebounce: 420,
    asyncValidator: async ({ key, value }) => {
      await new Promise((resolve) => setTimeout(resolve, 480))
      if (key === 'employee.name' && String(value).includes('重名')) {
        return '远程校验：该姓名与在职员工冲突（演示）'
      }
      return true
    },
  }),
)

const log = ref<LogEntry[]>([])
const logEl = ref<HTMLElement>()
const submitState = ref<'idle' | 'checking' | 'ok' | 'invalid'>('idle')
const submitted = ref<SubmitResult | null>(null)
let sequence = 1

function snapshot(): Snapshot {
  const stats = form.value.getStats()
  return {
    revision: stats.revision,
    lastDurationMs: stats.lastDurationMs,
    lastEvaluated: stats.lastEvaluated,
    lastTouched: stats.lastTouched,
    asyncScheduled: stats.asyncScheduled,
    asyncCoalesced: stats.asyncCoalesced,
  }
}

const stats = ref<Snapshot>(snapshot())

const program = computed(() => form.value.program)
const payload = computed(() =>
  submitted.value ? JSON.stringify(submitted.value.payload, null, 2) : '',
)

function formatDuration(ms: number): string {
  if (ms === 0) return '0.00'
  return ms < 1 ? ms.toFixed(3) : ms.toFixed(2)
}

function push(entry: Omit<LogEntry, 'id'>): void {
  log.value.unshift({ id: sequence++, ...entry })
  if (log.value.length > 30) log.value.length = 30
  void nextTick(() => {
    if (logEl.value) logEl.value.scrollTop = 0
  })
}

function onEvent(event: FormEvent): void {
  const common = {
    durationMs: event.durationMs,
    effects: event.evaluated.map((effect) => ({
      id: effect.id,
      changed: effect.changed,
      value: effect.value,
    })),
  }

  if (event.type === 'set') {
    push({
      ...common,
      kind: 'set',
      title: `set(${event.path ?? '—'})`,
      meta: `${event.touched.length} touched · revision #${event.revision}`,
    })
  } else if (event.type === 'validate') {
    push({
      ...common,
      kind: 'validate',
      title: event.errorsChanged.length
        ? `validate → ${event.errorsChanged.join(', ')}`
        : `validate(${event.validated.join(', ') || 'all'})`,
      meta: event.errorsChanged.length
        ? `${event.errorsChanged.length} error path(s) changed`
        : 'no error changes',
    })
  } else {
    push({
      ...common,
      kind: 'reset',
      title: 'reset(seed)',
      meta: `${event.touched.length} paths restored`,
    })
  }

  stats.value = snapshot()
}

const unsubscribe = form.value.subscribe(onEvent)
onBeforeUnmount(unsubscribe)

push({
  kind: 'init',
  title: 'createForm(schema) → program',
  meta: `${program.value.stats.fieldCount} fields · ${program.value.stats.expressionCount} expressions · ${program.value.stats.nodeCount} graph nodes`,
  effects: [],
  durationMs: program.value.stats.compileMs,
})

const evaluatedRatio = computed(() => {
  const total = Math.max(1, program.value.effects.length)
  return Math.min(100, Math.round((stats.value.lastEvaluated / total) * 100))
})

const touchedRatio = computed(() => {
  const total = Math.max(1, program.value.stats.leafCount)
  return Math.min(100, Math.round((stats.value.lastTouched / total) * 100))
})

function applyPreset(preset: DemoPreset): void {
  submitState.value = 'idle'
  submitted.value = null
  form.value.setValues(deepClone(preset.values))
}

function reset(): void {
  submitState.value = 'idle'
  submitted.value = null
  form.value.reset(deepClone(DEMO_VALUES))
}

async function submit(): Promise<void> {
  submitState.value = 'checking'
  submitted.value = null
  const validation = await form.value.validate()
  const errors = Object.entries(validation.fields).flatMap(([path, messages]) =>
    messages.map((message) => `${path} — ${message}`),
  )
  submitted.value = {
    valid: validation.valid,
    errors,
    payload: form.value.serialize(),
  }
  submitState.value = validation.valid ? 'ok' : 'invalid'
  stats.value = snapshot()
}

function kindLabel(kind: LogKind): string {
  if (kind === 'init') return 'init'
  if (kind === 'validate') return 'check'
  return kind
}
</script>

<template>
  <div class="runtime">
    <div class="runtime__stage">
      <header class="runtime__head">
        <div>
          <h3>{{ demoSchema.title }}</h3>
          <p class="mono">
            schema: {{ demoSchema.id }} v{{ demoSchema.version }} ·
            {{ program.stats.fieldCount }} fields ·
            {{ program.effects.length }} effects
          </p>
        </div>
        <div class="runtime__presets" aria-label="演示预设">
          <button
            v-for="preset in DEMO_PRESETS"
            :key="preset.id"
            type="button"
            :title="preset.hint"
            @click="applyPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>
      </header>

      <div class="runtime__form">
        <SchemaRenderer :form="form" theme="light" />
      </div>

      <div class="runtime__actions">
        <button class="lp-btn lp-btn--primary lp-btn--sm" type="button" :disabled="submitState === 'checking'" @click="submit">
          {{ submitState === 'checking' ? '全量校验中…' : '提交并全量校验' }}
        </button>
        <button class="lp-btn lp-btn--ghost lp-btn--sm" type="button" @click="reset">重置</button>
        <span class="runtime__hint">修改任意字段，右侧为真实引擎事件。</span>
      </div>

      <div v-if="submitted" class="runtime__result" :class="{ 'is-invalid': !submitted.valid }">
        <template v-if="submitted.valid">
          <div class="runtime__result-head">
            <b>校验通过</b>
            <span class="mono">serialize() · 隐藏字段已剔除</span>
          </div>
          <pre>{{ payload }}</pre>
        </template>
        <template v-else>
          <div class="runtime__result-head">
            <b>{{ submitted.errors.length }} 条错误</b>
            <span class="mono">validate() 全量闸门</span>
          </div>
          <ul>
            <li v-for="error in submitted.errors.slice(0, 8)" :key="error">{{ error }}</li>
          </ul>
        </template>
      </div>
    </div>

    <aside class="runtime__watch" aria-label="引擎观测窗">
      <header class="watch__head">
        <span class="watch__title"><i class="watch__dot" aria-hidden="true"></i>引擎观测窗</span>
        <span class="mono">rev #{{ stats.revision }}</span>
      </header>

      <div class="watch__meters">
        <div class="watch__meter">
          <span>本轮 effect 求值</span>
          <b>{{ stats.lastEvaluated }}<small>/ {{ program.effects.length }}</small></b>
          <div class="watch__bar"><i :style="{ width: `${evaluatedRatio}%` }"></i></div>
        </div>
        <div class="watch__meter">
          <span>touched 路径</span>
          <b>{{ stats.lastTouched }}<small>/ {{ program.stats.leafCount }}</small></b>
          <div class="watch__bar"><i :style="{ width: `${touchedRatio}%` }"></i></div>
        </div>
        <div class="watch__meter">
          <span>传播耗时</span>
          <b>{{ formatDuration(stats.lastDurationMs) }}<small> ms</small></b>
          <div class="watch__bar watch__bar--plain"><i :style="{ width: '100%' }"></i></div>
        </div>
      </div>

      <ul ref="logEl" class="watch__log" role="log" aria-live="polite">
        <li v-for="entry in log" :key="entry.id" :class="`is-${entry.kind}`">
          <div class="watch__log-head">
            <span class="watch__kind">{{ kindLabel(entry.kind) }}</span>
            <code>{{ entry.title }}</code>
            <span class="watch__ms">{{ formatDuration(entry.durationMs) }} ms</span>
          </div>
          <div v-if="entry.effects.length" class="watch__effects">
            <span
              v-for="effect in entry.effects"
              :key="effect.id"
              :class="['watch__effect', { 'is-changed': effect.changed }]"
            >
              {{ effect.id }}
              <i>{{ effect.changed ? 'flip' : 'hold' }}</i>
            </span>
          </div>
          <p v-else class="watch__meta">{{ entry.meta }}</p>
          <p v-if="entry.effects.length" class="watch__meta">{{ entry.meta }}</p>
        </li>
      </ul>

      <footer class="watch__foot">
        <p>
          异步校验：<b>{{ stats.asyncScheduled }}</b> 次调度 /
          <b>{{ stats.asyncCoalesced }}</b> 次合并。输入 <code>重名</code> 观察 debounce。
        </p>
        <p>
          切到「国际 / 港澳台」，观察
          <code>$status.passport.no.visible → required</code> 的链式求值。
        </p>
      </footer>
    </aside>
  </div>
</template>
