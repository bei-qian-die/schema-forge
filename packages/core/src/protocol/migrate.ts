import { DEFAULT_LAYOUT, SCHEMA_VERSION, type FieldNode, type FormSchema, type RuleSpec } from './schema'

type LooseSchema = Record<string, unknown> & {
  version?: string
  fields?: unknown[]
  layout?: unknown
  id?: string
  title?: string
}

interface Migration {
  from: string
  to: string
  up: (schema: LooseSchema) => LooseSchema
}

interface VisibleWhen {
  field?: string
  eq?: unknown
  in?: unknown[]
}

function compareVersion(a: string, b: string): number {
  const partsA = a.split('.').map((n) => Number(n) || 0)
  const partsB = b.split('.').map((n) => Number(n) || 0)
  const length = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < length; i++) {
    const left = partsA[i] ?? 0
    const right = partsB[i] ?? 0
    if (left !== right) return left < right ? -1 : 1
  }
  return 0
}

function visibleWhenToExpression(when: VisibleWhen): string {
  const field = `$form.${when.field ?? ''}`
  if (Array.isArray(when.in)) {
    if (when.in.length === 0) return 'false'
    return when.in
      .map((value) => `${field} === ${JSON.stringify(value)}`)
      .join(' || ')
  }
  return `${field} === ${JSON.stringify(when.eq)}`
}

function migrateField(field: Record<string, unknown>): Record<string, unknown> {
  const next = { ...field }
  const when = next.visibleWhen as VisibleWhen | undefined
  if (when && typeof when === 'object') {
    next.visible = visibleWhenToExpression(when)
    delete next.visibleWhen
  }
  if (next.requiredWhen && typeof next.requiredWhen === 'object') {
    next.required = visibleWhenToExpression(next.requiredWhen as VisibleWhen)
    delete next.requiredWhen
  }
  const rules = next.rules as RuleSpec[] | undefined
  if (Array.isArray(rules)) {
    next.rules = rules.map((rule) => {
      if (rule && typeof rule === 'object' && rule.when && typeof rule.when === 'object') {
        const { when: legacyWhen, ...rest } = rule as RuleSpec & { when?: unknown }
        return { ...rest, when: visibleWhenToExpression(legacyWhen as VisibleWhen) }
      }
      return rule
    })
  }
  if (Array.isArray(next.children)) {
    next.children = (next.children as Record<string, unknown>[]).map(migrateField)
  }
  return next
}

const MIGRATIONS: Migration[] = [
  {
    from: '1.0',
    to: '1.1',
    up(schema) {
      return {
        ...schema,
        version: '1.1',
        fields: (schema.fields ?? []).map((field) =>
          migrateField(field as Record<string, unknown>),
        ),
      }
    },
  },
  {
    from: '1.1',
    to: SCHEMA_VERSION,
    up(schema) {
      const fields = (schema.fields ?? []).map((field) =>
        migrateField(field as Record<string, unknown>),
      ) as unknown as FieldNode[]
      return {
        ...schema,
        version: SCHEMA_VERSION,
        layout: schema.layout ?? DEFAULT_LAYOUT,
        fields,
      }
    },
  },
]

export interface MigrationResult {
  schema: FormSchema
  applied: string[]
  warnings: string[]
}

/**
 * Pure, level-by-level migration chain. If one step throws we keep the last
 * good schema and surface a warning — never lose data silently.
 */
export function migrateSchema(input: unknown): MigrationResult {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Schema 必须是对象')
  }
  let current = JSON.parse(JSON.stringify(input)) as LooseSchema
  const applied: string[] = []
  const warnings: string[] = []

  if (!current.version) {
    current.version = '1.0'
    warnings.push('Schema 缺少 version，按 1.0 处理')
  }
  if (!Array.isArray(current.fields)) {
    throw new Error('Schema.fields 必须是数组')
  }

  for (const migration of MIGRATIONS) {
    if (compareVersion(current.version ?? '1.0', migration.to) >= 0) continue
    try {
      current = migration.up(current)
      current.version = migration.to
      applied.push(`${migration.from} → ${migration.to}`)
    } catch (error) {
      warnings.push(
        `migrate ${migration.from} → ${migration.to} 失败，已保留上一版本：${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      break
    }
  }

  if (compareVersion(current.version ?? '1.0', SCHEMA_VERSION) > 0) {
    warnings.push(`Schema 版本 ${current.version} 高于引擎支持版本 ${SCHEMA_VERSION}`)
  }

  const schema: FormSchema = {
    version: current.version ?? SCHEMA_VERSION,
    id: current.id ?? 'form',
    title: current.title,
    layout: (current.layout as FormSchema['layout']) ?? DEFAULT_LAYOUT,
    fields: (current.fields ?? []) as FieldNode[],
  }
  return { schema, applied, warnings }
}
