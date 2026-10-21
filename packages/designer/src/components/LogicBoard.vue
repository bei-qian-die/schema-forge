<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CompiledEffect, FormProgram } from '@schema-forge/core'
import DependencyGraph from './DependencyGraph.vue'

const props = defineProps<{
  program: FormProgram
  selectedKey: string | null
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const activeId = ref<string>('')

const nonLiteral = computed(() =>
  props.program.effects.filter((effect) => !effect.literal && effect.expression),
)

const activeEffect = computed<CompiledEffect | undefined>(() => {
  const found = props.program.effectMap.get(activeId.value)
  if (found) return found
  return nonLiteral.value[0] ?? props.program.effects[0]
})

watch(
  () => props.program.effects,
  () => {
    if (!props.program.effectMap.has(activeId.value)) {
      activeId.value = nonLiteral.value[0]?.id ?? ''
    }
  },
)

const activeDeps = computed(() => {
  const effect = activeEffect.value
  if (!effect) return [] as { id: string; kind: string; label: string }[]
  const rev = props.program.graph.rev.get(effect.id)
  if (!rev) return []
  return [...rev].map((id) => {
    const upstream = props.program.effectMap.get(id)
    return {
      id,
      kind: upstream ? 'effect' : 'value',
      label: upstream ? `${upstream.fieldKey}.${upstream.prop}` : id,
    }
  })
})

const activePosition = computed(() => {
  const effect = activeEffect.value
  if (!effect) return 0
  return props.program.order.indexOf(effect.id) + 1
})

const astText = computed(() => {
  const ast = activeEffect.value?.expression?.ast
  return ast ? JSON.stringify(ast, null, 2) : ''
})

const expressionDeps = computed(() => activeEffect.value?.expression?.dependencies ?? [])

function positionOf(effect: CompiledEffect): number {
  return props.program.order.indexOf(effect.id) + 1
}

function pick(effect: CompiledEffect): void {
  activeId.value = effect.id
  emit('select', effect.fieldKey)
}

function cycleTail(id: string): string[] {
  return props.program.cycles.find((cycle) => cycle.includes(id)) ?? []
}
</script>

<template>
  <div class="sfd-logic">
    <header class="sfd-board-head">
      <div>
        <p class="sfd-board-kicker">Flow C · linkage compiler</p>
        <h2>联动逻辑视图</h2>
        <p>
          表达式在编译期变成 AST，依赖在编译期固定下来；运行时只重算下游闭包，
          再按 Kahn 拓扑序执行。发生环时不会静默给出错误顺序。
        </p>
      </div>
      <div class="sfd-stat-strip">
        <div><b>{{ program.stats.fieldCount }}</b><span>fields</span></div>
        <div><b>{{ program.stats.expressionCount }}</b><span>expr</span></div>
        <div><b>{{ program.stats.edgeCount }}</b><span>edges</span></div>
        <div><b>{{ program.stats.orderLength }}</b><span>topo</span></div>
        <div :class="{ 'is-danger': program.stats.cycleCount > 0 }">
          <b>{{ program.stats.cycleCount }}</b><span>cycles</span>
        </div>
      </div>
    </header>

    <section class="sfd-panel sfd-panel--graph">
      <div class="sfd-section-head">
        <span>依赖图 · dep → effect</span>
        <b>{{ program.stats.nodeCount }} nodes</b>
      </div>
      <DependencyGraph
        :program="program"
        :selected-key="selectedKey"
        @select="(key) => emit('select', key)"
      />
    </section>

    <div class="sfd-logic__grid">
      <section class="sfd-panel sfd-logic__effects">
        <div class="sfd-section-head">
          <span>效果表 · topo 顺序</span>
          <b>{{ program.effects.length }} effects</b>
        </div>
        <div class="sfd-effect-table">
          <button
            v-for="effect in program.effects"
            :key="effect.id"
            type="button"
            class="sfd-effect-row"
            :class="{
              'is-active': effect.id === activeEffect?.id,
              'is-literal': effect.literal,
              'is-cycle': cycleTail(effect.id).length > 0,
            }"
            @click="pick(effect)"
          >
            <i class="sfd-effect-row__order">{{ positionOf(effect) || '—' }}</i>
            <span class="sfd-effect-row__target">
              <b>{{ effect.fieldKey }}</b>
              <em>{{ effect.prop }}</em>
            </span>
            <code class="sfd-effect-row__source">{{ effect.literal ? String(effect.source) : effect.source }}</code>
            <span class="sfd-effect-row__kind">
              {{ effect.literal ? 'literal' : 'expr' }}
            </span>
          </button>
        </div>
      </section>

      <section class="sfd-panel sfd-logic__detail">
        <div class="sfd-section-head">
          <span>表达式详情</span>
          <b>{{ activeEffect ? (activeEffect.literal ? 'static' : `topo #${activePosition || '−'}`) : '—' }}</b>
        </div>

        <template v-if="activeEffect">
          <div class="sfd-detail-head">
            <code>{{ activeEffect.id }}</code>
            <button
              type="button"
              class="sfd-btn sfd-btn--ghost"
              @click="emit('select', activeEffect.fieldKey)"
            >
              定位字段 ↗
            </button>
          </div>

          <pre v-if="!activeEffect.literal" class="sfd-code">{{ activeEffect.source }}</pre>
          <p v-else class="sfd-empty-line">静态效果，不参与表达式求值，也没有依赖边。</p>

          <div v-if="expressionDeps.length" class="sfd-deps">
            <span>static deps</span>
            <code
              v-for="dep in expressionDeps"
              :key="`${dep.kind}:${dep.path}`"
              :class="`is-${dep.kind}`"
            >
              {{ dep.kind === 'status' ? '$status.' : '' }}{{ dep.path }}
            </code>
          </div>

          <div v-if="activeDeps.length" class="sfd-deps">
            <span>graph upstream</span>
            <code v-for="dep in activeDeps" :key="dep.id" :class="`is-${dep.kind}`">
              {{ dep.label }}
            </code>
          </div>

          <div v-if="cycleTail(activeEffect.id).length" class="sfd-diagnostic">
            CircularDependency: {{ cycleTail(activeEffect.id).join(' → ') }}
          </div>

          <details v-if="astText" class="sfd-ast">
            <summary>AST · 编译产物</summary>
            <pre class="sfd-code sfd-code--ast">{{ astText }}</pre>
          </details>
        </template>
        <p v-else class="sfd-empty-line">当前 Schema 没有声明任何可见性 / 禁用 / 必填效果。</p>
      </section>
    </div>

    <section class="sfd-panel">
      <div class="sfd-section-head">
        <span>编译诊断</span>
        <b :class="{ 'is-danger': program.issues.some((issue) => issue.severity === 'error') }">
          {{ program.issues.length }} issues
        </b>
      </div>
      <div v-if="program.issues.length" class="sfd-issues">
        <button
          v-for="(issue, index) in program.issues"
          :key="`${issue.code}-${index}`"
          type="button"
          class="sfd-issue"
          :class="`is-${issue.severity}`"
          @click="issue.fieldKey && emit('select', issue.fieldKey)"
        >
          <span class="sfd-issue__sev">{{ issue.severity === 'error' ? 'ERR' : 'WARN' }}</span>
          <span class="sfd-issue__code">{{ issue.code }}</span>
          <span class="sfd-issue__msg">{{ issue.message }}</span>
          <em v-if="issue.line">{{ issue.line }}:{{ issue.column }}</em>
        </button>
      </div>
      <p v-else class="sfd-empty-line">没有诊断信息，Schema 编译通过。</p>
    </section>

    <section class="sfd-panel">
      <div class="sfd-section-head">
        <span>拓扑序列</span>
        <b>{{ program.order.length }}</b>
      </div>
      <ol v-if="program.order.length" class="sfd-topo sfd-topo--inline">
        <li v-for="(node, index) in program.order" :key="node">
          <i>{{ index + 1 }}</i>
          <span>{{ node }}</span>
        </li>
      </ol>
      <p v-else class="sfd-empty-line">没有需要排序的依赖节点。</p>
    </section>
  </div>
</template>
