/**
 * Path helpers for logical field paths such as `company.taxNo`,
 * `items[0].price` and plain object keys. Reads check an exact (flat) key
 * first — a real bug the prototype hit — and only then walk segments.
 */

export type PathSegment = string | number

export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = []
  let buffer = ''

  const flush = () => {
    if (buffer.length > 0) {
      segments.push(buffer)
      buffer = ''
    }
  }

  for (let i = 0; i < path.length; i++) {
    const char = path[i] as string
    if (char === '.') {
      flush()
      continue
    }
    if (char === '[') {
      flush()
      const end = path.indexOf(']', i)
      if (end === -1) {
        buffer += char
        continue
      }
      const raw = path.slice(i + 1, end).trim()
      if (raw.startsWith('"') || raw.startsWith("'")) {
        segments.push(raw.slice(1, -1))
      } else if (/^\d+$/.test(raw)) {
        segments.push(Number(raw))
      } else {
        segments.push(raw)
      }
      i = end
      continue
    }
    buffer += char
  }
  flush()
  return segments
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasOwn(value: unknown, key: string): boolean {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key)
}

export function getPath(source: unknown, path: string): unknown {
  if (source == null) return undefined
  if (hasOwn(source, path)) return (source as Record<string, unknown>)[path]

  const segments = parsePath(path)
  let cursor: unknown = source
  for (const segment of segments) {
    if (cursor == null) return undefined
    if (typeof segment === 'number') {
      if (!Array.isArray(cursor)) return undefined
      cursor = cursor[segment]
    } else {
      if (hasOwn(cursor, segment)) {
        cursor = (cursor as Record<string, unknown>)[segment]
      } else if (Array.isArray(cursor) && /^\d+$/.test(segment)) {
        cursor = cursor[Number(segment)]
      } else {
        return undefined
      }
    }
  }
  return cursor
}

export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  // Preserve the flat-key form when the caller supplied flat data.
  if (hasOwn(target, path)) {
    target[path] = value
    return
  }
  const segments = parsePath(path)
  if (segments.length === 0) return

  let cursor: Record<string, unknown> | unknown[] = target
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i] as PathSegment
    const next = segments[i + 1]
    if (typeof segment === 'number') {
      if (!Array.isArray(cursor)) return
      if (cursor[segment] == null || typeof cursor[segment] !== 'object') {
        cursor[segment] = typeof next === 'number' ? [] : {}
      }
      cursor = cursor[segment] as Record<string, unknown> | unknown[]
    } else {
      const container = cursor as Record<string, unknown>
      if (container[segment] == null || typeof container[segment] !== 'object') {
        container[segment] = typeof next === 'number' ? [] : {}
      }
      cursor = container[segment] as Record<string, unknown> | unknown[]
    }
  }

  const last = segments[segments.length - 1] as PathSegment
  if (typeof last === 'number') {
    if (Array.isArray(cursor)) cursor[last] = value
  } else {
    ;(cursor as Record<string, unknown>)[last] = value
  }
}

export function deletePath(target: Record<string, unknown>, path: string): void {
  if (hasOwn(target, path)) {
    delete target[path]
    return
  }
  const segments = parsePath(path)
  if (segments.length === 0) return
  let cursor: unknown = target
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i] as PathSegment
    if (cursor == null || typeof cursor !== 'object') return
    cursor = Array.isArray(cursor)
      ? cursor[Number(segment)]
      : (cursor as Record<string, unknown>)[String(segment)]
  }
  if (cursor == null || typeof cursor !== 'object') return
  const last = segments[segments.length - 1] as PathSegment
  if (Array.isArray(cursor)) cursor.splice(Number(last), 1)
  else delete (cursor as Record<string, unknown>)[String(last)]
}

export { deepClone } from '../clone'

/** Flatten own enumerable leaf paths. Used by the benchmark harness. */
export function flattenValues(
  source: unknown,
  prefix = '',
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  if (source == null) return out
  if (typeof source !== 'object') {
    if (prefix) out[prefix] = source
    return out
  }
  if (Array.isArray(source)) {
    if (prefix) out[prefix] = source
    return out
  }
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flattenValues(value, next, out)
    } else {
      out[next] = value
    }
  }
  return out
}

export function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}
