import type { FieldNode, FormSchema } from './protocol/schema'

export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object'
  | 'any'

/**
 * A material is metadata + a self-describing property schema. It never
 * contains a framework component: that lives one layer up in the renderer.
 */
export interface MaterialSpec {
  type: string
  title: string
  group?: string
  icon?: string
  description?: string
  valueType?: ValueType
  defaultValue?: unknown
  defaultProps?: Record<string, unknown>
  acceptsChildren?: boolean
  /**
   * Bootstrap: the property panel is rendered by the same engine from this
   * schema. Expressions inside it are real and evaluated at runtime.
   */
  propsSchema?: { fields: FieldNode[] } | FormSchema
}

const registry = new Map<string, MaterialSpec>()

export function registerMaterial(spec: MaterialSpec): void {
  if (!spec.type) throw new Error('Material 缺少 type')
  if (registry.has(spec.type)) {
    // Registration is idempotent by type; last one wins (hot reload friendly).
  }
  registry.set(spec.type, spec)
}

export function registerMaterials(specs: MaterialSpec[]): void {
  for (const spec of specs) registerMaterial(spec)
}

export function getMaterial(type: string): MaterialSpec | undefined {
  return registry.get(type)
}

export function listMaterials(): MaterialSpec[] {
  return [...registry.values()]
}

export function listMaterialsByGroup(): Record<string, MaterialSpec[]> {
  const groups: Record<string, MaterialSpec[]> = {}
  for (const spec of registry.values()) {
    const group = spec.group ?? '其他'
    ;(groups[group] ??= []).push(spec)
  }
  return groups
}

export function clearMaterialRegistry(): void {
  registry.clear()
}

export function defaultValueForType(type: string): unknown {
  const material = registry.get(type)
  if (material && material.defaultValue !== undefined) return material.defaultValue
  switch (material?.valueType) {
    case 'number':
      return undefined
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return {}
    case 'date':
    case 'string':
    case 'any':
    default:
      return ''
  }
}

export function propsFields(material: MaterialSpec | undefined): FieldNode[] {
  if (!material?.propsSchema) return []
  const schema = material.propsSchema
  if ('fields' in schema && Array.isArray(schema.fields)) return schema.fields
  return []
}
