import { deepClone } from '../clone'

export type JsonPointer = string

export interface AddOperation {
  op: 'add'
  path: JsonPointer
  value: unknown
}
export interface RemoveOperation {
  op: 'remove'
  path: JsonPointer
}
export interface ReplaceOperation {
  op: 'replace'
  path: JsonPointer
  value: unknown
}
export interface MoveOperation {
  op: 'move'
  from: JsonPointer
  path: JsonPointer
}
export interface CopyOperation {
  op: 'copy'
  from: JsonPointer
  path: JsonPointer
}
export interface TestOperation {
  op: 'test'
  path: JsonPointer
  value: unknown
}

export type JsonPatchOperation =
  | AddOperation
  | RemoveOperation
  | ReplaceOperation
  | MoveOperation
  | CopyOperation
  | TestOperation

export type JsonPatch = JsonPatchOperation[]

export class PatchError extends Error {
  constructor(message: string, readonly operation?: JsonPatchOperation) {
    super(message)
    this.name = 'PatchError'
  }
}

export function escapePointer(segment: string | number): string {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1')
}

export function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

export function toPointer(segments: (string | number)[]): JsonPointer {
  if (segments.length === 0) return ''
  return '/' + segments.map(escapePointer).join('/')
}

export function pointerSegments(pointer: JsonPointer): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw new PatchError(`非法 JSON Pointer "${pointer}"：必须以 / 开头`)
  }
  return pointer.slice(1).split('/').map(unescapePointer)
}

export function getAtPointer(doc: unknown, pointer: JsonPointer): unknown {
  let cursor: unknown = doc
  for (const segment of pointerSegments(pointer)) {
    if (Array.isArray(cursor)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        throw new PatchError(`路径不存在：${pointer}`)
      }
      cursor = cursor[index]
    } else if (cursor && typeof cursor === 'object') {
      const record = cursor as Record<string, unknown>
      if (!Object.prototype.hasOwnProperty.call(record, segment)) {
        throw new PatchError(`路径不存在：${pointer}`)
      }
      cursor = record[segment]
    } else {
      throw new PatchError(`路径不存在：${pointer}`)
    }
  }
  return cursor
}

function cloneContainer<T>(value: T): T {
  if (Array.isArray(value)) return value.slice() as T
  if (value && typeof value === 'object') return { ...(value as object) } as T
  return value
}

function replaceIn(current: unknown, segments: string[], index: number, value: unknown): unknown {
  if (index === segments.length) return value
  if (current == null || typeof current !== 'object') {
    throw new PatchError(`无法在非容器路径上执行 replace：/${segments.join('/')}`)
  }
  const segment = segments[index] as string
  if (Array.isArray(current)) {
    const position = Number(segment)
    if (!Number.isInteger(position) || position < 0 || position >= current.length) {
      throw new PatchError(`replace 数组下标越界：${position}`)
    }
    const copy = current.slice()
    copy[position] = replaceIn(current[position], segments, index + 1, value)
    return copy
  }
  const copy = { ...(current as Record<string, unknown>) }
  copy[segment] = replaceIn(copy[segment], segments, index + 1, value)
  return copy
}

function addIn(current: unknown, segments: string[], index: number, value: unknown): unknown {
  if (segments.length === 0) return value
  if (current == null || typeof current !== 'object') {
    throw new PatchError(`无法在非容器路径上执行 add：/${segments.join('/')}`)
  }
  const segment = segments[index] as string

  if (index === segments.length - 1) {
    if (Array.isArray(current)) {
      const position = segment === '-' ? current.length : Number(segment)
      if (!Number.isInteger(position) || position < 0 || position > current.length) {
        throw new PatchError(`add 数组下标越界：${segment}`)
      }
      const copy = current.slice()
      copy.splice(position, 0, value)
      return copy
    }
    return { ...(current as Record<string, unknown>), [segment]: value }
  }

  if (Array.isArray(current)) {
    const position = Number(segment)
    if (!Number.isInteger(position) || position < 0 || position >= current.length) {
      throw new PatchError(`add 数组下标越界：${segment}`)
    }
    const copy = current.slice()
    copy[position] = addIn(current[position], segments, index + 1, value)
    return copy
  }

  const record = current as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(record, segment)) {
    throw new PatchError(`add 的父路径不存在：/${segments.slice(0, index + 1).join('/')}`)
  }
  const copy = { ...record }
  copy[segment] = addIn(record[segment], segments, index + 1, value)
  return copy
}

