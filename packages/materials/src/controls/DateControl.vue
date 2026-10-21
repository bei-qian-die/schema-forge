<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  id?: string
  modelValue?: unknown
  disabled?: boolean
  invalid?: boolean
  min?: string
  max?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: []
}>()

const text = computed(() => (props.modelValue == null ? '' : String(props.modelValue)))
</script>

<template>
  <input
    :id="id"
    class="sf-input sf-input--mono"
    type="date"
    :value="text"
    :min="min"
    :max="max"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @blur="emit('blur')"
  />
</template>
