import {
  deepClone,
  getAtPointer,
  isLayoutType,
  pointerSegments,
  type FieldNode,
  type FormSchema,
  type JsonPatch,
  type MaterialSpec,
} from '@schema-forge/core'

export interface LocatedNode {
  node: FieldNode
  parentArray: FieldNode[]
  index: number
  parent: FieldNode | null
}

export function fieldPointer(parentPointer: string, index: number): string {
  return `${parentPointer}/${index}`
}

export function childrenPointer(pointer: string): string {
  return `${pointer}/children`
}

export function parentPointerOf(pointer: string): string {
  const slash = pointer.lastIndexOf('/')
  return slash <= 0 ? '/fields' : pointer.slice(0, slash)
}

export function isDescendantPointer(ancestor: string, candidate: string): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`)
}

export function locateNode(schema: FormSchema, pointer: string | null): LocatedNode | null {
  if (!pointer) return null
  let segments: string[]
  try {
    segments = pointerSegments(pointer)
  } catch {
    return null
  }
  if (segments[0] !== 'fields') return null

  let array: FieldNode[] = schema.fields
  let parent: FieldNode | null = null
  let cursor = 1
  while (cursor < segments.length) {
    const index = Number(segments[cursor])
    if (!Number.isInteger(index) || index < 0 || index >= array.length) return null
    const node = array[index] as FieldNode
    if (cursor === segments.length - 1) {
      return { node, parentArray: array, index, parent }
    }
    if (segments[cursor + 1] !== 'children') return null
    array = node.children ?? []
    parent = node
    cursor += 2
  }
  return null
}

export function nodeAt(schema: FormSchema, pointer: string | null): FieldNode | null {
  return locateNode(schema, pointer)?.node ?? null
}

export function findPointerByKey(
  fields: FieldNode[],
  key: string,
  base = '/fields',
): string | null {
  for (let index = 0; index < fields.length; index++) {
    const node = fields[index] as FieldNode
    const pointer = `${base}/${index}`
    if (node.key === key) return pointer
    const nested = findPointerByKey(node.children ?? [], key, `${pointer}/children`)
    if (nested) return nested
  }
  return null
}

export function firstLeafPointer(fields: FieldNode[], base = '/fields'): string | null {
  for (let index = 0; index < fields.length; index++) {
    const node = fields[index] as FieldNode
    const pointer = `${base}/${index}`
    if (!isLayoutType(node.type)) return pointer
    const nested = firstLeafPointer(node.children ?? [], `${pointer}/children`)
    if (nested) return nested
  }
  return fields.length > 0 ? `${base}/0` : null
}

export function collectKeys(fields: FieldNode[], out = new Set<string>()): Set<string> {
  for (const node of fields) {
    out.add(node.key)
    if (node.children?.length) collectKeys(node.children, out)
  }
  return out
}

export function collectKeysExcluding(
  schema: FormSchema,
  pointer: string,
  out = new Set<string>(),
): Set<string> {
  const walk = (fields: FieldNode[], base: string) => {
    for (let index = 0; index < fields.length; index++) {
      const node = fields[index] as FieldNode
      const current = `${base}/${index}`
      if (current !== pointer) out.add(node.key)
      if (node.children?.length) walk(node.children, `${current}/children`)
    }
  }
  walk(schema.fields, '/fields')
  return out
}

export function nextUniqueKey(base: string, used: Set<string>): string {
  const clean = sanitizeKey(base) || 'field'
  if (!used.has(clean)) return clean
  let counter = 2
  while (used.has(`${clean}_${counter}`)) counter++
  return `${clean}_${counter}`
}

export function sanitizeKey(raw: string): string {
  let key = raw.trim().replace(/\s+/g, '_').replace(/[^\w.[\]]/g, '')
  if (!key) return ''
  if (/^\d/.test(key)) key = `field_${key}`
  if (key.startsWith('$')) key = key.slice(1)
  return key
}

function makeTab(key: string, label: string): FieldNode {
  return {
    key,
    type: 'tab',
    label,
    props: { label },
    layout: { colSpan: 12 },
    children: [],
  }
}

export function makeFieldNode(
  material: MaterialSpec,
  used: Set<string>,
  labelHint?: string,
): FieldNode {
  const key = nextUniqueKey(material.type, used)
  used.add(key)
  const baseLabel = labelHint || material.title || material.type
  const label = baseLabel === material.title && key !== material.type ? `${baseLabel} ${key.split('_').pop()}` : baseLabel
  const node: FieldNode = {
    key,
    type: material.type,
    label,
    layout: { colSpan: isLayoutType(material.type) ? 12 : 6 },
  }
  if (material.defaultProps && Object.keys(material.defaultProps).length > 0) {
    node.props = deepClone(material.defaultProps)
  }
  if (isLayoutType(material.type)) node.children = []
  if (material.type === 'tabs') {
    const first = nextUniqueKey(`${key}_tab1`, used)
    used.add(first)
    const second = nextUniqueKey(`${key}_tab2`, used)
    used.add(second)
    node.children = [makeTab(first, '基本信息'), makeTab(second, '更多信息')]
  }
  return node
}

/**
 * Field renames are compiler-level operations: expressions that point at the
 * old path must keep compiling, so references are rewritten in the same patch.
 */
export function rewriteKeyReferences(
  schema: FormSchema,
  oldKey: string,
  newKey: string,
): FormSchema {
  if (oldKey === newKey) return schema
  const escaped = oldKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const formRef = new RegExp(`(\\$(?:form|values)\\.)${escaped}(?![\\w$])`, 'g')
  const statusRef = new RegExp(`(\\$status\\.)${escaped}(?=\\.)`, 'g')
  const bareRef = new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])`, 'g')

  const rewrite = (source: string): string =>
    source
      .replace(formRef, `$1${newKey}`)
      .replace(statusRef, `$1${newKey}`)
      .replace(bareRef, newKey)

  const walk = (node: FieldNode): FieldNode => {
    const next: FieldNode = { ...node }
    for (const prop of ['visible', 'disabled', 'required'] as const) {
      const value = next[prop]
      if (typeof value === 'string') next[prop] = rewrite(value)
    }
    if (next.rules?.length) {
      next.rules = next.rules.map((rule) =>
        typeof rule.when === 'string' ? { ...rule, when: rewrite(rule.when) } : rule,
      )
    }
    if (next.children?.length) next.children = next.children.map(walk)
    return next
  }

  return { ...schema, fields: schema.fields.map(walk) }
}

export function summarizePatch(patch: JsonPatch): string {
  if (patch.length === 0) return 'no changes'
  const [first] = patch
  const extra = patch.length > 1 ? ` +${patch.length - 1}` : ''
  if (!first) return 'no changes'
  return `${first.op} ${first.path || '/'}${extra}`
}

export function downloadSchema(schema: FormSchema): void {
  const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${schema.id || 'form'}.schema.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function effectLabel(id: string): string {
  return id.replace(/\.(visible|disabled|required)$/, '')
}

export function readNode(schema: FormSchema, pointer: string): FieldNode | null {
  try {
    const value = getAtPointer(schema, pointer)
    return value && typeof value === 'object' && 'key' in value ? (value as FieldNode) : null
  } catch {
    return null
  }
}
