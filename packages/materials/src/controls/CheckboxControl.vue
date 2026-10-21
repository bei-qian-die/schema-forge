<script setup lang="ts">
import { computed } from 'vue'

interface Option {
  label: string
  value: unknown
}

const props = defineProps<{
  id?: string
  modelValue?: unknown
  disabled?: boolean
  options?: unknown
  optionsText?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown[]]
}>()

const normalized = computed<Option[]>(() => {
  if (Array.isArray(props.options)) {
    return props.options.map((option) => {
      if (option && typeof option === 'object' && 'value' in option) {
        const record = option as { value: unknown; label?: unknown }
        return { label: String(record.label ?? record.value), value: record.value }
      }
      return { label: String(option), value: option }
    })
  }
  return String(props.optionsText ?? '')
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ label: item, value: item }))
})

const selected = computed<unknown[]>(() => (Array.isArray(props.modelValue) ? props.modelValue : []))

function toggle(value: unknown): void {
  const exists = selected.value.some((item) => Object.is(item, value))
  emit(
    'update:modelValue',
    exists ? selected.value.filter((item) => !Object.is(item, value)) : [...selected.value, value],
  )
}
</script>

<template>
  <div class="sf-options" role="group">
    <label v-for="(option, index) in normalized" :key="index" class="sf-option">
      <input
        type="checkbox"
        :checked="selected.some((item) => Object.is(item, option.value))"
        :disabled="disabled"
        @change="toggle(option.value)"
      />
      {{ option.label }}
    </label>
  </div>
</template>
