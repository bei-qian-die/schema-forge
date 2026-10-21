<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  id?: string
  modelValue?: unknown
  disabled?: boolean
  activeText?: string
  inactiveText?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const on = computed(() => Boolean(props.modelValue))

function toggle(): void {
  if (props.disabled) return
  emit('update:modelValue', !on.value)
}
</script>

<template>
  <button
    :id="id"
    type="button"
    class="sf-switch"
    role="switch"
    :aria-checked="on"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="sf-switch__track" aria-hidden="true"></span>
    <span class="sf-switch__state">
      {{ on ? activeText || '开启' : inactiveText || '关闭' }}
    </span>
  </button>
</template>
