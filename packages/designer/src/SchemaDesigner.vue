<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { listMaterials, type FieldNode, type FormSchema } from '@schema-forge/core'
import { registerBuiltinMaterials } from '@schema-forge/materials'
import '@schema-forge/renderer-vue/style.css'
import './styles/designer.css'
import { useDesigner, type DesignerMode, type InspectorTab } from './useDesigner'
import { downloadSchema } from './utils'
import MaterialPalette from './components/MaterialPalette.vue'
import OutlineTree from './components/OutlineTree.vue'
import DesignerCanvas from './components/DesignerCanvas.vue'
import Inspector from './components/Inspector.vue'
import LogicBoard from './components/LogicBoard.vue'
import RuntimePreview from './components/RuntimePreview.vue'
import SchemaPanel from './components/SchemaPanel.vue'

const props = withDefaults(
  defineProps<{
    initialSchema?: FormSchema
    storageKey?: string
    homeHref?: string
  }>(),
  { storageKey: undefined, homeHref: '', initialSchema: undefined },
)

registerBuiltinMaterials()

const {
  schema,
  program,
  selectedPointer,
  selectedNode,
  selectedMaterial,
  mode,
  inspectorTab,
  drawerOpen,
  leftTab,
  syncState,
  lastSavedAt,
  lastPatch,
  restored,
  errorIssues,
  warningIssues,
  canUndo,
  canRedo,
  undoDepth,
  redoDepth,
  select,
  selectByKey,
  addMaterial,
  dropInside,
  dropBefore,
  moveSelected,
  removeSelected,
  updateSelected,
  updateEffect,
  updateRules,
  replaceSchema,
  undo,
  redo,
  resetSample,
  flushSave,
} = useDesigner({
  storageKey: props.storageKey,
  initialSchema: props.initialSchema,
})

const modes: { id: DesignerMode; label: string; hint: string }[] = [
  { id: 'design', label: '设计', hint: '画布与属性' },
  { id: 'logic', label: '逻辑', hint: '依赖图与表达式' },
  { id: 'preview', label: '预览', hint: '真实运行时' },
  { id: 'schema', label: 'Schema', hint: '双向 JSON' },
]

const materialCount = computed(
  () => listMaterials().filter((material) => material.type !== 'tab').length,
)

const saveLabel = computed(() => {
  if (syncState.value === 'saving') return '保存中…'
  if (syncState.value === 'error') return '本地存储不可用'
  if (!lastSavedAt.value) return '尚未保存'
  const time = new Date(lastSavedAt.value).toLocaleTimeString('zh-CN', { hour12: false })
  return `已保存 ${time}`
})

const toast = ref<{ message: string; tone: 'ok' | 'warn' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function notify(message: string, tone: 'ok' | 'warn' | 'error' = 'ok'): void {
  toast.value = { message, tone }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 2600)
}

const resetArmed = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | null = null

function onReset(): void {
  if (!resetArmed.value) {
    resetArmed.value = true
    notify('再次点击「恢复示例」确认覆盖，可从撤销栈找回', 'warn')
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => (resetArmed.value = false), 4000)
    return
  }
  if (resetTimer) clearTimeout(resetTimer)
  resetArmed.value = false
  resetSample()
  notify('已恢复发票示例 Schema')
}

function onReplace(next: unknown): void {
  const result = replaceSchema(next)
  if (!result.ok) {
    notify(result.error || 'Schema 应用失败', 'error')
    return
  }
  notify('Schema 已应用到画布')
}

function onUpdateProps(next: Record<string, unknown>): void {
  updateSelected(
    { props: next },
    { mergeKey: `props:${selectedPointer.value}` },
  )
}

function onUpdateRules(rules: FieldNode['rules']): void {
  updateRules(rules)
}

function onAddMaterial(type: string): void {
  addMaterial(type)
  leftTab.value = 'outline'
}

function toggleDrawer(): void {
  drawerOpen.value = !drawerOpen.value
}

const fileInput = ref<HTMLInputElement | null>(null)

function triggerImport(): void {
  fileInput.value?.click()
}

async function onImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const result = replaceSchema(parsed)
    if (!result.ok) notify(result.error || '导入失败：Schema 结构不合法', 'error')
    else notify(`已导入 ${file.name}`)
  } catch (error) {
    notify(error instanceof Error ? error.message : '导入失败：JSON 解析错误', 'error')
  } finally {
    input.value = ''
  }
}

