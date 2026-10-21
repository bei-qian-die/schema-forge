<script setup lang="ts">
import { computed } from 'vue'
import { isLayoutType, type FieldNode, type FormProgram } from '@schema-forge/core'

const props = defineProps<{
  fields: FieldNode[]
  program: FormProgram
  selectedPointer: string | null
}>()

const emit = defineEmits<{
  select: [pointer: string]
}>()

interface Row {
  node: FieldNode
  pointer: string
  depth: number
  container: boolean
  effects: number
}

const rows = computed<Row[]>(() => {
  const output: Row[] = []
  const walk = (nodes: FieldNode[], base: string, depth: number) => {
    nodes.forEach((node, index) => {
      const pointer = `${base}/${index}`
      const compiled = props.program.fieldMap.get(node.key)
      const effects = props.program.effects.filter(
        (effect) => effect.fieldKey === node.key,
      ).length
      output.push({
        node,
        pointer,
        depth,
        container: isLayoutType(node.type) || Boolean(compiled?.isContainer),
        effects,
      })
      if (node.children?.length) walk(node.children, `${pointer}/children`, depth + 1)
    })
  }
  walk(props.fields, '/fields', 0)
  return output
})
</script>

<template>
  <div class="sfd-outline">
    <button
      v-for="row in rows"
      :key="row.pointer"
      type="button"
      class="sfd-outline__row"
      :class="{
        'is-selected': row.pointer === selectedPointer,
        'is-container': row.container,
      }"
      :style="{ '--sfd-depth': String(row.depth) }"
      @click="emit('select', row.pointer)"
    >
      <span class="sfd-outline__glyph" aria-hidden="true">
        {{ row.container ? '▸' : '·' }}
      </span>
      <span class="sfd-outline__label">{{ row.node.label || row.node.key }}</span>
      <code class="sfd-outline__key">{{ row.node.key }}</code>
      <em v-if="row.effects" class="sfd-outline__fx">fx{{ row.effects }}</em>
    </button>
    <p v-if="rows.length === 0" class="sfd-empty-line">还没有字段，从物料库拖入一个。</p>
  </div>
</template>
