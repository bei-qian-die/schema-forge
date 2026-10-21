<script setup lang="ts">
defineProps<{ type: string }>()
</script>

<template>
  <div class="sf-unknown">
    <span>未注册物料</span>
    <code>{{ type }}</code>
  </div>
</template>
