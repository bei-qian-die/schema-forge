/**
 * schema-forge protocol v2.
 *
 * A schema is source code: fields are declarations, expressions are the
 * executable part. Everything else in core exists to compile and run it.
 */

export type ExpressionSource = string

export type RuleKind =
  | 'required'
  | 'pattern'
  | 'len'
  | 'range'
  | 'async-remote'
  | 'custom'

export interface RuleSpec {
  kind: RuleKind
  message: string
  /** Conditional rule gate. Evaluated against the current scope. */
  when?: ExpressionSource
  /** pattern rule */
  value?: string
  pattern?: string
  /** len / range */
  min?: number
  max?: number
  /** custom rule id registered with registerRule() */
  name?: string
  [key: string]: unknown
}

export interface FieldLayout {
  colSpan?: number
  offset?: number
  rowSpan?: number
}

export type LayoutContainerType = 'grid' | 'card' | 'tabs' | 'tab' | 'collapse' | 'array'

export interface FieldNode {
  /** Logical data path. Dots create nesting: `company.taxNo`. */
  key: string
  type: string
  label: string
  props?: Record<string, unknown>
  layout?: FieldLayout
  visible?: ExpressionSource | boolean
  disabled?: ExpressionSource | boolean
  required?: ExpressionSource | boolean
  defaultValue?: unknown
  rules?: RuleSpec[]
  children?: FieldNode[]
}

export interface SchemaLayout {
  type: 'grid'
  columns: number
  gutter: number
}

export interface FormSchema {
  version: string
  id: string
  title?: string
  description?: string
  layout?: SchemaLayout
  fields: FieldNode[]
}

export interface FieldStatus {
  visible: boolean
  disabled: boolean
  required: boolean
}

export interface ErrorTree {
  [key: string]: string[] | ErrorTree
}

export const SCHEMA_VERSION = '2.0'

export const DEFAULT_LAYOUT: SchemaLayout = {
  type: 'grid',
  columns: 12,
  gutter: 16,
}

export const LAYOUT_TYPES: readonly LayoutContainerType[] = [
  'grid',
  'card',
  'tabs',
  'tab',
  'collapse',
  'array',
]

export function isLayoutType(type: string): type is LayoutContainerType {
  return (LAYOUT_TYPES as readonly string[]).includes(type)
}

export function isValueRule(required: FieldNode['required']): required is boolean {
  return typeof required === 'boolean'
}

export function emptyStatus(): FieldStatus {
  return { visible: true, disabled: false, required: false }
}

/** Stable, dependency-free hash used for compile memo keys and UI badges. */
export function hashSchema(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 7)
}