function removeIn(current: unknown, segments: string[], index: number): unknown {
  if (current == null || typeof current !== 'object') {
    throw new PatchError(`无法删除非容器路径：/${segments.join('/')}`)
  }
  const segment = segments[index] as string

  if (index === segments.length - 1) {
    if (Array.isArray(current)) {
      const position = Number(segment)
      if (!Number.isInteger(position) || position < 0 || position >= current.length) {
        throw new PatchError(`remove 数组下标越界：${segment}`)
      }
      const copy = current.slice()
      copy.splice(position, 1)
      return copy
    }
    const record = current as Record<string, unknown>
    if (!Object.prototype.hasOwnProperty.call(record, segment)) {
      throw new PatchError(`remove 路径不存在：/${segments.join('/')}`)
    }
    const copy = { ...record }
    delete copy[segment]
    return copy
  }

  if (Array.isArray(current)) {
    const position = Number(segment)
    if (!Number.isInteger(position) || position < 0 || position >= current.length) {
      throw new PatchError(`remove 数组下标越界：${segment}`)
    }
    const copy = current.slice()
    copy[position] = removeIn(current[position], segments, index + 1)
    return copy
  }

  const record = current as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(record, segment)) {
    throw new PatchError(`remove 的父路径不存在：/${segments.slice(0, index + 1).join('/')}`)
  }
  const copy = { ...record }
  copy[segment] = removeIn(record[segment], segments, index + 1)
  return copy
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
    }
    const keysA = Object.keys(a as object)
    const keysB = Object.keys(b as object)
    if (keysA.length !== keysB.length) return false
    return keysA.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  }
  return false
}

function applyOperation(doc: unknown, operation: JsonPatchOperation): unknown {
  switch (operation.op) {
    case 'add':
      return addIn(doc, pointerSegments(operation.path), 0, deepClone(operation.value))
    case 'replace':
      return replaceIn(doc, pointerSegments(operation.path), 0, deepClone(operation.value))
    case 'remove':
      return removeIn(doc, pointerSegments(operation.path), 0)
    case 'copy': {
      const value = getAtPointer(doc, operation.from)
      return addIn(doc, pointerSegments(operation.path), 0, deepClone(value))
    }
    case 'move': {
      if (operation.from === operation.path) return doc
      const value = getAtPointer(doc, operation.from)
      const without = removeIn(doc, pointerSegments(operation.from), 0)
      return addIn(without, pointerSegments(operation.path), 0, value)
    }
    case 'test': {
      const actual = getAtPointer(doc, operation.path)
      if (!deepEqual(actual, operation.value)) {
        throw new PatchError(`test 失败：${operation.path}`, operation)
      }
      return doc
    }
  }
}

/**
 * Immutable RFC 6902 application. Containers along the changed path are copied,
 * so `prev` stays usable for time travel while untouched subtrees are shared.
 */
export function applyPatch<T>(document: T, patch: JsonPatch): T {
  let current: unknown = document
  for (const operation of patch) {
    try {
      current = applyOperation(current, operation)
    } catch (error) {
      if (error instanceof PatchError) throw error
      throw new PatchError(
        `应用 ${operation.op} ${'path' in operation ? operation.path : ''} 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
        operation,
      )
    }
  }
  return current as T
}

function diffInto(prev: unknown, next: unknown, path: string, patch: JsonPatch): void {
  if (deepEqual(prev, next)) return

  if (Array.isArray(prev) && Array.isArray(next)) {
    const shared = Math.min(prev.length, next.length)
    for (let index = 0; index < shared; index++) {
      diffInto(prev[index], next[index], `${path}/${index}`, patch)
    }
    for (let index = prev.length - 1; index >= next.length; index--) {
      patch.push({ op: 'remove', path: `${path}/${index}` })
    }
    for (let index = shared; index < next.length; index++) {
      patch.push({
        op: 'add',
        path: `${path}/-`,
        value: deepClone(next[index]),
      })
    }
    return
  }

  if (
    prev &&
    next &&
    typeof prev === 'object' &&
    typeof next === 'object' &&
    !Array.isArray(prev) &&
    !Array.isArray(next)
  ) {
    const prevRecord = prev as Record<string, unknown>
    const nextRecord = next as Record<string, unknown>
    for (const key of Object.keys(prevRecord)) {
      if (!Object.prototype.hasOwnProperty.call(nextRecord, key)) {
        patch.push({ op: 'remove', path: `${path}/${escapePointer(key)}` })
      }
    }
    for (const key of Object.keys(nextRecord)) {
      const pointer = `${path}/${escapePointer(key)}`
      if (!Object.prototype.hasOwnProperty.call(prevRecord, key)) {
        patch.push({ op: 'add', path: pointer, value: deepClone(nextRecord[key]) })
      } else {
        diffInto(prevRecord[key], nextRecord[key], pointer, patch)
      }
    }
    return
  }

  patch.push({ op: 'replace', path: path || '', value: deepClone(next) })
}

export function diff(prev: unknown, next: unknown): JsonPatch {
  const patch: JsonPatch = []
  diffInto(prev, next, '', patch)
  return patch
}

export const createPatch = diff