function onExport(): void {
  flushSave()
  downloadSchema(schema.value)
  notify('Schema 已导出')
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    element.isContentEditable
  )
}

function onKeydown(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()

  if (mod && key === 's') {
    event.preventDefault()
    flushSave()
    notify('已写入本地草稿')
    return
  }

  if (mod && key === 'z') {
    if (isTypingTarget(event.target)) return
    event.preventDefault()
    if (event.shiftKey) {
      if (redo()) notify('已重做')
    } else if (undo()) {
      notify('已撤销')
    }
    return
  }

  if (mod && key === 'y') {
    if (isTypingTarget(event.target)) return
    event.preventDefault()
    if (redo()) notify('已重做')
    return
  }

  if (mod && (key === 'arrowup' || key === 'arrowdown')) {
    if (isTypingTarget(event.target)) return
    event.preventDefault()
    moveSelected(key === 'arrowup' ? -1 : 1)
    return
  }

  if ((key === 'delete' || key === 'backspace') && !isTypingTarget(event.target)) {
    if (!selectedPointer.value) return
    event.preventDefault()
    if (removeSelected()) notify('字段已删除，Ctrl+Z 可撤销', 'warn')
    return
  }

  if (key === 'escape') {
    if (drawerOpen.value) {
      drawerOpen.value = false
      return
    }
    select(null)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (restored.value) notify('已恢复上次编辑的 Schema')
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (toastTimer) clearTimeout(toastTimer)
  if (resetTimer) clearTimeout(resetTimer)
})

function setInspectorTab(tab: InspectorTab): void {
  inspectorTab.value = tab
}
</script>

