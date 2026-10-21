export type SourcePosition = {
  index: number
  line: number
  column: number
}

export type PathScope = 'value' | 'self' | 'index' | 'status'

export interface LiteralNode {
  type: 'Literal'
  value: string | number | boolean | null
  start: number
  end: number
}

export interface PathNode {
  type: 'Path'
  scope: PathScope
  /** `$form.` / `$status.` prefix removed. */
  path: string
  raw: string
  start: number
  end: number
}

export interface UnaryNode {
  type: 'Unary'
  op: '!' | '-' | '+'
  argument: ExprNode
  start: number
  end: number
}

export interface BinaryNode {
  type: 'Binary'
  op:
    | '==='
    | '!=='
    | '=='
    | '!='
    | '>'
    | '>='
    | '<'
    | '<='
    | '&&'
    | '||'
    | '+'
    | '-'
    | '*'
    | '/'
    | '%'
  left: ExprNode
  right: ExprNode
  start: number
  end: number
}

export interface ConditionalNode {
  type: 'Conditional'
  test: ExprNode
  consequent: ExprNode
  alternate: ExprNode
  start: number
  end: number
}

export interface CallNode {
  type: 'Call'
  callee: string
  args: ExprNode[]
  start: number
  end: number
}

export type ExprNode =
  | LiteralNode
  | PathNode
  | UnaryNode
  | BinaryNode
  | ConditionalNode
  | CallNode

export const BINARY_PRECEDENCE: Record<BinaryNode['op'], number> = {
  '||': 1,
  '&&': 2,
  '===': 3,
  '!==': 3,
  '==': 3,
  '!=': 3,
  '>': 4,
  '>=': 4,
  '<': 4,
  '<=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
}
