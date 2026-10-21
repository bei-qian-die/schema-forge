<script setup lang="ts">
import { computed, ref } from 'vue'
import { getMaterial, isLayoutType, type FieldNode } from '@schema-forge/core'
import type { DragPayload } from '../useDesigner'

const props = defineProps<{
  node: FieldNode
  pointer: string
  parentPointer: string
  index: number
  selectedPointer: string | null
}>()

const emit = defineEmits<{
  select: [pointer: string]
  'drop-before': [payload: DragPayload, parentPointer: string, index: number]
  'drop-inside': [payload: DragPayload, pointer: string]
}>()

const overBefore = ref(false)
const overInside = ref(false)

const isContainer = computed(() => isLayoutType(props.node.type))
const isTab = computed(() => props.node.type === 'tab')
const material = computed(() => getMaterial(props.node.type))
const selected = computed(() => props.selectedPointer === props.pointer)
const span = computed(() => {
  const raw = Number(props.node.layout?.colSpan ?? 12)
  return Math.max(1, Math.min(12, Number.isFinite(raw) ? Math.round(raw) : 12))
})
const children = computed(() => props.node.children ?? [])
const childBase = computed(() => `${props.pointer}/children`)
const propsRecord = computed<Record<string, unknown>>(() => props.node.props ?? {})

const title = computed(() => {
  const raw = propsRecord.value.title ?? propsRecord.value.label
  return typeof raw === 'string' && raw ? raw : props.node.label || props.node.key
})

const tabs = computed(() =>
  children.value
    .filter((child) => child.type === 'tab')
    .map((child) => String(child.props?.label ?? child.label ?? child.key)),
)

const options = computed<string[]>(() => {
  const raw = propsRecord.value.options
  if (Array.isArray(raw)) {
    return raw.map((option) => {
      if (option && typeof option === 'object' && 'label' in option) {
        return String((option as { label?: unknown }).label ?? '')
      }
      return String(option)
    })
  }
  if (typeof propsRecord.value.optionsText === 'string') {
    return propsRecord.value.optionsText.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
})

const placeholder = computed(() => String(propsRecord.value.placeholder ?? material.value?.title ?? props.node.type))

const mockText = computed(() => {
  const type = props.node.type
  const value = props.node.defaultValue
  if (type === 'select') return options.value[0] ?? placeholder.value
  if (type === 'radio' || type === 'checkbox') return options.value.slice(0, 2).join('  ·  ') || '选项 A · 选项 B'
  if (type === 'number') {
    const prefix = typeof propsRecord.value.prefix === 'string' ? propsRecord.value.prefix : ''
    const suffix = typeof propsRecord.value.suffix === 'string' ? propsRecord.value.suffix : ''
    return `${prefix}${value === undefined ? '0.00' : String(value)}${suffix}`
  }
  if (type === 'date') return typeof value === 'string' && value ? value : 'YYYY-MM-DD'
  if (type === 'divider') return String(propsRecord.value.text ?? 'SECTION')
  if (type === 'static') return String(propsRecord.value.text ?? '说明文字')
  if (typeof value === 'string' && value) return value
  return placeholder.value
})

const effects = computed(() => {
  const rows: { prop: string; source: string }[] = []
  for (const prop of ['visible', 'disabled', 'required'] as const) {
    const source = props.node[prop]
    if (typeof source === 'string') rows.push({ prop, source })
  }
  return rows
})

const tags = computed(() => {
  const output: { text: string; tone: string }[] = []
  if (props.node.required === true) output.push({ text: 'required', tone: 'warn' })
  if (typeof props.node.required === 'string') output.push({ text: 'fx required', tone: 'warn' })
  if (typeof props.node.visible === 'string') output.push({ text: 'fx visible', tone: 'blue' })
  if (typeof props.node.disabled === 'string' || props.node.disabled === true) {
    output.push({ text: 'disabled', tone: 'muted' })
  }
  if (props.node.type === 'array') output.push({ text: 'rows', tone: 'muted' })
  if (isContainer.value && children.value.length > 0) {
    output.push({ text: `${children.value.length} children`, tone: 'muted' })
  }
  return output
})

function readPayload(event: DragEvent): DragPayload | null {
  const transfer = event.dataTransfer
  if (!transfer) return null
  const materialType = transfer.getData('application/x-sf-material')
  if (materialType) return { kind: 'material', type: materialType }
  const nodePointer = transfer.getData('application/x-sf-node')
  if (nodePointer) return { kind: 'node', pointer: nodePointer }
  const text = transfer.getData('text/plain')
  if (text.startsWith('sf:material:')) return { kind: 'material', type: text.slice(12) }
  if (text.startsWith('sf:node:')) return { kind: 'node', pointer: text.slice(8) }
  return null
}

function onDragStart(event: DragEvent): void {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-sf-node', props.pointer)
  event.dataTransfer.setData('text/plain', `sf:node:${props.pointer}`)
}

function hasDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  if (!types) return false
  return (
    types.includes('application/x-sf-material') ||
    types.includes('application/x-sf-node') ||
    types.includes('text/plain')
  )
}

