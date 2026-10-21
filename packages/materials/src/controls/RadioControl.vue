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
  'update:modelValue': [value: unknown]
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

const name = computed(() => `sf-radio-${props.id ?? Math.random().toString(36).slice(2)}`)

function isChecked(value: unknown): boolean {
  return String(value) === String(props.modelValue ?? '')
}
</script>

<template>
  <div class="sf-options" role="radiogroup">
    <label v-for="(option, index) in normalized" :key="index" class="sf-option">
      <input
        type="radio"
        :name="name"
        :checked="isChecked(option.value)"
        :disabled="disabled"
        @change="emit('update:modelValue', option.value)"
      />
      {{ option.label }}
    </label>
  </div>
</template>
