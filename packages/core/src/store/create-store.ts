import {
  compileSchema,
  type CompiledField,
  type CompiledRule,
  type CompileStats,
  type FormProgram,
  type StatusProp,
} from '../compile'
import type { ErrorTree, FieldStatus, FormSchema } from '../protocol/schema'
import { emptyStatus } from '../protocol/schema'
import { evaluate } from '../expression'
import type { EvaluationScope } from '../expression'
import { downstreamClosure } from '../graph'
import { defaultValueForType } from '../registry'
import {
  deepClone,
  deletePath,
  getPath,
  isEmpty,
  setPath,
} from './path'
import {
  isAsyncRule,
  runSyncRule,
  type SyncRuleContext,
} from '../validate/rules'

export type ValidateOn = 'input' | 'blur' | 'submit'

export interface AsyncValidationContext extends SyncRuleContext {
  form: Form
  getValue: (path: string) => unknown
  getStatus: (path: string) => FieldStatus
}

export type AsyncRuleValidator = (
  context: AsyncValidationContext,
) => Promise<string | true | null | void> | string | true | null | void

export interface CreateFormOptions {
  initialValues?: Record<string, unknown>
  validateOn?: ValidateOn
  asyncDebounce?: number
  asyncValidator?: AsyncRuleValidator
  onEvent?: (event: FormEvent) => void
}

export interface EffectEvaluation {
  id: string
  fieldKey: string
  prop: StatusProp
  source: string | boolean
  value: boolean
  previous: boolean
  changed: boolean
  /** Position in the topological order — useful in the engine log. */
  order: number
}

export type FormEventType = 'set' | 'validate' | 'reset'

export interface FormEvent {
  type: FormEventType
  revision: number
  path?: string
  value?: unknown
  /** Paths whose version was bumped; renderer components filter on this. */
  touched: string[]
  evaluated: EffectEvaluation[]
  validated: string[]
  errorsChanged: string[]
  durationMs: number
}

export interface SetValueResult {
  path: string
  value: unknown
  touched: string[]
  evaluated: EffectEvaluation[]
  errorsChanged: string[]
  durationMs: number
  revision: number
}

export interface FormStats extends CompileStats {
  revision: number
  lastDurationMs: number
  lastEvaluated: number
  lastTouched: number
  asyncScheduled: number
  asyncCoalesced: number
}

export interface ValidationResult {
  valid: boolean
  errors: ErrorTree
  fields: Record<string, string[]>
}

type FormListener = (event: FormEvent) => void

interface PendingAsync {
  timer: ReturnType<typeof setTimeout>
  promise: Promise<void>
  resolve: () => void
}

export interface Form {
  readonly schema: FormSchema
  readonly program: FormProgram
  getValue<T = unknown>(path: string): T | undefined
  getValues(): Record<string, unknown>
  getStatus(path: string): FieldStatus
  getErrors(path: string): string[]
  getErrorTree(): ErrorTree
  getVersion(id: string): number
  getField(path: string): CompiledField | undefined
  isVisible(path: string): boolean
  setValue(path: string, value: unknown): SetValueResult
  setValues(values: Record<string, unknown>): SetValueResult[]
  validateField(path: string): Promise<string[]>
  validate(): Promise<ValidationResult>
  serialize(options?: { includeHidden?: boolean }): Record<string, unknown>
  reset(values?: Record<string, unknown>): void
  subscribe(listener: FormListener): () => void
  getStats(): FormStats
}

function isProgram(value: unknown): value is FormProgram {
  return (
    typeof value === 'object' &&
    value !== null &&
    'graph' in value &&
    'effects' in value &&
    'stats' in value &&
    'fieldMap' in value
  )
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function collectFieldErrors(tree: ErrorTree): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  const walk = (node: ErrorTree, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (Array.isArray(value)) fields[path] = value
      else walk(value, path)
    }
  }
  walk(tree, '')
  return fields
}

/**
 * Runtime store. Compile once, then every interaction performs only:
 *   setPath → downstream closure → evaluate affected effects in topo order
 *   → bump versions for fields whose state changed → notify subscribers.
 */
