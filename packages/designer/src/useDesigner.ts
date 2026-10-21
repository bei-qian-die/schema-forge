import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import {
  applyPatch,
  compileSchema,
  deepClone,
  diff,
  getAtPointer,
  getMaterial,
  isLayoutType,
  PatchHistory,
  type FieldNode,
  type FormProgram,
  type FormSchema,
  type JsonPatch,
  type MaterialSpec,
  type StatusProp,
} from '@schema-forge/core'
import { createDefaultSchema } from './defaultSchema'
import {
  childrenPointer,
  collectKeys,
  collectKeysExcluding,
  findPointerByKey,
  firstLeafPointer,
  isDescendantPointer,
  locateNode,
  makeFieldNode,
  nextUniqueKey,
  nodeAt,
  parentPointerOf,
  rewriteKeyReferences,
  sanitizeKey,
  summarizePatch,
} from './utils'

export type DesignerMode = 'design' | 'logic' | 'preview' | 'schema'
export type InspectorTab = 'props' | 'linkage' | 'rules' | 'advanced'
export type SyncState = 'synced' | 'saving' | 'error'

interface StoredDesigner {
  version: 1
  savedAt: number
  schema: FormSchema
}

export interface DesignerStore {
  schema: Ref<FormSchema>
  program: import('vue').ComputedRef<FormProgram>
  selectedPointer: Ref<string | null>
  selectedNode: import('vue').ComputedRef<FieldNode | null>
  selectedMaterial: import('vue').ComputedRef<MaterialSpec | undefined>
  mode: Ref<DesignerMode>
  inspectorTab: Ref<InspectorTab>
  drawerOpen: Ref<boolean>
  leftTab: Ref<'materials' | 'outline'>
  syncState: Ref<SyncState>
  lastSavedAt: Ref<number | null>
  lastPatch: Ref<string>
  restored: Ref<boolean>
  errorIssues: import('vue').ComputedRef<FormProgram['issues']>
  warningIssues: import('vue').ComputedRef<FormProgram['issues']>
  canUndo: import('vue').ComputedRef<boolean>
  canRedo: import('vue').ComputedRef<boolean>
  undoDepth: import('vue').ComputedRef<number>
  redoDepth: import('vue').ComputedRef<number>
  select: (pointer: string | null) => void
  selectByKey: (key: string) => void
  addMaterial: (type: string) => FieldNode | null
  insertMaterial: (
    type: string,
    parentPointer: string,
    index?: number,
  ) => FieldNode | null
  dropInside: (containerPointer: string, payload: DragPayload) => boolean
  dropBefore: (payload: DragPayload, parentPointer: string, index: number) => boolean
  moveNode: (pointer: string, parentPointer: string, index?: number) => boolean
  moveSelected: (offset: number) => boolean
  removeSelected: () => boolean
  updateSelected: (
    partial: Partial<FieldNode>,
    options?: { mergeKey?: string; selectKey?: string },
  ) => boolean
  updateEffect: (prop: StatusProp, value: string | boolean | undefined) => boolean
  updateRules: (rules: FieldNode['rules']) => boolean
  replaceSchema: (next: unknown) => { ok: boolean; error?: string }
  undo: () => boolean
  redo: () => boolean
  resetSample: () => void
  flushSave: () => void
}

export type DragPayload =
  | { kind: 'material'; type: string }
  | { kind: 'node'; pointer: string }

const STORAGE_PREFIX = 'schema-forge.designer'

function readStored(storageKey: string): StoredDesigner | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDesigner
    if (!parsed || parsed.version !== 1 || !parsed.schema) return null
    if (!Array.isArray(parsed.schema.fields)) return null
    return parsed
  } catch {
    return null
  }
}

function isSchemaShape(value: unknown): value is FormSchema {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FormSchema>
  return Array.isArray(candidate.fields)
}

