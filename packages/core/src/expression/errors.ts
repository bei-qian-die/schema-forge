import type { SourcePosition } from './ast'

export type ExpressionErrorCode = 'LEX' | 'PARSE' | 'EVAL' | 'SANDBOX'

export class ExpressionError extends Error {
  readonly code: ExpressionErrorCode
  readonly source: string
  readonly index: number
  readonly line: number
  readonly column: number

  constructor(
    message: string,
    source: string,
    position: SourcePosition,
    code: ExpressionErrorCode = 'PARSE',
  ) {
    super(message)
    this.name = 'ExpressionError'
    this.code = code
    this.source = source
    this.index = position.index
    this.line = position.line
    this.column = position.column
  }

  /** Line / column plus a caret, in the spirit of a compiler diagnostic. */
  format(): string {
    const head = `${this.name}[${this.code}] ${this.message} (${this.line}:${this.column})`
    const line = this.source.split(/\r?\n/)[this.line - 1] ?? ''
    const caret = `${' '.repeat(Math.max(0, this.column - 1))}^`
    return `${head}\n  ${this.line} | ${line}\n    | ${caret}`
  }
}

export function positionAt(source: string, index: number): SourcePosition {
  let line = 1
  let column = 1
  const limit = Math.min(index, source.length)
  for (let i = 0; i < limit; i++) {
    if (source[i] === '\n') {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { index, line, column }
}
