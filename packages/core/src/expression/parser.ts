import {
  BINARY_PRECEDENCE,
  type BinaryNode,
  type ExprNode,
  type PathNode,
  type PathScope,
} from './ast'
import { ExpressionError } from './errors'
import { isWhitelistedFunction } from './functions'
import { lex, type Token } from './lexer'

const STATUS_PROPS = new Set(['visible', 'disabled', 'required'])

function classifyPath(raw: string, source: string, token: Token): PathNode {
  const dot = raw.indexOf('.')
  const root = dot === -1 ? raw : raw.slice(0, dot)
  const path = dot === -1 ? '' : raw.slice(dot + 1)

  const position = { index: token.start, line: token.line, column: token.column }

  if (root === '$self') {
    if (path) throw new ExpressionError('$self 不接收子路径', source, position, 'PARSE')
    return { type: 'Path', scope: 'self', path: '', raw, start: token.start, end: token.end }
  }
  if (root === '$index') {
    if (path) throw new ExpressionError('$index 不接收子路径', source, position, 'PARSE')
    return { type: 'Path', scope: 'index', path: '', raw, start: token.start, end: token.end }
  }
  if (root === '$form' || root === '$values' || root === '$root') {
    return {
      type: 'Path',
      scope: 'value',
      path,
      raw,
      start: token.start,
      end: token.end,
    }
  }
  if (root === '$status') {
    const lastDot = path.lastIndexOf('.')
    const prop = lastDot === -1 ? '' : path.slice(lastDot + 1)
    if (!path || !lastDot || !STATUS_PROPS.has(prop)) {
      throw new ExpressionError(
        '$status 路径必须是 $status.<field>.visible|disabled|required',
        source,
        position,
        'PARSE',
      )
    }
    const scope: PathScope = 'status'
    return { type: 'Path', scope, path, raw, start: token.start, end: token.end }
  }
  throw new ExpressionError(
    `未知作用域 "${root}"（允许 $form / $values / $self / $index / $status）`,
    source,
    position,
    'PARSE',
  )
}

export function parse(source: string): ExprNode {
  const tokens = lex(source)
  let cursor = 0

  const peek = (): Token => tokens[cursor] as Token
  const next = (): Token => {
    const token = peek()
    if (token.type !== 'eof') cursor++
    return token
  }
  const isOperator = (value: string): boolean => {
    const token = peek()
    return token.type === 'operator' && token.value === value
  }
  const fail = (message: string, token: Token = peek()): never => {
    throw new ExpressionError(
      message,
      source,
      { index: token.start, line: token.line, column: token.column },
      'PARSE',
    )
  }
  const expect = (value: string): Token => {
    if (!isOperator(value)) fail(`预期 "${value}"，实际是 "${peek().raw || '表达式结束'}"`)
    return next()
  }

  let parseExpression: () => ExprNode

  const parsePrimary = (): ExprNode => {
    const token = peek()

    if (token.type === 'number' || token.type === 'string' || token.type === 'boolean' || token.type === 'null') {
      next()
      return {
        type: 'Literal',
        value: token.value,
        start: token.start,
        end: token.end,
      }
    }

    if (token.type === 'path') {
      next()
      return classifyPath(String(token.value), source, token)
    }

    if (token.type === 'identifier') {
      next()
      const name = String(token.value)
      if (!isOperator('(')) {
        fail(`标识符 "${name}" 不是合法表达式；函数必须调用，例如 len($self)`)
      }
      if (!isWhitelistedFunction(name)) {
        throw new ExpressionError(
          `未授权的函数 "${name}"`,
          source,
          { index: token.start, line: token.line, column: token.column },
          'SANDBOX',
        )
      }
      next()
      const args: ExprNode[] = []
      if (!isOperator(')')) {
        args.push(parseExpression())
        while (isOperator(',')) {
          next()
          args.push(parseExpression())
        }
      }
      expect(')')
      return { type: 'Call', callee: name, args, start: token.start, end: tokens[cursor - 1]!.end }
    }

    if (isOperator('(')) {
      next()
      const expression = parseExpression()
      expect(')')
      return expression
    }

    return fail(`无法解析的 token "${token.raw || 'EOF'}"`, token)
  }

  const parseUnary = (): ExprNode => {
    const token = peek()
    if (token.type === 'operator' && (token.value === '!' || token.value === '-' || token.value === '+')) {
      next()
      const argument = parseUnary()
      return {
        type: 'Unary',
        op: token.value as '!' | '-' | '+',
        argument,
        start: token.start,
        end: argument.end,
      }
    }
    return parsePrimary()
  }

  const parseBinary = (minPrecedence: number): ExprNode => {
    let left = parseUnary()
    while (true) {
      const token = peek()
      if (token.type !== 'operator') break
      const precedence = BINARY_PRECEDENCE[token.value as keyof typeof BINARY_PRECEDENCE]
      if (precedence == null || precedence < minPrecedence) break
      next()
      const right = parseBinary(precedence + 1)
      left = {
        type: 'Binary',
        op: token.value as BinaryNode['op'],
        left,
        right,
        start: left.start,
        end: right.end,
      }
    }
    return left
  }

  const parseConditional = (): ExprNode => {
    const test = parseBinary(1)
    if (!isOperator('?')) return test
    const question = next()
    const consequent = parseConditional()
    expect(':')
    const alternate = parseConditional()
    return {
      type: 'Conditional',
      test,
      consequent,
      alternate,
      start: test.start,
      end: alternate.end,
    }
  }

  parseExpression = parseConditional

  if (peek().type === 'eof') fail('表达式为空')
  const ast = parseConditional()
  if (peek().type !== 'eof') {
    fail(`表达式末尾存在多余内容 "${peek().raw}"`)
  }
  return ast
}