export function useDesigner(options: {
  storageKey?: string
  initialSchema?: FormSchema
} = {}): DesignerStore {
  const storageKey = options.storageKey ?? `${STORAGE_PREFIX}.v1`
  const stored = options.initialSchema ? null : readStored(storageKey)
  const start = options.initialSchema
    ? deepClone(options.initialSchema)
    : stored?.schema
      ? deepClone(stored.schema)
      : createDefaultSchema()

  const schema = ref<FormSchema>(start)
  const program = computed(() => compileSchema(schema.value))
  const mode = ref<DesignerMode>('design')
  const inspectorTab = ref<InspectorTab>('props')
  const drawerOpen = ref(true)
  const leftTab = ref<'materials' | 'outline'>('materials')
  const syncState = ref<SyncState>('synced')
  const lastSavedAt = ref<number | null>(stored?.savedAt ?? null)
  const lastPatch = ref('initial compile')
  const restored = ref(Boolean(stored))
  const historyTick = ref(0)
  const history = new PatchHistory({ limit: 200, mergeWindow: 300 })

  const initialPointer =
    findPointerByKey(start.fields, 'company.taxNo') ??
    findPointerByKey(start.fields, 'name') ??
    firstLeafPointer(start.fields)
  const selectedPointer = ref<string | null>(initialPointer)

  const selectedNode = computed(() => nodeAt(schema.value, selectedPointer.value))
  const selectedMaterial = computed(() =>
    selectedNode.value ? getMaterial(selectedNode.value.type) : undefined,
  )
  const errorIssues = computed(() => program.value.issues.filter((issue) => issue.severity === 'error'))
  const warningIssues = computed(() =>
    program.value.issues.filter((issue) => issue.severity === 'warning'),
  )
  const canUndo = computed(() => {
    historyTick.value
    return history.canUndo
  })
  const canRedo = computed(() => {
    historyTick.value
    return history.canRedo
  })
  const undoDepth = computed(() => {
    historyTick.value
    return history.undoDepth
  })
  const redoDepth = computed(() => {
    historyTick.value
    return history.redoDepth
  })

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let lastSavedSnapshot = JSON.stringify(start)

  function makeSave(): void {
    try {
      const payload: StoredDesigner = {
        version: 1,
        savedAt: Date.now(),
        schema: schema.value,
      }
      localStorage.setItem(storageKey, JSON.stringify(payload))
      lastSavedAt.value = payload.savedAt
      syncState.value = 'synced'
      lastSavedSnapshot = JSON.stringify(schema.value)
    } catch {
      syncState.value = 'error'
    }
  }

  function scheduleSave(): void {
    if (typeof localStorage === 'undefined') return
    if (JSON.stringify(schema.value) === lastSavedSnapshot) {
      syncState.value = 'synced'
      return
    }
    syncState.value = 'saving'
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      makeSave()
    }, 800)
  }

  function flushSave(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
      makeSave()
    }
  }

  watch(
    schema,
    () => {
      scheduleSave()
      if (!selectedPointer.value || !nodeAt(schema.value, selectedPointer.value)) {
        selectedPointer.value = firstLeafPointer(schema.value.fields)
      }
    },
    { deep: false },
  )

  const beforeUnload = () => flushSave()
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', beforeUnload)
  }
  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', beforeUnload)
    flushSave()
  })

  function selectionFor(key: string | null): void {
    if (!key) {
      selectedPointer.value = firstLeafPointer(schema.value.fields)
      return
    }
    const pointer = findPointerByKey(schema.value.fields, key)
    selectedPointer.value = pointer ?? firstLeafPointer(schema.value.fields)
  }

  function commit(
    next: FormSchema,
    options: { mergeKey?: string; selectKey?: string | null } = {},
  ): boolean {
    const previousKey = selectedNode.value?.key ?? null
    const desiredKey = options.selectKey === undefined ? previousKey : options.selectKey
    const patch = diff(schema.value, next)
    if (patch.length === 0) return false
    const inverse = diff(next, schema.value)
    history.push(patch, inverse, { mergeKey: options.mergeKey })
    historyTick.value++
    lastPatch.value = summarizePatch(patch)
    schema.value = next
    selectionFor(desiredKey)
    return true
  }

  function select(pointer: string | null): void {
    selectedPointer.value = pointer
  }

  function selectByKey(key: string): void {
    selectedPointer.value = findPointerByKey(schema.value.fields, key)
  }

  function createNode(type: string): FieldNode | null {
    const material = getMaterial(type)
    if (!material) return null
    return makeFieldNode(material, collectKeys(schema.value.fields))
  }

  function insertNew(type: string, parentPointer: string, index?: number): FieldNode | null {
    const node = createNode(type)
    if (!node) return null
    const next = deepClone(schema.value)
    let array: FieldNode[] | null = null
    if (parentPointer === '/fields') {
      array = next.fields
    } else {
      const parent = getAtPointer(next, parentPointer)
      if (Array.isArray(parent)) array = parent as FieldNode[]
      else if (parent && typeof parent === 'object' && parentPointer.endsWith('/children')) {
        const ownerPointer = parentPointer.slice(0, -'/children'.length)
        const owner = nodeAt(next, ownerPointer)
        if (!owner) return null
        owner.children ??= []
        array = owner.children
      }
    }
    if (!array) return null
    const at = index === undefined ? array.length : Math.max(0, Math.min(index, array.length))
    array.splice(at, 0, node)
    commit(next, { selectKey: node.key })
    return node
  }

  function addTarget(): { parentPointer: string; index?: number } | null {
    const pointer = selectedPointer.value
    const current = selectedNode.value
    if (!pointer || !current) return null
    if (isLayoutType(current.type)) {
      if (current.type === 'tabs') {
        const firstTab = current.children?.findIndex((child) => child.type === 'tab') ?? -1
        if (firstTab >= 0) {
          const tabPointer = `${pointer}/children/${firstTab}`
          return { parentPointer: childrenPointer(tabPointer) }
        }
      }
      return { parentPointer: childrenPointer(pointer) }
    }
    const parent = parentPointerOf(pointer)
    const located = locateNode(schema.value, pointer)
    if (!located) return null
    return { parentPointer: parent, index: located.index + 1 }
  }

  function addMaterial(type: string): FieldNode | null {
    const target = addTarget()
    if (!target) return insertNew(type, '/fields')
    return insertNew(type, target.parentPointer, target.index)
  }

  function insertMaterial(type: string, parentPointer: string, index?: number): FieldNode | null {
    return insertNew(type, parentPointer, index)
  }

  function moveNode(pointer: string, parentPointer: string, index?: number): boolean {
    if (isDescendantPointer(pointer, parentPointer)) return false
    const next = deepClone(schema.value)
    const source = locateNode(next, pointer)
    if (!source) return false
    let targetArray: FieldNode[] | null = null
    if (parentPointer === '/fields') {
      targetArray = next.fields
    } else {
      const value = getAtPointer(next, parentPointer)
      if (Array.isArray(value)) targetArray = value as FieldNode[]
    }
    if (!targetArray) return false
    const key = source.node.key
    let targetIndex = index === undefined ? targetArray.length : index
    if (source.parentArray === targetArray && source.index < targetIndex) targetIndex--
    const [moved] = source.parentArray.splice(source.index, 1)
    if (!moved) return false
    const bounded = Math.max(0, Math.min(targetIndex, targetArray.length))
    targetArray.splice(bounded, 0, moved)
    return commit(next, { selectKey: key })
  }

  function dropInside(containerPointer: string, payload: DragPayload): boolean {
    const container = nodeAt(schema.value, containerPointer)
    if (!container) return false
    let target = childrenPointer(containerPointer)
    if (container.type === 'tabs') {
      const index = container.children?.findIndex((child) => child.type === 'tab') ?? -1
      if (index >= 0) target = childrenPointer(`${containerPointer}/children/${index}`)
    }
    if (payload.kind === 'material') {
      return Boolean(insertMaterial(payload.type, target))
    }
    const pointer = payload.pointer
    if (isDescendantPointer(pointer, containerPointer)) return false
    return moveNode(pointer, target)
  }

  function dropBefore(
    payload: DragPayload,
    parentPointer: string,
    index: number,
  ): boolean {
    if (payload.kind === 'material') {
      return Boolean(insertMaterial(payload.type, parentPointer, index))
    }
    return moveNode(payload.pointer, parentPointer, index)
  }

  function moveSelected(offset: number): boolean {
    const pointer = selectedPointer.value
    if (!pointer) return false
    const next = deepClone(schema.value)
    const located = locateNode(next, pointer)
    if (!located) return false
    const target = located.index + offset
    if (target < 0 || target >= located.parentArray.length) return false
    const [node] = located.parentArray.splice(located.index, 1)
    if (!node) return false
    located.parentArray.splice(target, 0, node)
    return commit(next, { selectKey: node.key })
  }

  function removeSelected(): boolean {
    const pointer = selectedPointer.value
    if (!pointer) return false
    const next = deepClone(schema.value)
    const located = locateNode(next, pointer)
    if (!located) return false
    const { parentArray, index, parent } = located
    const removed = parentArray[index]
    parentArray.splice(index, 1)
    const nextNode = parentArray[index] ?? parentArray[index - 1]
    commit(next, { selectKey: nextNode?.key ?? parent?.key ?? null })
    void removed
    return true
  }

  function updateSelected(
    partial: Partial<FieldNode>,
    options: { mergeKey?: string; selectKey?: string } = {},
  ): boolean {
    const pointer = selectedPointer.value
    if (!pointer) return false
    const current = nodeAt(schema.value, pointer)
    if (!current) return false
    const nextNode = deepClone(current)
    let key = current.key

    for (const [rawKey, value] of Object.entries(partial)) {
      const prop = rawKey as keyof FieldNode
      if (value === undefined) {
        delete nextNode[prop]
        continue
      }
      ;(nextNode as unknown as Record<string, unknown>)[prop] = deepClone(value)
    }

    if (Object.prototype.hasOwnProperty.call(partial, 'key')) {
      const requested = sanitizeKey(String(partial.key ?? ''))
      if (!requested) return false
      const used = collectKeysExcluding(schema.value, pointer)
      key = nextUniqueKey(requested, used)
      nextNode.key = key
    }

    let nextSchema = applyPatch<FormSchema>(schema.value, [
      { op: 'replace', path: pointer, value: nextNode },
    ])
    if (key !== current.key) {
      nextSchema = rewriteKeyReferences(nextSchema, current.key, key)
      lastPatch.value = `rename ${current.key} → ${key} · expressions rewritten`
    }
    return commit(nextSchema, {
      mergeKey: options.mergeKey,
      selectKey: options.selectKey ?? key,
    })
  }

  function updateEffect(prop: StatusProp, value: string | boolean | undefined): boolean {
    return updateSelected(
      { [prop]: value } as Partial<FieldNode>,
      { mergeKey: `effect:${selectedPointer.value}:${prop}` },
    )
  }

  function updateRules(rules: FieldNode['rules']): boolean {
    return updateSelected(
      { rules: rules && rules.length > 0 ? rules : undefined },
      { mergeKey: `rules:${selectedPointer.value}` },
    )
  }

  function replaceSchema(input: unknown): { ok: boolean; error?: string } {
    if (!isSchemaShape(input)) {
      return { ok: false, error: 'Schema 必须包含 fields 数组' }
    }
    try {
      const normalized = compileSchema(input)
      const next = deepClone(input)
      next.version = normalized.schema.version
      next.id = normalized.schema.id || 'form'
      commit(next, { mergeKey: 'json-edit' })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  function undo(): boolean {
    const patch = history.undo()
    if (!patch) return false
    const key = selectedNode.value?.key ?? null
    schema.value = applyPatch(schema.value, patch)
    selectionFor(key)
    lastPatch.value = `undo ${patch.length} op${patch.length === 1 ? '' : 's'}`
    historyTick.value++
    return true
  }

  function redo(): boolean {
    const patch = history.redo()
    if (!patch) return false
    const key = selectedNode.value?.key ?? null
    schema.value = applyPatch(schema.value, patch)
    selectionFor(key)
    lastPatch.value = `redo ${patch.length} op${patch.length === 1 ? '' : 's'}`
    historyTick.value++
    return true
  }

  function resetSample(): void {
    commit(createDefaultSchema(), { selectKey: 'company.taxNo' })
    lastPatch.value = 'sample schema restored'
  }

  return {
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
    insertMaterial,
    dropInside,
    dropBefore,
    moveNode,
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
  }
}

export function describePatch(patch: JsonPatch): string {
  return summarizePatch(patch)
}
