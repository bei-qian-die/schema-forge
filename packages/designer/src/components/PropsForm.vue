<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import {
  createForm,
  deepClone,
  propsFields,
  type FieldNode,
  type FormEvent,
  type MaterialSpec,
} from '@schema-forge/core'
import { SchemaRenderer } from '@schema-forge/renderer-vue'

const props = defineProps<{
  node: FieldNode
  material: MaterialSpec
}>()

const emit = defineEmits<{
  'update-props': [props: Record<string, unknown>]
}>()

function normalize(value: unknown): unknown {
  if (value === '' || value === undefined) return undefined
  if (Array.isArray(value) && value.length === 0) return undefined
  return value
}

const fields = computed<FieldNode[]>(() => {
  const source = propsFields(props.material)
  return source.map((field) => ({
    ...deepClone(field),
    layout: { ...(field.layout ?? {}), colSpan: 12 },
  }))
})

const managedKeys = computed(() => new Set(fields.value.map((field) => field.key)))

const initialValues = computed(() => {
  const source = (props.node.props ?? {}) as Record<string, unknown>
  const values: Record<string, unknown> = {}
  for (const key of managedKeys.value) {
    if (source[key] !== undefined) values[key] = deepClone(source[key])
  }
  return values
})

const form = createForm(
  {
    version: '2.0',
    id: `props-${props.node.key}`,
    title: '属性面板',
    layout: { type: 'grid', columns: 12, gutter: 12 },
    fields: fields.value,
  },
  { initialValues: initialValues.value, validateOn: 'submit' },
)

function managedValues(source: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const key of managedKeys.value) {
    const value = normalize(source[key])
    if (value !== undefined) values[key] = deepClone(value)
  }
  return values
}

function nextProps(): Record<string, unknown> {
  const base = deepClone((props.node.props ?? {}) as Record<string, unknown>)
  for (const key of managedKeys.value) delete base[key]
  const values = managedValues(form.getValues())
  return { ...base, ...values }
}

const off = form.subscribe((event: FormEvent) => {
  if (event.type !== 'set') return
  emit('update-props', nextProps())
})
onBeforeUnmount(off)

function sameManaged(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(managedValues(a)) === JSON.stringify(managedValues(b))
}

watch(
  () => props.node.props,
  (next) => {
    const external = (next ?? {}) as Record<string, unknown>
    if (sameManaged(external, form.getValues())) return
    form.reset(managedValues(external))
  },
  { deep: true },
)

const hasFields = computed(() => fields.value.length > 0)
</script>

<template>
  <section class="sfd-props-block">
    <div class="sfd-section-head">
      <span>propsSchema · 引擎自举</span>
      <b>{{ material.type }}</b>
    </div>
    <div v-if="hasFields" class="sfd-props-form">
      <SchemaRenderer :form="form" theme="dark" dense flush />
    </div>
    <p v-else class="sfd-empty-line">该物料没有声明可配置属性。</p>
    <p class="sfd-props-note">
      这份属性面板由 schema-forge 自身编译并渲染，字段来自
      <code>MaterialSpec.propsSchema</code>。
    </p>
  </section>
</template>
