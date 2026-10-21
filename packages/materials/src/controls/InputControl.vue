<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    id?: string
    modelValue?: unknown
    disabled?: boolean
    invalid?: boolean
    type?: string
    placeholder?: string
    maxLength?: number
    prefix?: string
    suffix?: string
    autocomplete?: string
    mono?: boolean
  }>(),
  { type: 'text', mono: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: []
}>()

const text = computed(() => (props.modelValue == null ? '' : String(props.modelValue)))

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="sf-field__row">
    <span v-if="prefix" class="sf-field__prefix">{{ prefix }}</span>
    <input
      :id="id"
      class="sf-input"
      :class="{ 'sf-input--mono': mono }"
      :type="type"
      :value="text"
      :placeholder="placeholder"
      :maxlength="maxLength"
      :autocomplete="autocomplete"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      @input="onInput"
      @blur="emit('blur')"
    />
    <span v-if="suffix" class="sf-field__suffix">{{ suffix }}</span>
  </div>
</template>
