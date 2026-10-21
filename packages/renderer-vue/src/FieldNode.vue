<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  defaultValueForType,
  deepClone,
  evaluateExpression,
  isLayoutType,
  type FieldNode,
  type FieldStatus,
  type Form,
} from '@schema-forge/core'
import { getFieldComponent } from './registry'
import { useField } from './useField'
import UnknownField from './UnknownField.vue'

const props = defineProps<{
  node: FieldNode
  form: Form
  /** Set for children of an array row, e.g. `items[2]`. */
  prefix?: string
  index?: number
}>()

const path = computed(() =>
  props.prefix === undefined
    ? props.node.key
    : `${props.prefix}[${props.index ?? 0}].${props.node.key}`,
)

const compiled = computed(() => props.form.getField(path.value) !== undefined)
const control = computed(() => getFieldComponent(props.node.type))
const controlId = `sf-${Math.random().toString(36).slice(2, 9)}`
const bare = computed(() => props.node.type === 'divider' || props.node.type === 'static')
const activeTab = ref(0)

function evaluateFlag(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined) return fallback
  if (typeof raw === 'boolean') return raw
  if (typeof raw !== 'string') return fallback
  try {
    return Boolean(
      evaluateExpression(raw, {
        form: props.form.getValues(),
        values: props.form.getValues(),
        self: props.form.getValue(path.value),
        index: props.index ?? 0,
        resolveStatus: (statusPath) => {
          const lastDot = statusPath.lastIndexOf('.')
          if (lastDot === -1) return undefined
          const fieldKey = statusPath.slice(0, lastDot)
          const prop = statusPath.slice(lastDot + 1)
          const entry = props.form.getStatus(fieldKey) as unknown as Record<string, unknown>
          return entry?.[prop]
        },
      }),
    )
  } catch {
    return fallback
  }
}

/** Row children are not part of the compiled graph, so evaluate locally. */
function localStatus(): FieldStatus {
  return {
    visible: evaluateFlag(props.node.visible, true),
    disabled: evaluateFlag(props.node.disabled, false),
    required: evaluateFlag(props.node.required, false),
  }
}

const { status, errors, value } = useField(
  props.form,
  path,
  compiled.value ? undefined : localStatus,
)

const requiredMark = computed(
  () => status.value.required || (props.node.rules ?? []).some((rule) => rule.kind === 'required'),
)

const nodeProps = computed<Record<string, unknown>>(() => props.node.props ?? {})
const help = computed(() => {
  const text = nodeProps.value.help ?? nodeProps.value.description
  return typeof text === 'string' ? text : ''
})

const controlProps = computed(() => {
  const { help: _help, description: _description, ...rest } = nodeProps.value
  void _help
  void _description
  return {
    ...rest,
    id: controlId,
    disabled: status.value.disabled,
    invalid: errors.value.length > 0,
  }
})

const span = computed(() => {
  const fallback = isLayoutType(props.node.type) ? 12 : 12
  const raw = Number(props.node.layout?.colSpan ?? fallback)
  return Math.max(1, Math.min(12, Number.isFinite(raw) ? raw : fallback))
})

const spanStyle = computed(() => ({ '--sf-span': String(span.value) }))

const cardTitle = computed(() => String(nodeProps.value.title ?? props.node.label ?? ''))
const cardDescription = computed(() => {
  const text = nodeProps.value.description
  return typeof text === 'string' ? text : ''
})

const childNodes = computed(() => props.node.children ?? [])
const isArray = computed(() => props.node.type === 'array')
const rows = computed<Record<string, unknown>[]>(() => {
  const current = value.value
  return Array.isArray(current) ? (current as Record<string, unknown>[]) : []
})
const tabNodes = computed(() => childNodes.value.filter((child) => child.type === 'tab'))
const activeChildren = computed(() => {
  if (tabNodes.value.length === 0) return childNodes.value
  return tabNodes.value[activeTab.value]?.children ?? []
})

const gridColumns = computed(() => {
  const raw = Number(nodeProps.value.columns)
  return Number.isFinite(raw) && raw > 0 ? Math.min(24, Math.round(raw)) : 12
})

function createRow(): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  const fill = (nodes: FieldNode[]) => {
    for (const child of nodes) {
      if (isLayoutType(child.type) && child.type !== 'array') {
        if (child.children) fill(child.children)
        continue
      }
      if (child.type === 'array') {
        row[child.key] = []
        continue
      }
      row[child.key] = Object.prototype.hasOwnProperty.call(child, 'defaultValue')
        ? deepClone(child.defaultValue)
        : defaultValueForType(child.type)
    }
  }
  fill(childNodes.value)
  return row
}

function addRow(): void {
  props.form.setValue(path.value, [...rows.value, createRow()])
}

function removeRow(index: number): void {
  const next = [...rows.value]
  next.splice(index, 1)
  props.form.setValue(path.value, next)
}

function submitValue(next: unknown): void {
  props.form.setValue(path.value, next)
}

