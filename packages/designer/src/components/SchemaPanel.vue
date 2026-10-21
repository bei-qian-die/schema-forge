<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { FormProgram, FormSchema } from '@schema-forge/core'
import { downloadSchema } from '../utils'

const props = defineProps<{
  schema: FormSchema
  program: FormProgram
  variant?: 'drawer' | 'full'
  closable?: boolean
}>()

const emit = defineEmits<{
  replace: [schema: unknown]
  close: []
}>()

const draft = ref(JSON.stringify(props.schema, null, 2))
const parseError = ref('')
const compileError = ref('')
const dirty = ref(false)
const focused = ref(false)
const copied = ref(false)
const gutter = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

const lineCount = computed(() => draft.value.split('\n').length)
const errorCount = computed(
  () => props.program.issues.filter((issue) => issue.severity === 'error').length,
)
const warningCount = computed(
  () => props.program.issues.filter((issue) => issue.severity === 'warning').length,
)
const synced = computed(() => !dirty.value && !parseError.value && !compileError.value)

watch(
  () => props.schema,
  (next) => {
    if (focused.value) return
    draft.value = JSON.stringify(next, null, 2)
    dirty.value = false
    parseError.value = ''
    compileError.value = ''
  },
  { deep: true },
)

function locate(message: string): string {
  const match = /position (\d+)/.exec(message)
  if (!match) return message
  const offset = Number(match[1])
  const before = draft.value.slice(0, offset)
  const line = before.split('\n').length
  const column = offset - before.lastIndexOf('\n')
  return `${message.replace(/,? ?(at )?position \d+/, '')} (${line}:${column})`
}

function parseDraft(): unknown | null {
  try {
    const parsed = JSON.parse(draft.value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      parseError.value = '根节点必须是一个 JSON 对象'
      return null
    }
    if (!Array.isArray((parsed as { fields?: unknown }).fields)) {
      parseError.value = 'Schema 必须包含 fields 数组'
      return null
    }
    parseError.value = ''
    return parsed
  } catch (error) {
    parseError.value = locate(error instanceof Error ? error.message : String(error))
    return null
  }
}

function apply(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const parsed = parseDraft()
  if (!parsed) return
  compileError.value = ''
  dirty.value = false
  emit('replace', parsed)
}

function schedule(): void {
  dirty.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    apply()
  }, 500)
}

function onInput(): void {
  schedule()
}

function onFocus(): void {
  focused.value = true
}

function onBlur(): void {
  focused.value = false
  if (timer) apply()
}

function onScroll(event: Event): void {
  if (gutter.value) gutter.value.scrollTop = (event.target as HTMLElement).scrollTop
}

function format(): void {
  const parsed = parseDraft()
  if (!parsed) return
  draft.value = JSON.stringify(parsed, null, 2)
  apply()
}

function revert(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  draft.value = JSON.stringify(props.schema, null, 2)
  dirty.value = false
  parseError.value = ''
  compileError.value = ''
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(draft.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    copied.value = false
  }
}

function download(): void {
  downloadSchema(props.schema)
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="sfd-schema" :class="`sfd-schema--${variant ?? 'full'}`">
    <header class="sfd-schema__head">
      <div class="sfd-schema__title">
        <span class="sfd-schema__mark">{ }</span>
        <div>
          <h3>Schema JSON</h3>
          <p>
            <code>schema-forge/form@{{ schema.version ?? '2.0' }}</code>
            <i :class="{ 'is-dirty': !synced, 'is-error': errorCount > 0 }">
              {{ parseError || compileError ? 'JSON 有误' : synced ? '与画布同步' : '编辑中…' }}
            </i>
          </p>
        </div>
      </div>

      <div class="sfd-schema__tools">
        <button type="button" class="sfd-btn sfd-btn--ghost" @click="format">格式化</button>
        <button type="button" class="sfd-btn sfd-btn--ghost" @click="copy">
          {{ copied ? '已复制' : '复制' }}
        </button>
        <button type="button" class="sfd-btn sfd-btn--ghost" @click="download">下载</button>
        <button type="button" class="sfd-btn sfd-btn--ghost" @click="revert">还原</button>
        <button type="button" class="sfd-btn sfd-btn--primary" @click="apply">应用到画布</button>
        <button
          v-if="closable"
          type="button"
          class="sfd-icon-btn sfd-schema__close"
          title="收起 Schema"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
    </header>

    <div class="sfd-schema__body">
      <div class="sfd-editor" :class="{ 'has-error': Boolean(parseError) }">
        <div ref="gutter" class="sfd-editor__gutter" aria-hidden="true">
          <span v-for="line in lineCount" :key="line">{{ line }}</span>
        </div>
        <textarea
          v-model="draft"
          class="sfd-editor__area"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
          aria-label="Schema JSON 编辑器"
          @input="onInput"
          @focus="onFocus"
          @blur="onBlur"
          @scroll="onScroll"
          @keydown.ctrl.enter.prevent="apply"
          @keydown.meta.enter.prevent="apply"
        ></textarea>
      </div>

      <aside v-if="variant !== 'drawer'" class="sfd-schema__stats">
        <div class="sfd-section-head">
          <span>编译统计</span>
          <b>v{{ program.schema.version }}</b>
        </div>
        <div class="sfd-stat-list">
          <div><span>fields</span><b>{{ program.stats.fieldCount }}</b></div>
          <div><span>data leaves</span><b>{{ program.stats.leafCount }}</b></div>
          <div><span>expressions</span><b>{{ program.stats.expressionCount }}</b></div>
          <div><span>graph nodes</span><b>{{ program.stats.nodeCount }}</b></div>
          <div><span>graph edges</span><b>{{ program.stats.edgeCount }}</b></div>
          <div><span>topo order</span><b>{{ program.stats.orderLength }}</b></div>
          <div :class="{ 'is-danger': program.stats.cycleCount > 0 }">
            <span>cycles</span><b>{{ program.stats.cycleCount }}</b>
          </div>
          <div><span>compile</span><b>{{ program.stats.compileMs.toFixed(2) }}ms</b></div>
          <div><span>schema hash</span><code>#{{ program.stats.schemaHash }}</code></div>
        </div>

        <div class="sfd-section-head sfd-section-head--sub">
          <span>迁移链</span>
          <b>{{ program.migration.applied.length }}</b>
        </div>
        <p class="sfd-panel-note">
          <code>{{ program.migration.applied.join(' → ') || '无需迁移' }}</code>
        </p>

        <div class="sfd-section-head sfd-section-head--sub">
          <span>诊断</span>
          <b :class="{ 'is-danger': errorCount > 0 }">{{ errorCount }} error · {{ warningCount }} warn</b>
        </div>
        <ul v-if="program.issues.length" class="sfd-schema__issues">
          <li v-for="(issue, index) in program.issues.slice(0, 8)" :key="index" :class="`is-${issue.severity}`">
            <code>{{ issue.code }}</code>
            <span>{{ issue.message }}</span>
          </li>
        </ul>
        <p v-else class="sfd-empty-line">编译通过，没有诊断信息。</p>
      </aside>
    </div>

    <footer class="sfd-schema__foot">
      <span v-if="parseError" class="sfd-schema__error">{{ parseError }}</span>
      <span v-else-if="compileError" class="sfd-schema__error">{{ compileError }}</span>
      <span v-else>
        编辑后 500ms 自动应用；<kbd>Ctrl</kbd> + <kbd>Enter</kbd> 立即编译。
      </span>
      <em>{{ lineCount }} lines · JSON Pointer patch history</em>
    </footer>
  </div>
</template>
