<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  createForm,
  deepClone,
  type EffectEvaluation,
  type Form,
  type FormEvent,
  type FormSchema,
  type FormStats,
} from '@schema-forge/core'
import { SchemaRenderer } from '@schema-forge/renderer-vue'
import { DEMO_VALUES } from '../defaultSchema'

const props = defineProps<{
  schema: FormSchema
}>()

const emit = defineEmits<{
  select: [pointer: string]
}>()

interface LogEntry {
  id: number
  type: string
  path?: string
  value?: unknown
  touched: string[]
  evaluated: EffectEvaluation[]
  validated: string[]
  errorsChanged: string[]
  durationMs: number
  revision: number
  at: string
}

interface SubmitState {
  valid: boolean
  errors: Record<string, string[]>
  serialized: string
}

const form = shallowRef<Form | null>(null)
const formKey = ref(0)
const stats = ref<FormStats | null>(null)
const logs = ref<LogEntry[]>([])
const submitState = ref<SubmitState | null>(null)
const submitting = ref(false)
const asyncHits = ref(0)
let logSeq = 0

function timeLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function record(event: FormEvent): void {
  logs.value = [
    {
      id: ++logSeq,
      type: event.type,
      path: event.path,
      value: event.value,
      touched: [...event.touched],
      evaluated: event.evaluated,
      validated: event.validated,
      errorsChanged: event.errorsChanged,
      durationMs: event.durationMs,
      revision: event.revision,
      at: timeLabel(),
    },
    ...logs.value,
  ].slice(0, 60)
  stats.value = form.value?.getStats() ?? null
}

function build(): void {
  const next = createForm(deepClone(props.schema), {
    initialValues: deepClone(DEMO_VALUES),
    validateOn: 'input',
    asyncDebounce: 420,
    asyncValidator: async (context) => {
      await new Promise((resolve) => setTimeout(resolve, 520))
      asyncHits.value++
      const text = String(context.value ?? '')
      if (text.includes('已存在')) {
        return context.rule.message || '远程校验未通过'
      }
      return true
    },
    onEvent: (event) => record(event),
  })
  form.value = next
  formKey.value++
  stats.value = next.getStats()
  logs.value = []
  submitState.value = null
  asyncHits.value = 0
}

watch(
  () => props.schema,
  () => build(),
  { deep: true },
)

build()

onBeforeUnmount(() => {
  logs.value = []
})

const formStats = computed(() => stats.value)

const touchedRatio = computed(() => {
  const current = stats.value
  if (!current || current.fieldCount === 0) return 0
  return Math.min(100, Math.round((current.lastTouched / current.fieldCount) * 100))
})

function setValue(path: string, value: unknown): void {
  form.value?.setValue(path, value)
}

function reset(): void {
  form.value?.reset(deepClone(DEMO_VALUES))
  submitState.value = null
}

async function submit(): Promise<void> {
  if (!form.value || submitting.value) return
  submitting.value = true
  const result = await form.value.validate()
  submitState.value = {
    valid: result.valid,
    errors: result.fields,
    serialized: JSON.stringify(form.value.serialize(), null, 2),
  }
  submitting.value = false
  stats.value = form.value.getStats()
}

function fieldLabel(path: string): string {
  return form.value?.getField(path)?.node.label || path
}

function effectLabel(effect: EffectEvaluation): string {
  return `${effect.fieldKey}.${effect.prop}`
}

function inspect(path: string): void {
  emit('select', path)
}
</script>