function onBlur(): void {
  if (compiled.value) void props.form.validateField(path.value)
}

function tabLabel(tab: FieldNode): string {
  const propsLabel = tab.props?.label ?? tab.props?.title
  return typeof propsLabel === 'string' ? propsLabel : tab.label || tab.key
}
</script>

<template>
  <div
    v-if="status.visible"
    class="sf-col"
    :class="{ 'sf-col--bare': bare }"
    :style="spanStyle"
    :data-field="path"
  >
    <!-- Layout: card -->
    <section v-if="node.type === 'card'" class="sf-card">
      <header v-if="cardTitle || cardDescription" class="sf-card__head">
        <h4>{{ cardTitle }}</h4>
        <p v-if="cardDescription">{{ cardDescription }}</p>
      </header>
      <div class="sf-grid" :style="{ '--sf-cols': gridColumns }">
        <FieldNode
          v-for="child in childNodes"
          :key="child.key"
          :node="child"
          :form="form"
          :prefix="prefix"
          :index="index"
        />
      </div>
    </section>

    <!-- Layout: grid -->
    <div
      v-else-if="node.type === 'grid'"
      class="sf-grid"
      :style="{ '--sf-cols': gridColumns }"
    >
      <FieldNode
        v-for="child in childNodes"
        :key="child.key"
        :node="child"
        :form="form"
        :prefix="prefix"
        :index="index"
      />
    </div>

    <!-- Layout: tabs -->
    <section v-else-if="node.type === 'tabs'" class="sf-tabs">
      <div v-if="tabNodes.length" class="sf-tabs__bar" role="tablist">
        <button
          v-for="(tab, tabIndex) in tabNodes"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === tabIndex"
          @click="activeTab = tabIndex"
        >
          {{ tabLabel(tab) }}
        </button>
      </div>
      <div class="sf-tabs__panel" role="tabpanel">
        <div class="sf-grid" :style="{ '--sf-cols': gridColumns }">
          <FieldNode
            v-for="child in activeChildren"
            :key="child.key"
            :node="child"
            :form="form"
            :prefix="prefix"
            :index="index"
          />
        </div>
      </div>
    </section>

    <!-- Layout: collapse -->
    <details v-else-if="node.type === 'collapse'" class="sf-collapse" open>
      <summary>{{ cardTitle }}</summary>
      <div class="sf-collapse__body">
        <div class="sf-grid" :style="{ '--sf-cols': gridColumns }">
          <FieldNode
            v-for="child in childNodes"
            :key="child.key"
            :node="child"
            :form="form"
            :prefix="prefix"
            :index="index"
          />
        </div>
      </div>
    </details>

    <!-- Layout: array -->
    <section v-else-if="isArray" class="sf-array">
      <header class="sf-array__head">
        <div>
          <h4>{{ node.label }}</h4>
          <span>{{ rows.length }} {{ rows.length === 1 ? 'row' : 'rows' }}</span>
        </div>
        <button type="button" class="sf-array__add" :disabled="status.disabled" @click="addRow">
          + 添加一行
        </button>
      </header>
      <div v-if="rows.length === 0" class="sf-array__empty">
        这是一个数组容器，添加第一行后即可填写子字段。
      </div>
      <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="sf-array__row">
        <div class="sf-array__no">{{ String(rowIndex + 1).padStart(2, '0') }}</div>
        <div class="sf-grid sf-array__grid" :style="{ '--sf-cols': gridColumns }">
          <FieldNode
            v-for="child in childNodes"
            :key="child.key"
            :node="child"
            :form="form"
            :prefix="path"
            :index="rowIndex"
          />
        </div>
        <button
          type="button"
          class="sf-array__remove"
          :disabled="status.disabled"
          :aria-label="`删除第 ${rowIndex + 1} 行`"
          @click="removeRow(rowIndex)"
        >
          ×
        </button>
      </div>
    </section>

    <!-- Layout: tab (rendered through parent) -->
    <div v-else-if="node.type === 'tab'" class="sf-grid" :style="{ '--sf-cols': gridColumns }">
      <FieldNode
        v-for="child in childNodes"
        :key="child.key"
        :node="child"
        :form="form"
        :prefix="prefix"
        :index="index"
      />
    </div>

    <!-- Leaf field -->
    <div v-else class="sf-field" :class="{ 'is-invalid': errors.length > 0 }">
      <div class="sf-field__label">
        <label :for="controlId">
          {{ node.label || node.key }}
          <span v-if="requiredMark" class="sf-req" aria-hidden="true">*</span>
        </label>
        <code class="sf-field__key">{{ node.key }}</code>
      </div>

      <component
        :is="control"
        v-if="control"
        v-bind="controlProps"
        :model-value="value"
        @update:model-value="submitValue"
        @blur="onBlur"
      />
      <UnknownField v-else :type="node.type" />

      <p v-if="help" class="sf-help">{{ help }}</p>
      <p v-for="message in errors" :key="message" class="sf-error">{{ message }}</p>
    </div>
  </div>
</template>
