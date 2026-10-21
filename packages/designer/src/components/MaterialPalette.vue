<script setup lang="ts">
import { computed, ref } from 'vue'
import { listMaterialsByGroup } from '@schema-forge/core'

const emit = defineEmits<{
  add: [type: string]
}>()

const query = ref('')
const groupOrder = ['文本', '数值', '选择', '展示', '布局']

const groups = computed(() => {
  const all = listMaterialsByGroup()
  const term = query.value.trim().toLowerCase()
  return groupOrder
    .filter((group) => all[group]?.length)
    .map((group) => ({
      name: group,
      items: (all[group] ?? []).filter(
        (material) =>
          material.type !== 'tab' &&
          (!term ||
            material.title.toLowerCase().includes(term) ||
            material.type.toLowerCase().includes(term)),
      ),
    }))
    .filter((group) => group.items.length > 0)
})

function onDragStart(event: DragEvent, type: string): void {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-sf-material', type)
  event.dataTransfer.setData('text/plain', `sf:material:${type}`)
}
</script>

<template>
  <div class="sfd-palette">
    <div class="sfd-palette__search">
      <span aria-hidden="true">⌕</span>
      <input v-model="query" type="search" placeholder="搜索物料" spellcheck="false" />
    </div>

    <div v-for="group in groups" :key="group.name" class="sfd-mat-group">
      <div class="sfd-mat-group__head">
        <span>{{ group.name }}</span>
        <b>{{ group.items.length }}</b>
      </div>
      <div class="sfd-mats">
        <button
          v-for="material in group.items"
          :key="material.type"
          type="button"
          class="sfd-mat"
          draggable="true"
          :title="material.description || material.title"
          @dragstart="onDragStart($event, material.type)"
          @click="emit('add', material.type)"
        >
          <i aria-hidden="true">{{ material.icon || '·' }}</i>
          <span>{{ material.title }}</span>
          <em>{{ material.type }}</em>
        </button>
      </div>
    </div>

    <p class="sfd-palette__hint">
      点击追加到选中位置，或拖入画布。<br />
      容器内可继续嵌套字段。
    </p>
  </div>
</template>
