<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    id?: string
    modelValue?: unknown
    disabled?: boolean
    min?: number
    max?: number
    step?: number
    suffix?: string
  }>(),
  { min: 0, max: 100, step: 1 },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const current = computed(() => {
  const value = Number(props.modelValue)
  return Number.isFinite(value) ? value : props.min
})
</script>

<template>
  <div class="sf-slider">
    <input
      :id="id"
      type="range"
      :value="current"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <output>{{ current }}{{ suffix || '' }}</output>
  </div>
</template>
