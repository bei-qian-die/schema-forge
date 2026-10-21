import { isEmpty } from '../store/path'

export type WhitelistFn = (...args: unknown[]) => unknown

/**
 * Deliberately small. No `eval`, no `Function`, no access to globals.
 * Everything an expression can do is listed here.
 */
export const WHITELIST_FUNCTIONS: Record<string, WhitelistFn> = {
  len(value: unknown) {
    if (typeof value === 'string' || Array.isArray(value)) return value.length
    if (value && typeof value === 'object') return Object.keys(value).length
    return 0
  },
  includes(container: unknown, value: unknown) {
    if (typeof container === 'string') return container.includes(String(value))
    if (Array.isArray(container)) return container.includes(value)
    return false
  },
  empty(value: unknown) {
    return isEmpty(value)
  },
  sum(...args: unknown[]) {
    let total = 0
    for (const arg of args.flat()) {
      const n = typeof arg === 'number' ? arg : Number(arg)
      if (Number.isFinite(n)) total += n
    }
    return total
  },
  date(value: unknown) {
    if (value == null || value === '') return ''
    const date = new Date(value as string | number)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 10)
  },
  upper(value: unknown) {
    return String(value ?? '').toUpperCase()
  },
  lower(value: unknown) {
    return String(value ?? '').toLowerCase()
  },
}

export type WhitelistFunctionName = keyof typeof WHITELIST_FUNCTIONS

export function isWhitelistedFunction(name: string): name is WhitelistFunctionName {
  return Object.prototype.hasOwnProperty.call(WHITELIST_FUNCTIONS, name)
}

export function listWhitelistFunctions(): string[] {
  return Object.keys(WHITELIST_FUNCTIONS)
}
