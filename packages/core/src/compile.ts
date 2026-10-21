import {
  DEFAULT_LAYOUT,
  SCHEMA_VERSION,
  hashSchema,
  isLayoutType,
  type FieldNode,
  type FormSchema,
  type RuleSpec,
} from './protocol/schema'
import { migrateSchema, type MigrationResult } from './protocol/migrate'
import {
  compileExpression,
  ExpressionError,
  walkAst,
  type CompiledExpression,
  type Dependency,
} from './expression'
import { buildDepGraph, edgeCount, findCycles, toposort, type DepGraph } from './graph'
import { formatCycle } from './graph/cycle'

export type StatusProp = 'visible' | 'disabled' | 'required'

export interface CompileIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  fieldKey?: string
  expression?: string
  line?: number
  column?: number
}

export interface CompiledField {
  key: string
  node: FieldNode
  parentKey: string | null
  depth: number
  isContainer: boolean
  isArray: boolean
  /** Containers may still own effects (visibility), but hold no data. */
  isDataField: boolean
}

export interface CompiledEffect {
  id: string
  fieldKey: string
  prop: StatusProp
  source: string | boolean
  literal: boolean
  literalValue: boolean
  expression?: CompiledExpression
}

export interface CompiledRule {
  fieldKey: string
  index: number
  rule: RuleSpec
  when?: CompiledExpression
}

export interface CompileStats {
  fieldCount: number
  leafCount: number
  expressionCount: number
  nodeCount: number
  edgeCount: number
  orderLength: number
  cycleCount: number
  compileMs: number
  schemaHash: string
}

export interface FormProgram {
  schema: FormSchema
  layout: NonNullable<FormSchema['layout']>
  fields: FieldNode[]
  allFields: CompiledField[]
  fieldMap: Map<string, CompiledField>
  effects: CompiledEffect[]
  effectMap: Map<string, CompiledEffect>
  rules: CompiledRule[]
  graph: DepGraph
  order: string[]
  cyclic: string[]
  cycles: string[][]
  stats: CompileStats
  issues: CompileIssue[]
  migration: MigrationResult
}

const PROP_ORDER: StatusProp[] = ['visible', 'disabled', 'required']

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function makeUniqueKey(candidate: string, used: Set<string>, issues: CompileIssue[]): string {
  if (!used.has(candidate)) {
    used.add(candidate)
    return candidate
  }
  let counter = 2
  while (used.has(`${candidate}_${counter}`)) counter++
  const key = `${candidate}_${counter}`
  used.add(key)
  issues.push({
    severity: 'warning',
    code: 'DUPLICATE_KEY',
    message: `字段 key "${candidate}" 重复，已重命名为 "${key}"`,
    fieldKey: key,
  })
  return key
}

interface NormalizeContext {
  usedKeys: Set<string>
  issues: CompileIssue[]
}

function normalizeNode(
  raw: unknown,
  index: number,
  ctx: NormalizeContext,
  insideArray: boolean,
  depth: number,
): FieldNode {
  if (!isRecord(raw)) {
    ctx.issues.push({
      severity: 'error',
      code: 'INVALID_FIELD',
      message: `第 ${index + 1} 个字段不是对象，已用占位字段替代`,
    })
    return { key: makeUniqueKey(`invalid_${index + 1}`, ctx.usedKeys, ctx.issues), type: 'input', label: '无效字段' }
  }

  const rawKey = typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : `field_${index + 1}`
  if (typeof raw.key !== 'string' || !raw.key.trim()) {
    ctx.issues.push({
      severity: 'warning',
      code: 'MISSING_KEY',
      message: `字段缺少 key，已使用 "${rawKey}"`,
      fieldKey: rawKey,
    })
  }

  const key = insideArray ? rawKey : makeUniqueKey(rawKey, ctx.usedKeys, ctx.issues)
  const type = typeof raw.type === 'string' && raw.type ? raw.type : 'input'
  const label = typeof raw.label === 'string' && raw.label ? raw.label : key
  const node: FieldNode = { key, type, label }

  if (isRecord(raw.props)) node.props = { ...raw.props }
  if (isRecord(raw.layout)) {
    const colSpan = Number(raw.layout.colSpan)
    const offset = Number(raw.layout.offset)
    node.layout = {
      ...(Number.isFinite(colSpan) && colSpan > 0 ? { colSpan: Math.min(12, Math.round(colSpan)) } : {}),
      ...(Number.isFinite(offset) && offset > 0 ? { offset: Math.round(offset) } : {}),
    }
  }

  for (const prop of PROP_ORDER) {
    const value = raw[prop]
    if (value === undefined) continue
    if (typeof value === 'boolean' || typeof value === 'string') {
      node[prop] = value as boolean | string
    } else {
      ctx.issues.push({
        severity: 'warning',
        code: 'INVALID_EFFECT',
        message: `字段 "${key}" 的 ${prop} 必须是布尔值或表达式字符串，已忽略`,
        fieldKey: key,
      })
    }
  }

  if ('defaultValue' in raw) node.defaultValue = raw.defaultValue
  if (Array.isArray(raw.rules)) {
    node.rules = raw.rules.filter((rule): rule is RuleSpec => isRecord(rule) && typeof rule.kind === 'string')
  }

  if (Array.isArray(raw.children)) {
    const childrenAreRelative = insideArray || type === 'array'
    node.children = raw.children.map((child, childIndex) =>
      normalizeNode(child, childIndex, ctx, childrenAreRelative, depth + 1),
    )
  }

  return node
}

