import { ExpressionError, positionAt } from './errors'

export type TokenType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'null'
  | 'path'
  | 'identifier'
  | 'operator'
  | 'eof'

export interface Token {
  type: TokenType
  value: string | number | boolean | null
  raw: string
  start: number
  end: number
  line: number
  column: number
}

const OPERATORS = [
  '===',
  '!==',
  '==',
  '!=',
  '>=',
  '<=',
  '&&',
  '||',
  '>',
  '<',
  '!',
  '?',
  ':',
  '(',
  ')',
  '+',
  '-',
  '*',
  '/',
  '%',
  ',',
] as const

const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[\w$]/

function isDigit(char: string | undefined): boolean {
  return char != null && char >= '0' && char <= '9'
}

/**
 * Hand-written lexer. Tracks line / column on every token so errors can
 * point at the exact character instead of a bare SyntaxError.
 */
export function lex(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  let line = 1
  let column = 1

  const advance = (count = 1) => {
    for (let i = 0; i < count; i++) {
      if (source[index] === '\n') {
        line++
        column = 1
      } else {
        column++
      }
      index++
    }
  }

  const push = (
    type: TokenType,
    value: Token['value'],
    start: number,
    startLine: number,
    startColumn: number,
    raw: string,
  ) => {
    tokens.push({
      type,
      value,
      raw,
      start,
      end: index,
      line: startLine,
      column: startColumn,
    })
  }

  const fail = (message: string): never => {
    throw new ExpressionError(message, source, positionAt(source, index), 'LEX')
  }

  while (index < source.length) {
    const char = source[index] as string

    if (/\s/.test(char)) {
      advance()
      continue
    }

    const start = index
    const startLine = line
    const startColumn = column

    if (char === "'" || char === '"') {
      const quote = char
      advance()
      let value = ''
      let closed = false
      while (index < source.length) {
        const current = source[index] as string
        if (current === '\\') {
          const next = source[index + 1]
          if (next == null) fail('字符串转义未完成')
          const escapes: Record<string, string> = {
            n: '\n',
            r: '\r',
            t: '\t',
            '\\': '\\',
            "'": "'",
            '"': '"',
          }
          value += escapes[next as string] ?? next
          advance(2)
          continue
        }
        if (current === quote) {
          advance()
          closed = true
          break
        }
        if (current === '\n') fail('字符串不能跨行')
        value += current
        advance()
      }
      if (!closed) fail('字符串缺少结束引号')
      push('string', value, start, startLine, startColumn, source.slice(start, index))
      continue
    }

    if (isDigit(char)) {
      while (isDigit(source[index])) advance()
      if (source[index] === '.' && isDigit(source[index + 1])) {
        advance()
        while (isDigit(source[index])) advance()
      }
      const raw = source.slice(start, index)
      push('number', Number(raw), start, startLine, startColumn, raw)
      continue
    }

    if (char === '$') {
      advance()
      if (!IDENT_START.test(source[index] ?? '')) fail('路径必须以作用域名开头，例如 $form.amount')

      while (index < source.length) {
        const current = source[index] as string
        if (IDENT_PART.test(current)) {
          advance()
          continue
        }
        if (current === '.') {
          const next = source[index + 1]
          if (next != null && IDENT_START.test(next)) {
            advance()
            continue
          }
          break
        }
        if (current === '[') {
          let cursor = index
          let quote: string | null = null
          while (cursor < source.length) {
            const c = source[cursor] as string
            if (quote) {
              if (c === '\\') cursor++
              else if (c === quote) quote = null
            } else if (c === "'" || c === '"') {
              quote = c
            } else if (c === ']') {
              break
            }
            cursor++
          }
          if (source[cursor] !== ']') fail('路径下标缺少 ]')
          advance(cursor - index + 1)
          continue
        }
        break
      }

      const raw = source.slice(start, index)
      push('path', raw, start, startLine, startColumn, raw)
      continue
    }

    if (IDENT_START.test(char) && char !== '$') {
      advance()
      while (IDENT_PART.test(source[index] ?? '')) advance()
      const raw = source.slice(start, index)
      if (raw === 'true' || raw === 'false') {
        push('boolean', raw === 'true', start, startLine, startColumn, raw)
      } else if (raw === 'null') {
        push('null', null, start, startLine, startColumn, raw)
      } else {
        push('identifier', raw, start, startLine, startColumn, raw)
      }
      continue
    }

    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, index))
    if (operator) {
      advance(operator.length)
      push('operator', operator, start, startLine, startColumn, operator)
      continue
    }

    fail(`无法识别的字符 "${char}"`)
  }

  tokens.push({
    type: 'eof',
    value: '',
    raw: '',
    start: index,
    end: index,
    line,
    column,
  })
  return tokens
}
