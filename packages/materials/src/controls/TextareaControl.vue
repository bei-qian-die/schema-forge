<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    id?: string
    modelValue?: unknown
    disabled?: boolean
    invalid?: boolean
    placeholder?: string
    rows?: number
    maxLength?: number
  }>(),
  { rows: 3 },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: []
}>()

const text = computed(() => (props.modelValue == null ? '' : String(props.modelValue)))
</script>

<template>
  <textarea
    :id="id"
    class="sf-textarea"
    :rows="rows"
    :value="text"
    :placeholder="placeholder"
    :maxlength="maxLength"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    @blur="emit('blur')"
  />
</template>