function normalizeSchema(migrated: MigrationResult): { schema: FormSchema; issues: CompileIssue[] } {
  const issues: CompileIssue[] = migrated.warnings.map((message) => ({
    severity: 'warning',
    code: 'MIGRATION',
    message,
  }))
  const ctx: NormalizeContext = { usedKeys: new Set(), issues }
  const fields = migrated.schema.fields.map((field, index) => normalizeNode(field, index, ctx, false, 0))
  const schema: FormSchema = {
    version: SCHEMA_VERSION,
    id: migrated.schema.id || 'form',
    title: migrated.schema.title,
    description: migrated.schema.description,
    layout: migrated.schema.layout ?? DEFAULT_LAYOUT,
    fields,
  }
  return { schema, issues }
}

function flattenFields(schema: FormSchema): CompiledField[] {
  const result: CompiledField[] = []
  const walk = (nodes: FieldNode[], parentKey: string | null, depth: number) => {
    for (const node of nodes) {
      const isContainer = isLayoutType(node.type)
      const isArray = node.type === 'array'
      result.push({
        key: node.key,
        node,
        parentKey,
        depth,
        isContainer,
        isArray,
        isDataField: !isContainer || isArray,
      })
      // Array children are row templates, not global data paths.
      if (node.children?.length && !isArray) walk(node.children, node.key, depth + 1)
    }
  }
  walk(schema.fields, null, 0)
  return result
}

function compileEffects(
  fields: CompiledField[],
  issues: CompileIssue[],
): CompiledEffect[] {
  const effects: CompiledEffect[] = []

  for (const field of fields) {
    for (const prop of PROP_ORDER) {
      const raw = field.node[prop]
      if (raw === undefined) continue
      const id = `${field.key}.${prop}`
      const fallback = prop === 'visible'
      if (typeof raw === 'boolean') {
        effects.push({
          id,
          fieldKey: field.key,
          prop,
          source: raw,
          literal: true,
          literalValue: raw,
        })
        continue
      }

      try {
        const expression = compileExpression(raw)
        effects.push({
          id,
          fieldKey: field.key,
          prop,
          source: raw,
          literal: false,
          literalValue: fallback,
          expression,
        })
      } catch (error) {
        const expressionError = error as ExpressionError
        issues.push({
          severity: 'error',
          code: expressionError.code ?? 'EXPRESSION',
          message: `字段 "${field.key}" 的 ${prop} 表达式无效：${expressionError.message}`,
          fieldKey: field.key,
          expression: raw,
          line: expressionError.line,
          column: expressionError.column,
        })
        effects.push({
          id,
          fieldKey: field.key,
          prop,
          source: raw,
          literal: true,
          literalValue: fallback,
        })
      }
    }
  }

  return effects
}

/**
 * `$self` is a value read of the effect's own field. Static dependency
 * collection intentionally skips `self` (it has no path), so the compiler
 * re-introduces the owning field here; otherwise an expression such as
 * `visible: "$self > 0"` would never recompute after its own value changes.
 */
