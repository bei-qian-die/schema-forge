<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import type { Form } from '@schema-forge/core'
import FieldNode from './FieldNode.vue'

const props = withDefaults(
  defineProps<{
    form: Form
    /** `dark` is used inside the designer canvas and documentation pages. */
    theme?: 'light' | 'dark'
    dense?: boolean
    /** Show a bare grid without the outer form padding. */
    flush?: boolean
  }>(),
  { theme: 'light', dense: false, flush: false },
)

const emit = defineEmits<{
  change: [payload: { path: string; value: unknown }]
}>()

const off = props.form.subscribe((event) => {
  if (event.type === 'set' && event.path) {
    emit('change', { path: event.path, value: event.value })
  }
})
onBeforeUnmount(off)

const columns = computed(() => {
  const raw = Number(props.form.program.layout.columns)
  return Number.isFinite(raw) && raw > 0 ? Math.min(24, Math.round(raw)) : 12
})
</script>

<template>
  <form
    class="sf-form"
    :class="[
      `sf-form--${theme}`,
      { 'sf-form--dense': dense, 'sf-form--flush': flush },
    ]"
    novalidate
    @submit.prevent
  >
    <div class="sf-grid" :style="{ '--sf-cols': columns }">
      <FieldNode
        v-for="node in form.program.fields"
        :key="node.key"
        :node="node"
        :form="form"
      />
    </div>
  </form>
</template>
