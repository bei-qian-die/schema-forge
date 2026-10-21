import type { ExprNode } from './ast'
import { ExpressionError } from './errors'
import { WHITELIST_FUNCTIONS, isWhitelistedFunction } from './functions'
import { getPath } from '../store/path'

export interface EvaluationScope {
  form: Record<string, unknown>
  values?: Record<string, unknown>
  self?: unknown
  index?: number
  status?: Record<string, unknown>
  /** Store-supplied resolver keeps `$status` reads O(1) and flat-key aware. */
  resolveStatus?: (path: string) => unknown
}

function readStatus(path: string, scope: EvaluationScope): unknown {
  if (scope.resolveStatus) return scope.resolveStatus(path)
  const lastDot = path.lastIndexOf('.')
  if (lastDot === -1) return undefined
  const field = path.slice(0, lastDot)
  const prop = path.slice(lastDot + 1)
  const entry = scope.status?.[field]
  if (entry && typeof entry === 'object') {
    return (entry as Record<string, unknown>)[prop]
  }
  return getPath(scope.status, path)
}

export function evaluate(node: ExprNode, scope: EvaluationScope): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value

    case 'Path': {
      if (node.scope === 'self') return scope.self
      if (node.scope === 'index') return scope.index ?? 0
      if (node.scope === 'status') return readStatus(node.path, scope)
      const form = scope.values ?? scope.form
      return node.path ? getPath(form, node.path) : form
    }

    case 'Unary': {
      if (node.op === '!') return !evaluate(node.argument, scope)
      const value = Number(evaluate(node.argument, scope))
      return node.op === '-' ? -value : value
    }

    case 'Conditional':
      return evaluate(node.test, scope)
        ? evaluate(node.consequent, scope)
        : evaluate(node.alternate, scope)

    case 'Binary': {
      // Short-circuit before evaluating the right hand side.
      if (node.op === '&&') {
        const left = evaluate(node.left, scope)
        return left ? evaluate(node.right, scope) : left
      }
      if (node.op === '||') {
        const left = evaluate(node.left, scope)
        return left ? left : evaluate(node.right, scope)
      }

      const left = evaluate(node.left, scope)
      const right = evaluate(node.right, scope)
      switch (node.op) {
        case '===':
          return left === right
        case '!==':
          return left !== right
        case '==':
          // Loose equality is part of the supported grammar.
          return left == right
        case '!=':
          return left != right
        case '>':
          return (left as number) > (right as number)
        case '>=':
          return (left as number) >= (right as number)
        case '<':
          return (left as number) < (right as number)
        case '<=':
          return (left as number) <= (right as number)
        case '+':
          return (left as number) + (right as number)
        case '-':
          return Number(left) - Number(right)
        case '*':
          return Number(left) * Number(right)
        case '/':
          return Number(left) / Number(right)
        case '%':
          return Number(left) % Number(right)
      }
      return undefined
    }

    case 'Call': {
      if (!isWhitelistedFunction(node.callee)) {
        throw new ExpressionError(`未授权的函数 "${node.callee}"`, '', { index: 0, line: 1, column: 1 }, 'SANDBOX')
      }
      const fn = WHITELIST_FUNCTIONS[node.callee]
      const args = node.args.map((arg) => evaluate(arg, scope))
      return fn(...args)
    }
  }
}

export function evaluateBoolean(node: ExprNode, scope: EvaluationScope): boolean {
  return Boolean(evaluate(node, scope))
}
