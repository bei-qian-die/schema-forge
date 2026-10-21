<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FieldNode, FormProgram, MaterialSpec } from '@schema-forge/core'
import type { InspectorTab } from '../useDesigner'
import PropsForm from './PropsForm.vue'
import LinkagePanel from './LinkagePanel.vue'
import RulesPanel from './RulesPanel.vue'

const props = defineProps<{
  node: FieldNode | null
  pointer: string | null
  material?: MaterialSpec
  program: FormProgram
  tab: InspectorTab
}>()

const emit = defineEmits<{
  'update:tab': [tab: InspectorTab]
  update: [partial: Partial<FieldNode>, mergeKey?: string]
  'update-props': [props: Record<string, unknown>]
  'update-effect': [prop: 'visible' | 'disabled' | 'required', value: string | boolean | undefined]
  'update-rules': [rules: FieldNode['rules']]
  remove: []
  add: [type: string]
}>()

const tabs: { id: InspectorTab; label: string }[] = [
  { id: 'props', label: '属性' },
  { id: 'linkage', label: '联动' },
  { id: 'rules', label: '校验' },
  { id: 'advanced', label: '高级' },
]

const keyDraft = ref('')
watch(
  () => props.node?.key,
  (key) => {
    keyDraft.value = key ?? ''
  },
  { immediate: true },
)

const compiled = computed(() =>
  props.node ? props.program.fieldMap.get(props.node.key) : undefined,
)
const effects = computed(() =>
  props.node ? props.program.effects.filter((effect) => effect.fieldKey === props.node?.key) : [],
)
const childrenCount = computed(() => props.node?.children?.length ?? 0)
const nodeJson = computed(() => (props.node ? JSON.stringify(props.node, null, 2) : ''))
const defaultValueText = computed(() => {
  if (!props.node || !Object.prototype.hasOwnProperty.call(props.node, 'defaultValue')) return '—'
  return JSON.stringify(props.node.defaultValue)
})
const copied = ref(false)

function update(partial: Partial<FieldNode>, mergeKey?: string): void {
  emit('update', partial, mergeKey)
}

function commitKey(): void {
  if (!props.node) return
  const next = keyDraft.value.trim()
  if (next && next !== props.node.key) emit('update', { key: next })
  else keyDraft.value = props.node.key
}

function onWidth(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (!Number.isFinite(value)) return
  update({ layout: { ...(props.node?.layout ?? {}), colSpan: value } })
}

function onProps(next: Record<string, unknown>): void {
  emit('update-props', next)
}

async function copyNode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(nodeJson.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    copied.value = false
  }
}

const span = computed(() => props.node?.layout?.colSpan ?? 12)
</script>

<template>
  <aside class="sfd-inspector">
    <div v-if="!node" class="sfd-inspector__empty">
      <p class="sfd-inspector__empty-mark">+</p>
      <h3>选择一个字段</h3>
      <p>在画布或大纲中点选字段，右侧面板会显示属性、联动表达式与校验规则。</p>
      <div class="sfd-inspector__quick">
        <button class="sfd-btn sfd-btn--ghost" type="button" @click="emit('add', 'input')">
          + 单行文本
        </button>
        <button class="sfd-btn sfd-btn--ghost" type="button" @click="emit('add', 'card')">
          + 卡片容器
        </button>
      </div>
    </div>

    <template v-else>
      <header class="sfd-inspector__head">
        <div class="sfd-inspector__title">
          <span class="sfd-inspector__icon">{{ material?.icon || '·' }}</span>
          <div>
            <h3>{{ node.label || node.key }}</h3>
            <code>{{ node.key }}</code>
          </div>
        </div>
        <div class="sfd-inspector__tools">
          <em>{{ node.type }}</em>
          <button type="button" class="sfd-icon-btn" title="删除字段" @click="emit('remove')">
            ✕
          </button>
        </div>
      </header>

      <div class="sfd-inspector__tabs" role="tablist">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          @click="emit('update:tab', item.id)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="sfd-inspector__body">
        <div v-if="tab === 'props'" class="sfd-pane">
          <section class="sfd-section">
            <div class="sfd-section-head"><span>基础标识</span><b>node</b></div>
            <label class="sfd-mini-field">
              <span>key · data path</span>
              <input
                v-model="keyDraft"
                spellcheck="false"
                placeholder="company.taxNo"
                @change="commitKey"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
              />
            </label>
            <p class="sfd-field-hint">
              支持 dotted path。重命名时，引用它的表达式会同步改写。
            </p>

            <label class="sfd-mini-field">
              <span>label · 标题</span>
              <input
                :value="node.label"
                spellcheck="false"
                @input="update({ label: ($event.target as HTMLInputElement).value }, `label:${pointer}`)"
              />
            </label>

            <label class="sfd-mini-field">
              <span>colSpan · 12 栅格</span>
              <select :value="span" @change="onWidth">
                <option v-for="n in 12" :key="n" :value="n">{{ n }} / 12</option>
              </select>
            </label>

            <div v-if="childrenCount" class="sfd-meta-row">
              <span>children</span>
              <b>{{ childrenCount }}</b>
            </div>
          </section>

          <PropsForm
            v-if="material"
            :key="`${pointer}:${node.type}`"
            :node="node"
            :material="material"
            @update-props="onProps"
          />
        </div>

        <LinkagePanel
          v-else-if="tab === 'linkage'"
          :node="node"
          :program="program"
          @update-effect="(prop, value) => emit('update-effect', prop, value)"
        />

        <RulesPanel
          v-else-if="tab === 'rules'"
          :node="node"
          @update="(rules) => emit('update-rules', rules)"
        />

        <div v-else class="sfd-pane">
          <section class="sfd-section">
            <div class="sfd-section-head"><span>编译信息</span><b>#{{ program.stats.schemaHash }}</b></div>
            <div class="sfd-meta-row"><span>JSON Pointer</span><code>{{ pointer }}</code></div>
            <div class="sfd-meta-row"><span>type</span><code>{{ node.type }}</code></div>
            <div class="sfd-meta-row"><span>data field</span><b>{{ compiled?.isDataField ? 'yes' : 'no' }}</b></div>
            <div class="sfd-meta-row"><span>depth</span><b>{{ compiled?.depth ?? 0 }}</b></div>
            <div class="sfd-meta-row"><span>defaultValue</span><code>{{ defaultValueText }}</code></div>
            <div class="sfd-meta-row"><span>effects</span><b>{{ effects.length }}</b></div>
          </section>

          <section class="sfd-section">
            <div class="sfd-section-head"><span>version &amp; 推导</span><b>v2.0</b></div>
            <p class="sfd-panel-note">
              Schema 版本 <code>{{ program.schema.version }}</code>，迁移链：
              <code>{{ program.migration.applied.join(' → ') || '无需迁移' }}</code>。<br />
              类型推导入口：<code>InferFormData&lt;typeof schema&gt;</code>，
              当前路径值为编译期可推断的字段。
            </p>
          </section>

          <section class="sfd-section">
            <div class="sfd-section-head">
              <span>节点 JSON</span>
              <button type="button" class="sfd-icon-btn" @click="copyNode">
                {{ copied ? '已复制' : '复制' }}
              </button>
            </div>
            <pre class="sfd-node-json">{{ nodeJson }}</pre>
          </section>
        </div>
      </div>
    </template>
  </aside>
</template>
