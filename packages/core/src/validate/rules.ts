import type { FieldStatus, RuleSpec } from '../protocol/schema'
import { isEmpty } from '../store/path'

export interface SyncRuleContext {
  key: string
  value: unknown
  values: Record<string, unknown>
  status: FieldStatus
  rule: RuleSpec
}

export type SyncRuleValidator = (context: SyncRuleContext) => string | true | void

const customValidators = new Map<string, SyncRuleValidator>()
const patternCache = new Map<string, RegExp>()

export function registerRuleValidator(name: string, validator: SyncRuleValidator): void {
  customValidators.set(name, validator)
}

export function unregisterRuleValidator(name: string): void {
  customValidators.delete(name)
}

export function isAsyncRule(rule: RuleSpec): boolean {
  return rule.kind === 'async-remote'
}

function compilePattern(pattern: string): RegExp | null {
  const cached = patternCache.get(pattern)
  if (cached) return cached
  try {
    const regex = new RegExp(pattern)
    patternCache.set(pattern, regex)
    return regex
  } catch {
    return null
  }
}

export function defaultRuleMessage(rule: RuleSpec, key: string): string {
  if (rule.message) return rule.message
  switch (rule.kind) {
    case 'required':
      return `${key} 为必填项`
    case 'pattern':
      return '格式不正确'
    case 'len':
      return `长度需在 ${rule.min ?? 0} – ${rule.max ?? '∞'} 之间`
    case 'range':
      return `数值需在 ${rule.min ?? '-∞'} – ${rule.max ?? '∞'} 之间`
    default:
      return '校验未通过'
  }
}

/** Sync-only rules. `async-remote` is scheduled by the store. */
export function runSyncRule(context: SyncRuleContext): string | null {
  const { rule, value, key } = context
  if (rule.kind === 'async-remote') return null
  if (rule.kind !== 'required' && isEmpty(value)) return null

  switch (rule.kind) {
    case 'required':
      return isEmpty(value) ? defaultRuleMessage(rule, key) : null

    case 'pattern': {
      const pattern = typeof rule.pattern === 'string' ? rule.pattern : rule.value
      if (typeof pattern !== 'string' || !pattern) return null
      const regex = compilePattern(pattern)
      if (!regex) return rule.message || '正则表达式无效'
      return regex.test(String(value)) ? null : defaultRuleMessage(rule, key)
    }

    case 'len': {
      const length = typeof value === 'string' || Array.isArray(value) ? value.length : 0
      if (typeof rule.min === 'number' && length < rule.min) return defaultRuleMessage(rule, key)
      if (typeof rule.max === 'number' && length > rule.max) return defaultRuleMessage(rule, key)
      return null
    }

    case 'range': {
      const numeric = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numeric)) return defaultRuleMessage(rule, key)
      if (typeof rule.min === 'number' && numeric < rule.min) return defaultRuleMessage(rule, key)
      if (typeof rule.max === 'number' && numeric > rule.max) return defaultRuleMessage(rule, key)
      return null
    }

    case 'custom': {
      const validator = rule.name ? customValidators.get(rule.name) : undefined
      if (!validator) return null
      const result = validator(context)
      if (result === true || result == null) return null
      return result || defaultRuleMessage(rule, key)
    }

    default:
      return null
  }
}

export function listCustomRules(): string[] {
  return [...customValidators.keys()]
}
