<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    id?: string
    modelValue?: unknown
    disabled?: boolean
    max?: number
  }>(),
  { max: 5 },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const current = computed(() => {
  const value = Number(props.modelValue)
  return Number.isFinite(value) ? value : 0
})

const stars = computed(() => Array.from({ length: Math.max(1, Math.min(10, props.max)) }, (_, i) => i + 1))
</script>

<template>
  <div :id="id" class="sf-rate" role="radiogroup" aria-label="评分">
    <button
      v-for="star in stars"
      :key="star"
      type="button"
      :class="{ 'is-on': star <= current }"
      :disabled="disabled"
      :aria-label="`${star} 分`"
      :aria-checked="star === current"
      role="radio"
      @click="emit('update:modelValue', star)"
    >
      ★
    </button>
    <span class="sf-rate__value">{{ current }} / {{ stars.length }}</span>
  </div>
</template>
