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
  invalid?: boolean
  placeholder?: string
  options?: unknown
  optionsText?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  blur: []
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
  if (typeof props.optionsText === 'string') {
    return props.optionsText
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => ({ label: item, value: item }))
  }
  return []
})

const selectedIndex = computed(() => {
  const value = props.modelValue
  const index = normalized.value.findIndex((option) => Object.is(option.value, value))
  return index === -1 ? '' : String(index)
})

function onChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value
  if (raw === '') {
    emit('update:modelValue', undefined)
    return
  }
  emit('update:modelValue', normalized.value[Number(raw)]?.value)
}
</script>

<template>
  <select
    :id="id"
    class="sf-select"
    :value="selectedIndex"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    @change="onChange"
    @blur="emit('blur')"
  >
    <option value="" disabled>{{ placeholder || '请选择' }}</option>
    <option v-for="(option, index) in normalized" :key="index" :value="String(index)">
      {{ option.label }}
    </option>
  </select>
</template>
