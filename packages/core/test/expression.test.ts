import { describe, expect, it } from 'vitest'
import {
  collectDependencies,
  compileExpression,
  evaluate,
  evaluateExpression,
  ExpressionError,
  lex,
  listWhitelistFunctions,
  parse,
  type EvaluationScope,
} from '../src'

const scope = (form: Record<string, unknown>, extra: Partial<EvaluationScope> = {}): EvaluationScope => ({
  form,
  values: form,
  self: extra.self,
  index: extra.index,
  resolveStatus: extra.resolveStatus,
})

describe('lexer', () => {
  it('splits paths, literals and multi-character operators', () => {
    const tokens = lex("$form.amount >= 10 && $form.type === 'COMPANY'")
    expect(tokens.map((token) => token.type)).toEqual([
      'path',
      'operator',
      'number',
      'operator',
      'path',
      'operator',
      'string',
      'eof',
    ])
    expect(tokens[4]?.value).toBe('$form.type')
  })

  it('tracks line and column for a codeframe', () => {
    const tokens = lex('$form.a\n  && $form.b')
    const secondPath = tokens.find((token) => token.value === '$form.b')
    expect(secondPath?.line).toBe(2)
    expect(secondPath?.column).toBe(6)
  })

  it('rejects unknown characters with a LEX error', () => {
    try {
      lex('$form.a @ 1')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ExpressionError)
      expect((error as ExpressionError).code).toBe('LEX')
    }
  })
})

describe('parser and evaluator', () => {
  it('respects arithmetic precedence', () => {
    expect(evaluateExpression('1 + 2 * 3', scope({}))).toBe(7)
    expect(evaluateExpression('(1 + 2) * 3', scope({}))).toBe(9)
    expect(evaluateExpression('10 % 4', scope({}))).toBe(2)
  })

  it('short-circuits && and ||', () => {
    let statusReads = 0
    const value = evaluateExpression('false && $status.a.visible', {
      form: {},
      resolveStatus: () => {
        statusReads++
        return true
      },
    })
    expect(value).toBe(false)
    expect(statusReads).toBe(0)

    expect(evaluateExpression("'' || 'fallback'", scope({}))).toBe('fallback')
  })

  it('reads dotted paths with flat-key priority', () => {
    expect(
      evaluateExpression('$form.company.taxNo', {
        form: { 'company.taxNo': 'FLAT', company: { taxNo: 'NESTED' } },
      }),
    ).toBe('FLAT')
  })

  it('supports ternaries and unary operators', () => {
    expect(evaluateExpression("$form.amount > 0 ? 'ok' : 'empty'", scope({ amount: 0 }))).toBe('empty')
    expect(evaluateExpression('!$form.enabled', scope({ enabled: false }))).toBe(true)
    expect(evaluateExpression('-$form.amount', scope({ amount: 5 }))).toBe(-5)
  })

  it('runs only whitelisted functions', () => {
    expect(evaluateExpression("upper($form.name)", scope({ name: 'forge' }))).toBe('FORGE')
    expect(evaluateExpression("includes($form.tags, 'vip')", scope({ tags: ['vip'] }))).toBe(true)
    expect(evaluateExpression('len($form.name)', scope({ name: '熔炉' }))).toBe(2)
    expect(listWhitelistFunctions()).toContain('sum')
    expect(listWhitelistFunctions()).not.toContain('eval')
  })

  it('blocks globals and unknown functions at parse time', () => {
    expect(() => parse('window.alert(1)')).toThrowError(ExpressionError)
    expect(() => parse('fetch($form.url)')).toThrowError(/未授权/)
    expect(() => parse('constructor($form.x)')).toThrowError(ExpressionError)
  })

  it('reads $self and $index from the evaluation scope', () => {
    expect(evaluateExpression('$self > 10', scope({}, { self: 12 }))).toBe(true)
    expect(evaluateExpression('$index + 1', scope({}, { index: 2 }))).toBe(3)
  })

  it('validates $status paths', () => {
    expect(() => parse('$status.company.taxNo.visible')).not.toThrow()
    expect(() => parse('$status.company.taxNo')).toThrowError(ExpressionError)
    expect(() => parse('$status.visible')).toThrowError(ExpressionError)
  })

  it('formats syntax errors with a caret', () => {
    try {
      parse('$form.a ===')
      expect.unreachable()
    } catch (error) {
      const formatted = (error as ExpressionError).format()
      expect(formatted).toContain('PARSE')
      expect(formatted).toContain('^')
    }
  })
})

describe('static dependency collection', () => {
  it('extracts only the paths that affect the result', () => {
    const compiled = compileExpression(
      "$form.type === 'COMPANY' && ($form.amount > 0 || $form.vip) ? upper($form.name) : ''",
    )
    expect(compiled.deps).toEqual(['type', 'amount', 'vip', 'name'])
    expect(compiled.dependencies.map((dep) => dep.kind)).toEqual([
      'value',
      'value',
      'value',
      'value',
    ])
  })

  it('distinguishes status dependencies from value dependencies', () => {
    const ast = parse("$status.company.taxNo.visible && $form.amount > 0")
    expect(collectDependencies(ast)).toEqual([
      { kind: 'status', path: 'company.taxNo.visible' },
      { kind: 'value', path: 'amount' },
    ])
  })

  it('omits $self / $index because they have no static path', () => {
    expect(compileExpression('$self !== $index').dependencies).toEqual([])
  })

  it('reuses compiled ASTs from the cache', () => {
    const first = compileExpression("$form.a === 'x'")
    const second = compileExpression("$form.a === 'x'")
    expect(second).toBe(first)
    const uncached = compileExpression("$form.a === 'x'", { cache: false })
    expect(uncached).not.toBe(first)
    expect(uncached.ast).toEqual(first.ast)
  })

  it('evaluates against resolved status without touching the form tree', () => {
    const ast = parse('$status.taxNo.required')
    expect(
      evaluate(ast, {
        form: {},
        resolveStatus: (path) => (path === 'taxNo.required' ? true : undefined),
      }),
    ).toBe(true)
  })
})
