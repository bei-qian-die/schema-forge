<script setup lang="ts">
import { ref } from 'vue'
import type { FieldNode, RuleKind, RuleSpec } from '@schema-forge/core'

const props = defineProps<{
  node: FieldNode
}>()

const emit = defineEmits<{
  update: [rules: FieldNode['rules']]
}>()

const newKind = ref<RuleKind>('pattern')

function write(next: RuleSpec[]): void {
  emit('update', next.length > 0 ? next : undefined)
}

function patchRule(index: number, patch: Partial<RuleSpec>): void {
  const next = (props.node.rules ?? []).map((rule, current) =>
    current === index ? { ...rule, ...patch } : rule,
  )
  write(next)
}

function removeRule(index: number): void {
  write((props.node.rules ?? []).filter((_, current) => current !== index))
}

function onText(index: number, key: keyof RuleSpec, event: Event): void {
  patchRule(index, { [key]: (event.target as HTMLInputElement).value })
}

function onNumber(index: number, key: 'min' | 'max', event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  patchRule(index, { [key]: raw === '' ? undefined : Number(raw) })
}

function onKind(index: number, event: Event): void {
  patchRule(index, { kind: (event.target as HTMLSelectElement).value as RuleKind })
}

function addRule(): void {
  const kind = newKind.value
  const rule: RuleSpec = { kind, message: '' }
  if (kind === 'pattern') rule.value = ''
  if (kind === 'len' || kind === 'range') {
    rule.min = 0
    rule.max = kind === 'len' ? 20 : 100
  }
  if (kind === 'custom') rule.name = ''
  if (kind === 'async-remote') rule.message = '远程校验未通过'
  write([...(props.node.rules ?? []), rule])
}

const kinds: { value: RuleKind; label: string }[] = [
  { value: 'required', label: 'required' },
  { value: 'pattern', label: 'pattern' },
  { value: 'len', label: 'len' },
  { value: 'range', label: 'range' },
  { value: 'async-remote', label: 'async-remote' },
  { value: 'custom', label: 'custom' },
]
</script>

<template>
  <div class="sfd-rules">
    <p class="sfd-panel-note">
      同步规则在输入时立即执行；<code>async-remote</code> 规则由 store 防抖调度，
      同 key 请求自动合并。规则还可以用 <code>when</code> 表达式动态开关。
    </p>

    <article
      v-for="(rule, index) in node.rules ?? []"
      :key="index"
      class="sfd-rule"
    >
      <header class="sfd-rule__head">
        <select
          class="sfd-mini-select"
          :value="rule.kind"
          :aria-label="`第 ${index + 1} 条规则类型`"
          @change="onKind(index, $event)"
        >
          <option v-for="kind in kinds" :key="kind.value" :value="kind.value">
            {{ kind.label }}
          </option>
        </select>
        <button type="button" class="sfd-icon-btn" title="删除规则" @click="removeRule(index)">
          ✕
        </button>
      </header>

      <label class="sfd-mini-field">
        <span>message</span>
        <input
          :value="rule.message"
          spellcheck="false"
          placeholder="校验失败时的提示"
          @input="onText(index, 'message', $event)"
        />
      </label>

      <label v-if="rule.kind === 'pattern'" class="sfd-mini-field">
        <span>pattern</span>
        <input
          :value="String(rule.pattern ?? rule.value ?? '')"
          spellcheck="false"
          placeholder="^[0-9A-Z]{15,20}$"
          @input="onText(index, 'value', $event)"
        />
      </label>

      <div v-if="rule.kind === 'len' || rule.kind === 'range'" class="sfd-rule__duo">
        <label class="sfd-mini-field">
          <span>min</span>
          <input
            type="number"
            :value="rule.min ?? ''"
            @input="onNumber(index, 'min', $event)"
          />
        </label>
        <label class="sfd-mini-field">
          <span>max</span>
          <input
            type="number"
            :value="rule.max ?? ''"
            @input="onNumber(index, 'max', $event)"
          />
        </label>
      </div>

      <label v-if="rule.kind === 'custom'" class="sfd-mini-field">
        <span>validator name</span>
        <input
          :value="String(rule.name ?? '')"
          spellcheck="false"
          placeholder="registerRuleValidator 注册名"
          @input="onText(index, 'name', $event)"
        />
      </label>

      <label class="sfd-mini-field">
        <span>when · 表达式</span>
        <input
          :value="String(rule.when ?? '')"
          spellcheck="false"
          placeholder="可选，例如 $form.amount > 0"
          @input="onText(index, 'when', $event)"
        />
      </label>
    </article>

    <div class="sfd-rule-add">
      <select v-model="newKind" class="sfd-mini-select" aria-label="新规则类型">
        <option v-for="kind in kinds" :key="kind.value" :value="kind.value">
          {{ kind.label }}
        </option>
      </select>
      <button type="button" class="sfd-btn sfd-btn--ghost" @click="addRule">+ 添加规则</button>
    </div>
  </div>
</template>