<template>
  <div class="sfd">
    <header class="sfd-top">
      <div class="sfd-brand">
        <a v-if="homeHref" class="sfd-brand__back" :href="homeHref" title="返回首页">←</a>
        <span class="sfd-brand__mark">sf</span>
        <div class="sfd-brand__text">
          <b>schema<span>·</span>forge</b>
          <small>designer cockpit</small>
        </div>
      </div>

      <nav class="sfd-modes" role="group" aria-label="编辑模式">
        <button
          v-for="item in modes"
          :key="item.id"
          type="button"
          :class="{ 'is-on': mode === item.id }"
          :aria-pressed="mode === item.id"
          :title="item.hint"
          @click="mode = item.id"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="sfd-top__meta">
        <span class="sfd-top__doc">{{ schema.title || schema.id }}</span>
        <span class="sfd-sync" :class="`is-${syncState}`">
          <i></i>{{ saveLabel }}
        </span>
        <span class="sfd-top__hash">#{{ program.stats.schemaHash }}</span>
      </div>

      <div class="sfd-top__actions">
        <button
          type="button"
          class="sfd-top__btn"
          :disabled="!canUndo"
          title="撤销 Ctrl+Z"
          @click="undo()"
        >
          ↶ <em>{{ undoDepth }}</em>
        </button>
        <button
          type="button"
          class="sfd-top__btn"
          :disabled="!canRedo"
          title="重做 Ctrl+Shift+Z"
          @click="redo()"
        >
          ↷ <em>{{ redoDepth }}</em>
        </button>
        <span class="sfd-top__divider"></span>
        <button type="button" class="sfd-top__btn" title="导入 Schema JSON" @click="triggerImport">
          导入
        </button>
        <button type="button" class="sfd-top__btn" title="导出 Schema JSON" @click="onExport">
          导出
        </button>
        <button
          type="button"
          class="sfd-top__btn sfd-top__btn--danger"
          :class="{ 'is-armed': resetArmed }"
          title="恢复发票示例 Schema"
          @click="onReset"
        >
          {{ resetArmed ? '确认覆盖' : '示例' }}
        </button>
        <input
          ref="fileInput"
          class="sfd-file"
          type="file"
          accept="application/json,.json"
          @change="onImport"
        />
      </div>
    </header>

    <div class="sfd-body">
      <aside v-if="mode === 'design'" class="sfd-rail">
        <div class="sfd-rail__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="leftTab === 'materials'"
            :class="{ 'is-on': leftTab === 'materials' }"
            @click="leftTab = 'materials'"
          >
            物料 <b>{{ materialCount }}</b>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="leftTab === 'outline'"
            :class="{ 'is-on': leftTab === 'outline' }"
            @click="leftTab = 'outline'"
          >
            大纲 <b>{{ program.stats.fieldCount }}</b>
          </button>
        </div>

        <div class="sfd-rail__scroll">
          <MaterialPalette v-if="leftTab === 'materials'" @add="onAddMaterial" />
          <OutlineTree
            v-else
            :fields="schema.fields"
            :program="program"
            :selected-pointer="selectedPointer"
            @select="select"
          />
        </div>

        <footer class="sfd-rail__foot">
          <div class="sfd-rail__stat">
            <span>expr</span><b>{{ program.stats.expressionCount }}</b>
            <span>edges</span><b>{{ program.stats.edgeCount }}</b>
          </div>
          <div class="sfd-rail__health">
            <i :class="errorIssues.length ? 'is-error' : 'is-ok'"></i>
            <span v-if="errorIssues.length">{{ errorIssues.length }} 个编译错误</span>
            <span v-else>编译通过 · {{ program.stats.compileMs.toFixed(1) }}ms</span>
          </div>
          <div class="sfd-rail__undo">undo {{ undoDepth }} / redo {{ redoDepth }}</div>
        </footer>
      </aside>

      <main class="sfd-main" :class="{ 'sfd-main--wide': mode !== 'design' }">
        <template v-if="mode === 'design'">
          <div class="sfd-canvasbar">
            <div class="sfd-crumb">
              <span>form</span><b>/</b>{{ schema.id }}<b>/</b>画布
              <em>·</em>{{ program.stats.fieldCount }} 字段
              <em>·</em>{{ program.stats.expressionCount }} 联动
              <em v-if="warningIssues.length">·</em>
              <span v-if="warningIssues.length" class="is-warn">{{ warningIssues.length }} warn</span>
            </div>
            <div class="sfd-canvasbar__actions">
              <span class="sfd-last-patch">patch · {{ lastPatch }}</span>
              <button type="button" class="sfd-btn sfd-btn--ghost" @click="toggleDrawer">
                { } JSON {{ drawerOpen ? '收起' : '展开' }}
              </button>
              <button type="button" class="sfd-btn sfd-btn--ghost" @click="mode = 'preview'">
                预览运行时 ↗
              </button>
            </div>
          </div>

          <div v-if="errorIssues.length" class="sfd-alert">
            <span class="sfd-alert__mark">!</span>
            <div>
              <b>{{ errorIssues.length }} 个编译错误</b>
              <p>{{ errorIssues[0]?.message }}</p>
            </div>
            <button type="button" @click="mode = 'logic'">查看诊断</button>
          </div>

          <div class="sfd-canvas-wrap">
            <DesignerCanvas
              :schema="schema"
              :program="program"
              :selected-pointer="selectedPointer"
              @select="select"
              @drop-before="(payload, parent, index) => dropBefore(payload, parent, index)"
              @drop-inside="(payload, pointer) => dropInside(pointer, payload)"
            />
          </div>

          <div v-if="drawerOpen" class="sfd-drawer">
            <SchemaPanel
              :schema="schema"
              :program="program"
              variant="drawer"
              closable
              @replace="onReplace"
              @close="drawerOpen = false"
            />
          </div>
          <button v-else type="button" class="sfd-drawerbar" @click="drawerOpen = true">
            <span class="sfd-drawerbar__mark">{ }</span>
            <span>Schema JSON</span>
            <em>v{{ schema.version }}</em>
            <span class="sfd-drawerbar__patch">{{ lastPatch }}</span>
            <b>展开 ⌃</b>
          </button>
        </template>

        <LogicBoard
          v-else-if="mode === 'logic'"
          :program="program"
          :selected-key="selectedNode?.key ?? null"
          @select="selectByKey"
        />

        <RuntimePreview
          v-else-if="mode === 'preview'"
          :schema="schema"
          @select="selectByKey"
        />

        <SchemaPanel
          v-else
          :schema="schema"
          :program="program"
          variant="full"
          @replace="onReplace"
        />
      </main>

      <Inspector
        v-if="mode === 'design'"
        :node="selectedNode"
        :pointer="selectedPointer"
        :material="selectedMaterial"
        :program="program"
        :tab="inspectorTab"
        @update:tab="setInspectorTab"
        @update="(partial, mergeKey) => updateSelected(partial, { mergeKey })"
        @update-props="onUpdateProps"
        @update-effect="updateEffect"
        @update-rules="onUpdateRules"
        @remove="removeSelected"
        @add="addMaterial"
      />
    </div>

    <Transition name="sfd-toast">
      <div v-if="toast" class="sfd-toast" :class="`is-${toast.tone}`">
        <i></i>{{ toast.message }}
      </div>
    </Transition>
  </div>
</template>
