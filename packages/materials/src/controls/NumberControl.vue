<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    id?: string
    modelValue?: unknown
    disabled?: boolean
    invalid?: boolean
    placeholder?: string
    min?: number
    max?: number
    step?: number
    prefix?: string
    suffix?: string
  }>(),
  { step: 1 },
)

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  blur: []
}>()

const text = ref(props.modelValue == null ? '' : String(props.modelValue))

watch(
  () => props.modelValue,
  (value) => {
    const next = value == null ? '' : String(value)
    if (Number(text.value) !== Number(value) || next === '') text.value = next
  },
)

function onInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  text.value = raw
  if (raw.trim() === '') {
    emit('update:modelValue', null)
    return
  }
  const value = Number(raw)
  if (Number.isFinite(value)) emit('update:modelValue', value)
}
</script>

<template>
  <div class="sf-field__row">
    <span v-if="prefix" class="sf-field__prefix">{{ prefix }}</span>
    <input
      :id="id"
      class="sf-input"
      type="number"
      inputmode="decimal"
      :value="text"
      :placeholder="placeholder"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      @input="onInput"
      @blur="emit('blur')"
    />
    <span v-if="suffix" class="sf-field__suffix">{{ suffix }}</span>
  </div>
</template>