function effectDependencies(effect: CompiledEffect): Dependency[] {
  const dependencies = [...(effect.expression?.dependencies ?? [])]
  if (!effect.expression) return dependencies
  let usesSelf = false
  walkAst(effect.expression.ast, (node) => {
    if (node.type === 'Path' && node.scope === 'self') usesSelf = true
  })
  if (
    usesSelf &&
    !dependencies.some((dep) => dep.kind === 'value' && dep.path === effect.fieldKey)
  ) {
    dependencies.unshift({ kind: 'value', path: effect.fieldKey })
  }
  return dependencies
}

function compileRules(fields: CompiledField[], issues: CompileIssue[]): CompiledRule[] {
  const rules: CompiledRule[] = []
  for (const field of fields) {
    field.node.rules?.forEach((rule, index) => {
      let when: CompiledExpression | undefined
      if (typeof rule.when === 'string' && rule.when.trim()) {
        try {
          when = compileExpression(rule.when)
        } catch (error) {
          const expressionError = error as ExpressionError
          issues.push({
            severity: 'error',
            code: expressionError.code ?? 'EXPRESSION',
            message: `字段 "${field.key}" 的第 ${index + 1} 条规则 when 表达式无效：${expressionError.message}`,
            fieldKey: field.key,
            expression: rule.when,
            line: expressionError.line,
            column: expressionError.column,
          })
        }
      }
      rules.push({ fieldKey: field.key, index, rule, when })
    })
  }
  return rules
}

/**
 * Compile schema → program. This is the compile phase: migrate, normalize,
 * parse expressions, build the dependency graph, topologically sort, detect
 * cycles. Everything expensive happens here and the runtime only looks up
 * the resulting tables.
 */
export function compileSchema(input: unknown): FormProgram {
  const startedAt = now()
  const migration = migrateSchema(input)
  const { schema, issues } = normalizeSchema(migration)
  const allFields = flattenFields(schema)
  const fieldMap = new Map<string, CompiledField>()
  for (const field of allFields) {
    if (fieldMap.has(field.key)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_KEY',
        message: `字段 key "${field.key}" 在树中重复`,
        fieldKey: field.key,
      })
    } else {
      fieldMap.set(field.key, field)
    }
  }

  const effects = compileEffects(allFields, issues)
  const effectMap = new Map<string, CompiledEffect>()
  for (const effect of effects) effectMap.set(effect.id, effect)

  const rules = compileRules(allFields, issues)

  const graph = buildDepGraph({
    fields: allFields.map((field) => field.key),
    effects: effects
      .filter((effect) => !effect.literal && effect.expression)
      .map((effect) => ({
        id: effect.id,
        deps: effectDependencies(effect),
      })),
  })

  const { order, cyclic } = toposort(graph)
  const cycles = cyclic.length > 0 ? findCycles(graph, cyclic) : []
  for (const cycle of cycles) {
    issues.push({
      severity: 'error',
      code: 'CIRCULAR_DEPENDENCY',
      message: `CircularDependency: ${formatCycle(cycle)}`,
    })
  }
  if (cyclic.length > 0 && cycles.length === 0) {
    issues.push({
      severity: 'error',
      code: 'CIRCULAR_DEPENDENCY',
      message: `存在无法求解的循环依赖节点：${cyclic.join(', ')}`,
    })
  }

  const expressionCount = effects.filter((effect) => !effect.literal).length
  const stats: CompileStats = {
    fieldCount: allFields.length,
    leafCount: allFields.filter((field) => field.isDataField).length,
    expressionCount,
    nodeCount: graph.nodes.length,
    edgeCount: edgeCount(graph),
    orderLength: order.length,
    cycleCount: cycles.length,
    compileMs: 0,
    schemaHash: hashSchema(schema),
  }
  stats.compileMs = Math.max(0, now() - startedAt)

  return {
    schema,
    layout: schema.layout ?? DEFAULT_LAYOUT,
    fields: schema.fields,
    allFields,
    fieldMap,
    effects,
    effectMap,
    rules,
    graph,
    order,
    cyclic,
    cycles,
    stats,
    issues,
    migration,
  }
}

export function getCompiledField(program: FormProgram, key: string): CompiledField | undefined {
  return program.fieldMap.get(key)
}

export function isDataField(program: FormProgram, key: string): boolean {
  return program.fieldMap.get(key)?.isDataField ?? false
}

export function compileErrors(program: FormProgram): CompileIssue[] {
  return program.issues.filter((issue) => issue.severity === 'error')
}