<template>
  <div class="sfd-runtime">
    <header class="sfd-board-head">
      <div>
        <p class="sfd-board-kicker">Flow A · compiled runtime</p>
        <h2>运行时预览</h2>
        <p>
          当前 Schema 已被编译成 FormProgram，预览表单由运行时直接驱动。
          每次输入只会重算下游闭包，日志里能看到 touched / evaluated / duration。
        </p>
      </div>
      <div class="sfd-runtime__actions">
        <button type="button" class="sfd-btn sfd-btn--ghost" @click="reset">重置演示值</button>
        <button
          type="button"
          class="sfd-btn sfd-btn--primary"
          :disabled="submitting"
          @click="submit"
        >
          {{ submitting ? '校验中…' : '提交并校验' }}
        </button>
      </div>
    </header>

    <div class="sfd-runtime__grid">
      <section class="sfd-runtime__form-panel">
        <div class="sfd-runtime__paper-head">
          <div>
            <span>SCHEMA / {{ schema.id }}</span>
            <h3>{{ schema.title || '未命名表单' }}</h3>
          </div>
          <em>v{{ schema.version }}</em>
        </div>

        <div class="sfd-presets">
          <span>快速场景</span>
          <button type="button" @click="setValue('invoice.type', 'PERSONAL')">个人发票</button>
          <button type="button" @click="setValue('invoice.type', 'COMPANY')">企业专票</button>
          <button type="button" @click="setValue('amount', 200000)">金额 200k</button>
          <button type="button" @click="setValue('company.name', '成都已存在科技有限公司')">
            触发异步校验
          </button>
        </div>

        <div class="sfd-runtime__paper">
          <SchemaRenderer
            v-if="form"
            :key="formKey"
            :form="form"
            theme="light"
            dense
            @change="stats = form?.getStats() ?? null"
          />
        </div>

        <p class="sfd-runtime__hint">
          演示异步校验：企业名称包含「已存在」时，420ms 防抖后会得到远程错误；
          同名字段连续输入只会保留最后一次请求。
        </p>
      </section>

      <aside class="sfd-runtime__side">
        <section class="sfd-panel">
          <div class="sfd-section-head">
            <span>引擎状态</span>
            <b>rev {{ formStats?.revision ?? 0 }}</b>
          </div>
          <div class="sfd-meter-grid">
            <div>
              <span>last set</span>
              <b>{{ (formStats?.lastDurationMs ?? 0).toFixed(2) }}<em>ms</em></b>
            </div>
            <div>
              <span>evaluated</span>
              <b>{{ formStats?.lastEvaluated ?? 0 }}</b>
            </div>
            <div>
              <span>touched</span>
              <b>{{ formStats?.lastTouched ?? 0 }}</b>
            </div>
            <div>
              <span>nodes</span>
              <b>{{ formStats?.nodeCount ?? 0 }}</b>
            </div>
          </div>
          <div class="sfd-meter">
            <span>touched / fields</span>
            <i :style="{ '--pct': `${touchedRatio}%` }"></i>
            <b>{{ touchedRatio }}%</b>
          </div>
          <div class="sfd-meta-row">
            <span>async scheduled / coalesced</span>
            <code>{{ formStats?.asyncScheduled ?? 0 }} / {{ formStats?.asyncCoalesced ?? 0 }}</code>
          </div>
          <div class="sfd-meta-row">
            <span>validator calls</span>
            <code>{{ asyncHits }}</code>
          </div>
          <div class="sfd-meta-row">
            <span>schema hash</span>
            <code>#{{ formStats?.schemaHash ?? '—' }}</code>
          </div>
        </section>

        <section class="sfd-panel sfd-runtime__log">
          <div class="sfd-section-head">
            <span>事件日志</span>
            <b>{{ logs.length }}</b>
          </div>
          <div v-if="logs.length" class="sfd-log-list">
            <button
              v-for="entry in logs"
              :key="entry.id"
              type="button"
              class="sfd-log"
              @click="entry.touched[0] && inspect(entry.touched[0])"
            >
              <header>
                <span class="sfd-log__type" :class="`is-${entry.type}`">{{ entry.type }}</span>
                <code v-if="entry.path">{{ entry.path }}</code>
                <em>{{ entry.durationMs.toFixed(2) }}ms</em>
              </header>
              <p v-if="entry.path">
                {{ fieldLabel(entry.path) }}
                <span v-if="entry.value !== undefined">→ {{ JSON.stringify(entry.value) }}</span>
              </p>
              <div class="sfd-log__stats">
                <span>rev {{ entry.revision }}</span>
                <span>touched {{ entry.touched.length }}</span>
                <span>fx {{ entry.evaluated.length }}</span>
              </div>
              <div v-if="entry.evaluated.length" class="sfd-log__effects">
                <code
                  v-for="effect in entry.evaluated.slice(0, 5)"
                  :key="effect.id"
                  :class="{ 'is-changed': effect.changed }"
                >
                  {{ effectLabel(effect) }}={{ effect.value ? 'T' : 'F' }}
                </code>
                <em v-if="entry.evaluated.length > 5">+{{ entry.evaluated.length - 5 }}</em>
              </div>
            </button>
          </div>
          <p v-else class="sfd-empty-line">
            还没有事件。修改左侧任意字段，引擎会在这里打印本次求值结果。
          </p>
        </section>

        <section v-if="submitState" class="sfd-panel" :class="{ 'is-invalid': !submitState.valid }">
          <div class="sfd-section-head">
            <span>validate() 结果</span>
            <b :class="{ 'is-danger': !submitState.valid }">
              {{ submitState.valid ? 'valid' : `${Object.keys(submitState.errors).length} invalid` }}
            </b>
          </div>
          <ul v-if="!submitState.valid" class="sfd-submit-errors">
            <li v-for="(messages, key) in submitState.errors" :key="key">
              <code>{{ key }}</code>
              <span>{{ messages[0] }}</span>
            </li>
          </ul>
          <div class="sfd-section-head sfd-section-head--sub">
            <span>serialize() · 已剔除隐藏字段</span>
            <b>JSON</b>
          </div>
          <pre class="sfd-code">{{ submitState.serialized }}</pre>
        </section>
      </aside>
    </div>
  </div>
</template>
