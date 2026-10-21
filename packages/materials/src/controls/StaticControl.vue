<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: '' })
</script>

<template>
  <div class="sf-static">{{ text }}</div>
</template>