function onBeforeOver(event: DragEvent): void {
  if (!hasDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  overBefore.value = true
}

function onBeforeLeave(): void {
  overBefore.value = false
}

function onBeforeDrop(event: DragEvent): void {
  event.preventDefault()
  event.stopPropagation()
  overBefore.value = false
  const payload = readPayload(event)
  if (!payload) return
  emit('drop-before', payload, props.parentPointer, props.index)
}

function onInsideOver(event: DragEvent): void {
  if (!hasDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  overInside.value = true
}

function onInsideDrop(event: DragEvent): void {
  event.preventDefault()
  event.stopPropagation()
  overInside.value = false
  const payload = readPayload(event)
  if (!payload) return
  emit('drop-inside', payload, props.pointer)
}

function selectSelf(): void {
  emit('select', props.pointer)
}
</script>

<template>
  <div
    class="cvs-item"
    :class="{ 'is-selected': selected, 'is-container-item': isContainer, 'is-tab-item': isTab }"
    :style="{ gridColumn: `span ${span}` }"
  >
    <div
      class="cvs-drop-before"
      :class="{ 'is-active': overBefore }"
      @dragover="onBeforeOver"
      @dragleave="onBeforeLeave"
      @drop="onBeforeDrop"
    >
      <span>插入到这里</span>
    </div>

    <!-- container nodes -->
    <section
      v-if="isContainer"
      class="cvs-node cvs-container"
      :class="[
        `cvs-container--${node.type}`,
        { 'is-selected': selected, 'is-drop-inside': overInside },
      ]"
      tabindex="0"
      @click.stop="selectSelf"
      @keydown.enter.stop="selectSelf"
    >
      <header
        class="cvs-container__head"
        draggable="true"
        @dragstart.stop="onDragStart"
      >
        <span class="cvs-grip" aria-hidden="true">⠿</span>
        <span class="cvs-container__icon" aria-hidden="true">{{ material?.icon || '▦' }}</span>
        <span class="cvs-container__title">{{ title }}</span>
        <code class="cvs-key">{{ node.key }}</code>
        <em class="cvs-type">{{ node.type }}</em>
        <span
          v-for="tag in tags"
          :key="tag.text"
          class="cvs-tag"
          :class="`cvs-tag--${tag.tone}`"
        >{{ tag.text }}</span>
        <span v-if="node.type === 'array'" class="cvs-container__count">
          {{ Array.isArray(node.defaultValue) ? node.defaultValue.length : 0 }} rows
        </span>
      </header>

      <div v-if="node.type === 'tabs' && tabs.length" class="cvs-tabbar" aria-hidden="true">
        <span v-for="(tab, tabIndex) in tabs" :key="tab" :class="{ 'is-on': tabIndex === 0 }">
          {{ tab }}
        </span>
      </div>

      <div v-if="children.length" class="cvs-grid cvs-container__body">
        <CanvasNode
          v-for="(child, childIndex) in children"
          :key="child.key"
          :node="child"
          :pointer="`${childBase}/${childIndex}`"
          :parent-pointer="childBase"
          :index="childIndex"
          :selected-pointer="selectedPointer"
          @select="emit('select', $event)"
          @drop-before="(payload, parent, index) => emit('drop-before', payload, parent, index)"
          @drop-inside="(payload, pointer) => emit('drop-inside', payload, pointer)"
        />
      </div>
      <p v-else class="cvs-container__empty">
        {{ node.type === 'array' ? '数组行模板为空，从物料库拖入字段。' : '空容器，拖入物料开始搭建。' }}
      </p>

      <div
        class="cvs-drop-inside"
        :class="{ 'is-active': overInside }"
        @dragover="onInsideOver"
        @dragleave="overInside = false"
        @drop="onInsideDrop"
      >
        {{ node.type === 'tabs' ? '拖入第一个标签页' : '拖入容器末尾' }}
      </div>
    </section>

    <!-- leaf fields -->
    <div
      v-else
      class="cvs-node cvs-field"
      :class="[`cvs-field--${node.type}`, { 'is-selected': selected }]"
      tabindex="0"
      draggable="true"
      @dragstart.stop="onDragStart"
      @click.stop="selectSelf"
      @keydown.enter.stop="selectSelf"
    >
      <header class="cvs-field__top">
        <span class="cvs-grip" aria-hidden="true">⠿</span>
        <code class="cvs-key">{{ node.key }}</code>
        <span class="cvs-field__label">{{ node.label }}</span>
        <span
          v-for="tag in tags"
          :key="tag.text"
          class="cvs-tag"
          :class="`cvs-tag--${tag.tone}`"
        >{{ tag.text }}</span>
      </header>

      <div class="cvs-mock">
        <template v-if="node.type === 'switch'">
          <span class="cvs-mock__switch" aria-hidden="true"><i></i></span>
          <span>{{ node.defaultValue ? (propsRecord.activeText ?? '是') : (propsRecord.inactiveText ?? '否') }}</span>
        </template>
        <template v-else-if="node.type === 'slider'">
          <span class="cvs-mock__slider" aria-hidden="true"><i></i></span>
          <span>{{ propsRecord.prefix ?? '' }}0{{ propsRecord.suffix ?? '' }}</span>
        </template>
        <template v-else-if="node.type === 'rate'">
          <span class="cvs-mock__rate" aria-hidden="true">★★★★★</span>
        </template>
        <template v-else-if="node.type === 'divider'">
          <span class="cvs-mock__divider">{{ mockText }}</span>
        </template>
        <template v-else-if="node.type === 'static'">
          <span class="cvs-mock__static">{{ mockText }}</span>
        </template>
        <template v-else-if="node.type === 'textarea'">
          <span class="cvs-mock__lines" aria-hidden="true"><i></i><i></i></span>
          <span class="cvs-mock__ph">{{ placeholder }}</span>
        </template>
        <template v-else-if="node.type === 'select'">
          <span class="cvs-mock__ph">{{ mockText }}</span>
          <em class="cvs-mock__caret">▾</em>
        </template>
        <template v-else>
          <span class="cvs-mock__ph">{{ mockText }}</span>
          <em v-if="node.type === 'date'" class="cvs-mock__caret">▤</em>
        </template>
      </div>

      <div v-if="effects.length" class="cvs-fx">
        <span v-for="effect in effects.slice(0, 2)" :key="effect.prop">
          <b>fx {{ effect.prop }}</b>{{ effect.source }}
        </span>
      </div>
    </div>
  </div>
</template>
