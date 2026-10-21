<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FormProgram, FormSchema } from '@schema-forge/core'
import type { DragPayload } from '../useDesigner'
import CanvasNode from './CanvasNode.vue'

const props = defineProps<{
  schema: FormSchema
  program: FormProgram
  selectedPointer: string | null
}>()

const emit = defineEmits<{
  select: [pointer: string | null]
  'drop-before': [payload: DragPayload, parentPointer: string, index: number]
  'drop-inside': [payload: DragPayload, pointer: string]
}>()

const active = ref(false)
const fields = computed(() => props.schema.fields ?? [])

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

function onOver(event: DragEvent): void {
  const types = event.dataTransfer?.types
  if (!types?.includes('application/x-sf-material') && !types?.includes('application/x-sf-node')) {
    return
  }
  event.preventDefault()
  active.value = true
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  active.value = false
  const payload = readPayload(event)
  if (!payload) return
  emit('drop-before', payload, '/fields', fields.value.length)
}
</script>

<template>
  <div class="cvs-stage" @click.self="emit('select', null)">
    <div class="cvs-stage__meta">
      <span>12-column blueprint</span>
      <span>{{ program.stats.fieldCount }} fields</span>
      <span>{{ program.stats.expressionCount }} expressions</span>
      <span>{{ program.stats.edgeCount }} edges</span>
    </div>

    <div class="cvs-grid cvs-grid--root" :style="{ '--cvs-cols': program.layout.columns || 12 }">
      <CanvasNode
        v-for="(node, index) in fields"
        :key="node.key"
        :node="node"
        :pointer="`/fields/${index}`"
        parent-pointer="/fields"
        :index="index"
        :selected-pointer="selectedPointer"
        @select="emit('select', $event)"
        @drop-before="(payload, parent, target) => emit('drop-before', payload, parent, target)"
        @drop-inside="(payload, pointer) => emit('drop-inside', payload, pointer)"
      />

      <div
        v-if="fields.length === 0"
        class="cvs-empty"
        @dragover="onOver"
        @dragleave="active = false"
        @drop="onDrop"
      >
        <b>从左侧拖入第一个物料</b>
        <span>也可以点击物料，默认追加到根容器。</span>
      </div>
    </div>

    <div
      class="cvs-root-drop"
      :class="{ 'is-active': active }"
      @dragover="onOver"
      @dragleave="active = false"
      @drop="onDrop"
    >
      <span>+ 根部容器末尾</span>
    </div>

    <p class="cvs-footnote">
      <span>选中字段后按 <kbd>Ctrl</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd> 排序，<kbd>Delete</kbd> 删除。</span>
      <span v-if="program.cyclic.length" class="cvs-footnote__danger">
        {{ program.cycles.length }} 个循环依赖，检查 expr 面板。
      </span>
    </p>
  </div>
</template>
