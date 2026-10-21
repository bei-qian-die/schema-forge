<script setup lang="ts">
import { computed } from 'vue'
import type { FormProgram } from '@schema-forge/core'

const props = defineProps<{
  program: FormProgram
  selectedKey: string | null
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const NODE_W = 172
const NODE_H = 32
const GAP_X = 78
const GAP_Y = 20
const PAD = 22

interface GraphNode {
  id: string
  fieldKey: string
  prop: string
  kind: 'value' | 'effect' | 'external'
  level: number
  row: number
  x: number
  y: number
  cyclic: boolean
}

interface GraphEdge {
  id: string
  from: GraphNode
  to: GraphNode
  path: string
  cyclic: boolean
  active: boolean
}

const nodeIndex = computed(() => {
  const map = new Map<string, number>()
  props.program.graph.nodes.forEach((node, index) => map.set(node, index))
  return map
})

const cyclicNodes = computed(() => new Set(props.program.cyclic))

const cycleEdges = computed(() => {
  const edges = new Set<string>()
  for (const cycle of props.program.cycles) {
    for (let index = 0; index < cycle.length - 1; index++) {
      edges.add(`${cycle[index]}\u0000${cycle[index + 1]}`)
    }
  }
  return edges
})

const layout = computed(() => {
  const graph = props.program.graph
  const levels = new Map<string, number>()
  for (const node of graph.nodes) levels.set(node, 0)

  for (const node of props.program.order) {
    const base = levels.get(node) ?? 0
    for (const target of graph.adj.get(node) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 0, base + 1))
    }
  }

  const cyclic = [...cyclicNodes.value]
  const cyclicLevel = Math.max(0, ...levels.values()) + (cyclic.length ? 1 : 0)
  for (const node of cyclic) levels.set(node, cyclicLevel)

  const byLevel = new Map<number, string[]>()
  for (const id of graph.nodes) {
    const level = levels.get(id) ?? 0
    const bucket = byLevel.get(level) ?? []
    bucket.push(id)
    byLevel.set(level, bucket)
  }

  const orderedLevels = [...byLevel.keys()].sort((a, b) => a - b)
  const rows = Math.max(1, ...orderedLevels.map((level) => byLevel.get(level)!.length))
  const width = PAD * 2 + orderedLevels.length * NODE_W + Math.max(0, orderedLevels.length - 1) * GAP_X
  const height = PAD * 2 + rows * (NODE_H + GAP_Y) - GAP_Y

  const nodes = new Map<string, GraphNode>()
  orderedLevels.forEach((level, column) => {
    const ids = [...(byLevel.get(level) ?? [])].sort(
      (a, b) => (nodeIndex.value.get(a) ?? 0) - (nodeIndex.value.get(b) ?? 0),
    )
    ids.forEach((id, row) => {
      const kind = graph.kinds.get(id) ?? 'external'
      const effect = props.program.effectMap.get(id)
      const fieldKey = effect?.fieldKey ?? id
      const prop = effect?.prop ?? ''
      nodes.set(id, {
        id,
        fieldKey,
        prop,
        kind,
        level,
        row,
        x: PAD + column * (NODE_W + GAP_X),
        y: PAD + row * (NODE_H + GAP_Y),
        cyclic: cyclicNodes.value.has(id),
      })
    })
  })

  const edges: GraphEdge[] = []
  for (const [from, targets] of graph.adj) {
    const source = nodes.get(from)
    if (!source) continue
    for (const to of targets) {
      const target = nodes.get(to)
      if (!target) continue
      const x1 = source.x + NODE_W
      const y1 = source.y + NODE_H / 2
      const x2 = target.x
      const y2 = target.y + NODE_H / 2
      const bend = Math.max(36, Math.abs(x2 - x1) * 0.45)
      const active =
        props.selectedKey !== null &&
        (source.fieldKey === props.selectedKey || target.fieldKey === props.selectedKey)
      edges.push({
        id: `${from}->${to}`,
        from: source,
        to: target,
        path: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`,
        cyclic: cycleEdges.value.has(`${from}\u0000${to}`),
        active,
      })
    }
  }

  return { nodes: [...nodes.values()], edges, width: Math.max(width, 420), height: Math.max(height, 160) }
})

function truncate(text: string, length = 20): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

function selectNode(node: GraphNode): void {
  emit('select', node.fieldKey)
}
</script>

<template>
  <div class="sfd-graph">
    <div class="sfd-graph__legend">
      <span><i class="is-value"></i>字段值</span>
      <span><i class="is-effect"></i>联动效果</span>
      <span><i class="is-cycle"></i>循环依赖</span>
      <span class="sfd-graph__hint">点击节点定位字段</span>
    </div>
    <div class="sfd-graph__scroll">
      <svg
        :width="layout.width"
        :height="layout.height"
        :viewBox="`0 0 ${layout.width} ${layout.height}`"
        role="img"
        aria-label="字段联动依赖图"
      >
        <defs>
          <marker id="sfd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#4c7df0" />
          </marker>
          <marker id="sfd-arrow-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#ff2e88" />
          </marker>
          <marker id="sfd-arrow-cycle" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#ff6b5e" />
          </marker>
        </defs>

        <g opacity=".14" stroke="#4c7df0" stroke-width="1">
          <line
            v-for="column in 8"
            :key="column"
            :x1="0"
            :x2="layout.width"
            :y1="column * 40"
            :y2="column * 40"
            stroke-dasharray="2 6"
          />
        </g>

        <path
          v-for="edge in layout.edges"
          :key="edge.id"
          :d="edge.path"
          fill="none"
          :stroke="edge.cyclic ? '#ff6b5e' : edge.active ? '#ff2e88' : '#3f5a8f'"
          :stroke-width="edge.active || edge.cyclic ? 1.8 : 1.2"
          :stroke-dasharray="edge.cyclic ? '4 3' : undefined"
          :marker-end="edge.cyclic ? 'url(#sfd-arrow-cycle)' : edge.active ? 'url(#sfd-arrow-active)' : 'url(#sfd-arrow)'"
          :opacity="selectedKey && !edge.active ? 0.52 : 1"
        />

        <g
          v-for="node in layout.nodes"
          :key="node.id"
          class="sfd-graph__node"
          :class="{ 'is-selected': node.fieldKey === selectedKey, 'is-cyclic': node.cyclic }"
          @click="selectNode(node)"
        >
          <rect
            :x="node.x"
            :y="node.y"
            :width="NODE_W"
            :height="NODE_H"
            :rx="1"
            :fill="node.kind === 'value' ? '#16336b' : node.cyclic ? '#3a1618' : '#1b222b'"
            :stroke="node.cyclic ? '#ff6b5e' : node.fieldKey === selectedKey ? '#ff2e88' : '#334154'"
            :stroke-width="node.fieldKey === selectedKey || node.cyclic ? 1.6 : 1"
          />
          <rect
            :x="node.x"
            :y="node.y"
            width="3"
            :height="NODE_H"
            :fill="node.kind === 'value' ? '#4c7df0' : node.kind === 'effect' ? '#ff2e88' : '#5a6474'"
          />
          <text
            :x="node.x + 12"
            :y="node.y + 20"
            fill="#e7eaef"
            font-family="Space Mono, Consolas, monospace"
            font-size="9.6"
          >
            {{ truncate(node.fieldKey, node.prop ? 19 : 22) }}
          </text>
          <text
            v-if="node.prop"
            :x="node.x + NODE_W - 8"
            :y="node.y + 20"
            text-anchor="end"
            fill="#8e98a6"
            font-family="Space Mono, Consolas, monospace"
            font-size="8.4"
          >
            {{ node.prop }}
          </text>
          <title>{{ node.id }} · depth {{ node.level }}</title>
        </g>

        <text
          v-for="level in [...new Set(layout.nodes.map((node) => node.level))]"
          :key="`label-${level}`"
          :x="PAD + level * (NODE_W + GAP_X)"
          y="12"
          fill="#616b7a"
          font-family="Space Mono, Consolas, monospace"
          font-size="8.5"
        >
          depth {{ level }}
        </text>
      </svg>
    </div>
  </div>
</template>
