import type { ExprNode } from './ast'
import { collectDependencies, type Dependency } from './deps'
import { evaluate, type EvaluationScope } from './evaluate'
import { parse } from './parser'

export { ExpressionError } from './errors'
export { lex, type Token, type TokenType } from './lexer'
export { parse } from './parser'
export { evaluate, evaluateBoolean, type EvaluationScope } from './evaluate'
export { collectDependencies, collectDeps, walkAst, type Dependency } from './deps'
export { parse as parseExpression }
export {
  WHITELIST_FUNCTIONS,
  isWhitelistedFunction,
  listWhitelistFunctions,
} from './functions'
export type { ExprNode } from './ast'

export interface CompiledExpression {
  source: string
  ast: ExprNode
  deps: string[]
  dependencies: Dependency[]
}

const cache = new Map<string, CompiledExpression>()
const MAX_CACHE = 400

export interface CompileExpressionOptions {
  cache?: boolean
}

/**
 * Compile once, evaluate many times. The AST is immutable and shared by every
 * call site, which is why per-keystroke evaluation does not reparse source.
 */
export function compileExpression(
  source: string,
  options: CompileExpressionOptions = {},
): CompiledExpression {
  const useCache = options.cache !== false
  if (useCache) {
    const hit = cache.get(source)
    if (hit) return hit
  }

  const ast = parse(source)
  const dependencies = collectDependencies(ast)
  const compiled: CompiledExpression = {
    source,
    ast,
    deps: dependencies.map((dep) => dep.path),
    dependencies,
  }

  if (useCache) {
    if (cache.size >= MAX_CACHE) {
      const first = cache.keys().next().value
      if (first !== undefined) cache.delete(first)
    }
    cache.set(source, compiled)
  }
  return compiled
}

export function clearExpressionCache(): void {
  cache.clear()
}

export function evaluateExpression(source: string, scope: EvaluationScope): unknown {
  return evaluate(compileExpression(source).ast, scope)
}
