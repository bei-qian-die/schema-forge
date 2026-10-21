import type { ExprNode } from './ast'

export interface Dependency {
  kind: 'value' | 'status'
  /** For status deps this is the full effect node id, e.g. `taxNo.visible`. */
  path: string
}

export function walkAst(node: ExprNode, visit: (node: ExprNode) => void): void {
  visit(node)
  switch (node.type) {
    case 'Unary':
      walkAst(node.argument, visit)
      break
    case 'Binary':
      walkAst(node.left, visit)
      walkAst(node.right, visit)
      break
    case 'Conditional':
      walkAst(node.test, visit)
      walkAst(node.consequent, visit)
      walkAst(node.alternate, visit)
      break
    case 'Call':
      node.args.forEach((arg) => walkAst(arg, visit))
      break
    default:
      break
  }
}

/**
 * Static dependency collection — the thing `new Function` can only guess at
 * with regular expressions. Path nodes are taken straight from the AST.
 */
export function collectDependencies(ast: ExprNode): Dependency[] {
  const seen = new Set<string>()
  const deps: Dependency[] = []

  walkAst(ast, (node) => {
    if (node.type !== 'Path') return
    if (node.scope === 'self' || node.scope === 'index') return
    if (!node.path) return
    const kind = node.scope === 'status' ? 'status' : 'value'
    const id = `${kind}:${node.path}`
    if (seen.has(id)) return
    seen.add(id)
    deps.push({ kind, path: node.path })
  })

  return deps
}

export function collectDeps(ast: ExprNode): string[] {
  return collectDependencies(ast).map((dep) => dep.path)
}