export function createForm(
  input: FormSchema | FormProgram,
  options: CreateFormOptions = {},
): Form {
  const program = isProgram(input) ? input : compileSchema(input)
  const schema = program.schema

  const initialValues = deepClone(options.initialValues ?? {})
  const validateOn = options.validateOn ?? 'blur'
  const asyncDebounce = options.asyncDebounce ?? 300

  let values: Record<string, unknown> = {}
  let status = new Map<string, FieldStatus>()
  let syncErrors = new Map<string, string[]>()
  let asyncErrors = new Map<string, string[]>()
  let versions = new Uint32Array(program.graph.nodes.length)
  let revision = 0
  let lastDurationMs = 0
  let lastEvaluated = 0
  let lastTouched = 0
  let asyncScheduled = 0
  let asyncCoalesced = 0
  let destroyed = false

  const nodeIndex = new Map<string, number>()
  program.graph.nodes.forEach((node, index) => nodeIndex.set(node, index))
  const orderPosition = new Map<string, number>()
  program.order.forEach((node, index) => orderPosition.set(node, index))

  const listeners = new Set<FormListener>()
  const pendingAsync = new Map<string, PendingAsync>()

  const fieldsByKey = program.fieldMap
  const rulesByField = new Map<string, CompiledRule[]>()
  for (const rule of program.rules) {
    const list = rulesByField.get(rule.fieldKey) ?? []
    list.push(rule)
    rulesByField.set(rule.fieldKey, list)
  }

  function bump(id: string): boolean {
    const index = nodeIndex.get(id)
    if (index === undefined) return false
    versions[index] = (versions[index] ?? 0) + 1
    return true
  }

  function readStatus(path: string): unknown {
    const lastDot = path.lastIndexOf('.')
    if (lastDot === -1) return undefined
    const field = path.slice(0, lastDot)
    const prop = path.slice(lastDot + 1) as StatusProp
    const entry = status.get(field)
    if (!entry) return prop === 'visible' ? true : false
    return entry[prop]
  }

  function scopeFor(fieldKey: string, source = values): EvaluationScope {
    return {
      form: source,
      values: source,
      self: getPath(source, fieldKey),
      resolveStatus: readStatus,
    }
  }

  function asyncRulesFor(fieldKey: string): CompiledRule[] {
    return (rulesByField.get(fieldKey) ?? []).filter((compiled) => {
      if (!isAsyncRule(compiled.rule)) return false
      if (!compiled.when) return true
      try {
        return Boolean(evaluate(compiled.when.ast, scopeFor(fieldKey)))
      } catch {
        return false
      }
    })
  }

  function initialFor(field: CompiledField): unknown {
    const fromData = getPath(initialValues, field.key)
    if (fromData !== undefined) return deepClone(fromData)
    if (Object.prototype.hasOwnProperty.call(field.node, 'defaultValue')) {
      return deepClone(field.node.defaultValue)
    }
    if (field.isArray) return []
    if (field.isContainer) return undefined
    return defaultValueForType(field.node.type)
  }

  function initialize(seed?: Record<string, unknown>): void {
    const seedValues = seed === undefined ? initialValues : deepClone(seed)
    values = {}
    status = new Map()
    syncErrors = new Map()
    asyncErrors = new Map()
    versions = new Uint32Array(program.graph.nodes.length)

    for (const field of program.allFields) {
      const base = emptyStatus()
      if (typeof field.node.visible === 'boolean') base.visible = field.node.visible
      if (typeof field.node.disabled === 'boolean') base.disabled = field.node.disabled
      if (typeof field.node.required === 'boolean') base.required = field.node.required
      status.set(field.key, base)
    }

    for (const field of program.allFields) {
      if (!field.isDataField) continue
      const fromSeed = getPath(seedValues, field.key)
      const value =
        fromSeed !== undefined ? deepClone(fromSeed) : initialFor(field)
      if (value !== undefined) setPath(values, field.key, value)
    }

    // Reset versions after initialization so every field has a stable base.
    versions.fill(1)

    // Literal effects are applied immediately.
    for (const effect of program.effects) {
      if (!effect.literal) continue
      const entry = status.get(effect.fieldKey)
      if (!entry) continue
      entry[effect.prop] = effect.literalValue
    }

    // Run all expression effects once, strictly in topological order.
    for (const node of program.order) {
      const effect = program.effectMap.get(node)
      if (!effect || effect.literal || !effect.expression) continue
      try {
        const result = Boolean(evaluate(effect.expression.ast, scopeFor(effect.fieldKey)))
        const entry = status.get(effect.fieldKey)
        if (entry) entry[effect.prop] = result
      } catch {
        // Invalid expressions are reported at compile time; keep the default.
      }
    }

    revision++
  }

  function emit(event: Omit<FormEvent, 'revision'>): FormEvent {
    const payload: FormEvent = { ...event, revision }
    for (const listener of listeners) listener(payload)
    options.onEvent?.(payload)
    return payload
  }

  function syncErrorsFor(fieldKey: string): string[] {
    const field = fieldsByKey.get(fieldKey)
    if (!field) return []
    const currentStatus = status.get(fieldKey) ?? emptyStatus()
    if (!currentStatus.visible) return []

    const value = getPath(values, fieldKey)
    const output: string[] = []
    const rules = rulesByField.get(fieldKey) ?? []
    const requiredRule = rules.find((compiled) => compiled.rule.kind === 'required')

    if (currentStatus.required && isEmpty(value)) {
      output.push(
        requiredRule?.rule.message || `${field.node.label || fieldKey}为必填项`,
      )
    }

    for (const compiled of rules) {
      const { rule } = compiled
      if (rule.kind === 'required') {
        if (currentStatus.required) continue
        if (isEmpty(value)) output.push(rule.message || `${field.node.label || fieldKey}为必填项`)
        continue
      }
      if (isAsyncRule(rule)) continue
      if (compiled.when) {
        try {
          if (!evaluate(compiled.when.ast, scopeFor(fieldKey))) continue
        } catch {
          continue
        }
      }
      const context: SyncRuleContext = {
        key: fieldKey,
        value,
        values,
        status: currentStatus,
        rule,
      }
      const message = runSyncRule(context)
      if (message) output.push(message)
    }

    return [...new Set(output)]
  }

  function setSyncErrors(fieldKey: string, next: string[]): boolean {
    const previous = syncErrors.get(fieldKey) ?? []
    if (arraysEqual(previous, next)) return false
    if (next.length === 0) syncErrors.delete(fieldKey)
    else syncErrors.set(fieldKey, next)
    return true
  }

  function scheduleAsync(fieldKey: string): Promise<void> {
    const rules = asyncRulesFor(fieldKey)
    const validator = options.asyncValidator
    if (rules.length === 0 || !validator) {
      if (asyncErrors.delete(fieldKey)) bump(fieldKey)
      return Promise.resolve()
    }

    const existing = pendingAsync.get(fieldKey)
    if (existing) {
      clearTimeout(existing.timer)
      existing.resolve()
      asyncCoalesced++
    }
    asyncScheduled++

    let resolvePromise: () => void = () => {}
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve
    })

    const timer = setTimeout(async () => {
      const messages: string[] = []
      const field = fieldsByKey.get(fieldKey)
      const currentStatus = status.get(fieldKey) ?? emptyStatus()
      if (!field || !currentStatus.visible) {
        asyncErrors.delete(fieldKey)
        pendingAsync.delete(fieldKey)
        resolvePromise()
        return
      }

      for (const compiled of rules) {
        const value = getPath(values, fieldKey)
        if (isEmpty(value)) continue
        try {
          const result = await validator({
            key: fieldKey,
            value,
            values,
            status: currentStatus,
            rule: compiled.rule,
            form,
            getValue: (path) => getPath(values, path),
            getStatus: (path) => status.get(path) ?? emptyStatus(),
          })
          if (typeof result === 'string' && result) messages.push(result)
        } catch (error) {
          messages.push(
            compiled.rule.message ||
              (error instanceof Error ? error.message : '异步校验失败'),
          )
        }
      }

      const changed = !arraysEqual(asyncErrors.get(fieldKey) ?? [], messages)
      if (messages.length > 0) asyncErrors.set(fieldKey, messages)
      else asyncErrors.delete(fieldKey)
      pendingAsync.delete(fieldKey)
      if (changed) {
        bump(fieldKey)
        emit({
          type: 'validate',
          touched: [fieldKey],
          evaluated: [],
          validated: [fieldKey],
          errorsChanged: [fieldKey],
          durationMs: 0,
        })
      }
      resolvePromise()
    }, asyncDebounce)

    pendingAsync.set(fieldKey, { timer, promise, resolve: resolvePromise })
    return promise
  }

  const form: Form = {
    schema,
    program,

    getValue<T = unknown>(path: string): T | undefined {
      return getPath(values, path) as T | undefined
    },

    getValues(): Record<string, unknown> {
      return deepClone(values)
    },

    getStatus(path: string): FieldStatus {
      return { ...(status.get(path) ?? emptyStatus()) }
    },

    getErrors(path: string): string[] {
      return [...(syncErrors.get(path) ?? []), ...(asyncErrors.get(path) ?? [])]
    },

    getErrorTree(): ErrorTree {
      const tree: ErrorTree = {}
      const keys = new Set([...syncErrors.keys(), ...asyncErrors.keys()])
      for (const key of keys) {
        const messages = form.getErrors(key)
        if (messages.length === 0) continue
        setPath(tree as Record<string, unknown>, key, messages)
      }
      return tree
    },

    getVersion(id: string): number {
      const index = nodeIndex.get(id)
      return index === undefined ? 0 : (versions[index] ?? 0)
    },

    getField(path: string): CompiledField | undefined {
      return fieldsByKey.get(path)
    },

    isVisible(path: string): boolean {
      return status.get(path)?.visible ?? true
    },

    setValue(path: string, value: unknown): SetValueResult {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const previousValue = getPath(values, path)
      if (Object.is(previousValue, value)) {
        return {
          path,
          value,
          touched: [],
          evaluated: [],
          errorsChanged: [],
          durationMs: 0,
          revision,
        }
      }

      setPath(values, path, value)
      const touched = new Set<string>()
      const evaluated: EffectEvaluation[] = []
      const errorsChanged: string[] = []
      const touchedFields = new Set<string>()

      if (fieldsByKey.has(path)) touchedFields.add(path)
      bump(path)

      // Clear stale async errors for this field; sync errors are re-evaluated.
      if (asyncErrors.delete(path)) {
        errorsChanged.push(path)
        touchedFields.add(path)
        bump(path)
      }

      const down = downstreamClosure(program.graph, path)
      const pendingEffects: { effect: NonNullable<ReturnType<typeof program.effectMap.get>>; position: number }[] = []

      for (const node of down) {
        const effect = program.effectMap.get(node)
        if (!effect || effect.literal || !effect.expression) continue
        const position = orderPosition.get(node)
        if (position === undefined) continue
        pendingEffects.push({ effect, position })
      }
      pendingEffects.sort((a, b) => a.position - b.position)

      for (const { effect, position } of pendingEffects) {
        const entry = status.get(effect.fieldKey)
        if (!entry) continue
        const previous = entry[effect.prop]
        let next = previous
        try {
          next = Boolean(evaluate(effect.expression!.ast, scopeFor(effect.fieldKey)))
        } catch {
          next = previous
        }
        evaluated.push({
          id: effect.id,
          fieldKey: effect.fieldKey,
          prop: effect.prop,
          source: effect.source,
          value: next,
          previous,
          changed: next !== previous,
          order: position,
        })
        if (next !== previous) {
          entry[effect.prop] = next
          bump(effect.id)
          bump(effect.fieldKey)
          touchedFields.add(effect.fieldKey)
        }
      }

      // Re-run sync validation for fields that already carry errors, or when
      // validateOn is "input". Hidden fields clear their errors here.
      const shouldValidate =
        validateOn === 'input' ||
        syncErrors.has(path) ||
        [...touchedFields].some((key) => syncErrors.has(key))
      const validated: string[] = []
      if (shouldValidate) {
        const candidates = new Set<string>([path, ...touchedFields])
        for (const key of candidates) {
          if (!fieldsByKey.has(key)) continue
          const next = syncErrorsFor(key)
          if (setSyncErrors(key, next)) {
            bump(key)
            errorsChanged.push(key)
            touchedFields.add(key)
          }
          validated.push(key)
        }
      }

      for (const key of touchedFields) touched.add(key)
      touched.add(path)
      for (const key of errorsChanged) touched.add(key)

      const durationMs =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      lastDurationMs = durationMs
      lastEvaluated = evaluated.length
      lastTouched = touched.size
      revision++

      emit({
        type: 'set',
        path,
        value,
        touched: [...touched],
        evaluated,
        validated,
        errorsChanged,
        durationMs,
      })

      if (validateOn === 'input' && asyncRulesFor(path).length > 0) {
        void scheduleAsync(path)
      }

      return {
        path,
        value,
        touched: [...touched],
        evaluated,
        errorsChanged,
        durationMs,
        revision,
      }
    },

    setValues(next: Record<string, unknown>): SetValueResult[] {
      return Object.entries(next).map(([path, value]) => form.setValue(path, value))
    },

    async validateField(path: string): Promise<string[]> {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (!fieldsByKey.has(path)) return []
      const next = syncErrorsFor(path)
      const changed = setSyncErrors(path, next)
      if (changed) bump(path)
      const touched = changed ? [path] : []
      if (changed) {
        emit({
          type: 'validate',
          touched,
          evaluated: [],
          validated: [path],
          errorsChanged: touched,
          durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
        })
      }
      if (asyncRulesFor(path).length > 0) await scheduleAsync(path)
      return form.getErrors(path)
    },

    async validate(): Promise<ValidationResult> {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const errorsChanged: string[] = []
      const touched: string[] = []

      for (const field of program.allFields) {
        if (!field.isDataField) continue
        const next = syncErrorsFor(field.key)
        if (setSyncErrors(field.key, next)) {
          bump(field.key)
          errorsChanged.push(field.key)
          touched.push(field.key)
        }
        if (next.length === 0) syncErrors.delete(field.key)
      }

      if (errorsChanged.length > 0) {
        revision++
        emit({
          type: 'validate',
          touched,
          evaluated: [],
          validated: [...errorsChanged],
          errorsChanged,
          durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
        })
      }

      const asyncKeys = program.allFields
        .filter((field) => field.isDataField && form.isVisible(field.key) && asyncRulesFor(field.key).length > 0)
        .map((field) => field.key)
      await Promise.all(asyncKeys.map((key) => scheduleAsync(key)))

      const tree = form.getErrorTree()
      const fields = collectFieldErrors(tree)
      return {
        valid: Object.keys(fields).length === 0,
        errors: tree,
        fields,
      }
    },

    serialize({ includeHidden = false } = {}): Record<string, unknown> {
      const output = deepClone(values)
      if (!includeHidden) {
        for (const field of program.allFields) {
          if (!field.isDataField) continue
          if (!form.isVisible(field.key)) deletePath(output, field.key)
        }
      }
      return output
    },

    reset(seed?: Record<string, unknown>): void {
      initialize(seed)
      revision++
      emit({
        type: 'reset',
        touched: program.allFields.map((field) => field.key),
        evaluated: [],
        validated: [],
        errorsChanged: [],
        durationMs: 0,
      })
    },

    subscribe(listener: FormListener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getStats(): FormStats {
      return {
        ...program.stats,
        revision,
        lastDurationMs,
        lastEvaluated,
        lastTouched,
        asyncScheduled,
        asyncCoalesced,
      }
    },
  }

  initialize()

  // Silence unused warnings for future disposal hooks without exposing API.
  Object.defineProperty(form, Symbol.for('schema-forge.destroy'), {
    value: () => {
      destroyed = true
      for (const pending of pendingAsync.values()) {
        clearTimeout(pending.timer)
        pending.resolve()
      }
      pendingAsync.clear()
      listeners.clear()
    },
    enumerable: false,
  })
  void destroyed

  return form
}
