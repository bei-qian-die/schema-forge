<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: '' })
</script>

<template>
  <div class="sf-divider">
    <span v-if="text">{{ text }}</span>
  </div>
</template>
