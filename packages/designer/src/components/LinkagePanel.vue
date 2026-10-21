<script setup lang="ts">
import { computed } from 'vue'
import type { FieldNode, FormProgram, StatusProp } from '@schema-forge/core'

const props = defineProps<{
  node: FieldNode
  program: FormProgram
}>()

const emit = defineEmits<{
  'update-effect': [prop: StatusProp, value: string | boolean | undefined]
}>()

type Mode = 'default' | 'static' | 'expr'

interface EffectRow {
  prop: StatusProp
  label: string
  hint: string
  source: string | boolean | undefined
  mode: Mode
  deps: { kind: 'value' | 'status'; path: string }[]
  order: number
  error?: string
}

const rawModes: StatusProp[] = ['visible', 'disabled', 'required']

const rows = computed<EffectRow[]>(() =>
  rawModes.map((prop) => {
    const source = props.node[prop]
    const id = `${props.node.key}.${prop}`
    const effect = props.program.effectMap.get(id)
    const issue = props.program.issues.find(
      (item) =>
        item.fieldKey === props.node.key &&
        item.expression !== undefined &&
        item.expression === source,
    )
    const mode: Mode =
      source === undefined ? 'default' : typeof source === 'boolean' ? 'static' : 'expr'
    return {
      prop,
      label:
        prop === 'visible' ? 'visible · 可见性' : prop === 'disabled' ? 'disabled · 禁用' : 'required · 必填',
      hint:
        prop === 'visible'
          ? '缺省视为可见'
          : prop === 'disabled'
            ? '缺省视为可编辑'
            : '缺省视为非必填',
      source,
      mode,
      deps: effect?.expression?.dependencies ?? [],
      order: props.program.order.indexOf(id) + 1,
      error: issue?.message,
    }
  }),
)

function defaultStatic(prop: StatusProp): boolean {
  return prop === 'visible'
}

function onMode(prop: StatusProp, event: Event): void {
  const mode = (event.target as HTMLSelectElement).value as Mode
  if (mode === 'default') emit('update-effect', prop, undefined)
  else if (mode === 'static') emit('update-effect', prop, defaultStatic(prop))
  else emit('update-effect', prop, 'true')
}

function onStatic(prop: StatusProp, event: Event): void {
  emit('update-effect', prop, (event.target as HTMLInputElement).checked)
}

function onExpression(prop: StatusProp, event: Event): void {
  emit('update-effect', prop, (event.target as HTMLTextAreaElement).value)
}

const reverseDeps = computed(() => {
  const targets = props.program.graph.adj.get(props.node.key)
  if (!targets) return []
  return [...targets].map((target) => {
    const effect = props.program.effectMap.get(target)
    if (effect) return { id: target, label: `${effect.fieldKey} · ${effect.prop}` }
    return { id: target, label: target }
  })
})
</script>

<template>
  <div class="sfd-linkage">
    <p class="sfd-panel-note">
      表达式在编译期解析为 AST 并静态收集依赖；运行时只按拓扑序重算下游闭包。
      支持 <code>$form</code>、<code>$self</code>、<code>$index</code> 与
      <code>$status.field.visible</code>。
    </p>

    <section v-for="row in rows" :key="row.prop" class="sfd-effect">
      <header class="sfd-effect__head">
        <div>
          <span class="sfd-effect__prop">{{ row.label }}</span>
          <small>{{ row.hint }}</small>
        </div>
        <select
          class="sfd-mini-select"
          :value="row.mode"
          :aria-label="`${row.prop} 模式`"
          @change="onMode(row.prop, $event)"
        >
          <option value="default">缺省</option>
          <option value="static">静态值</option>
          <option value="expr">表达式</option>
        </select>
      </header>

      <label v-if="row.mode === 'static'" class="sfd-static-toggle">
        <input
          type="checkbox"
          :checked="Boolean(row.source)"
          @change="onStatic(row.prop, $event)"
        />
        <span>{{ row.source ? 'true' : 'false' }}</span>
      </label>

      <textarea
        v-else-if="row.mode === 'expr'"
        class="sfd-expr-input"
        :value="String(row.source ?? '')"
        rows="2"
        spellcheck="false"
        @input="onExpression(row.prop, $event)"
      />

      <div v-if="row.error" class="sfd-diagnostic">{{ row.error }}</div>

      <div v-if="row.mode === 'expr'" class="sfd-deps">
        <span>deps</span>
        <code v-if="row.deps.length === 0">∅</code>
        <code v-for="dep in row.deps" :key="`${dep.kind}:${dep.path}`" :class="`is-${dep.kind}`">
          {{ dep.kind === 'status' ? '$status.' : '' }}{{ dep.path }}
        </code>
        <em v-if="row.order > 0">topo #{{ row.order }}</em>
      </div>
    </section>

    <section class="sfd-section">
      <div class="sfd-section-head">
        <span>依赖此字段的下游节点</span>
        <b>{{ reverseDeps.length }}</b>
      </div>
      <div v-if="reverseDeps.length" class="sfd-chip-list">
        <code v-for="dep in reverseDeps" :key="dep.id">{{ dep.label }}</code>
      </div>
      <p v-else class="sfd-empty-line">当前没有其他字段依赖它。</p>
    </section>

    <section class="sfd-section">
      <div class="sfd-section-head">
        <span>求值顺序</span>
        <b>topo</b>
      </div>
      <ol class="sfd-topo">
        <li v-for="(node, index) in program.order" :key="node">
          <i>{{ index + 1 }}</i>
          <span>{{ node }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>
