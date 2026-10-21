import type { DepGraph } from './dep-graph'

const WHITE = 0
const GRAY = 1
const BLACK = 2

function canonicalCycle(cycle: string[]): string {
  const open = cycle.slice(0, -1)
  if (open.length === 0) return ''
  let bestIndex = 0
  for (let i = 1; i < open.length; i++) {
    if ((open[i] as string) < (open[bestIndex] as string)) bestIndex = i
  }
  const rotated = [...open.slice(bestIndex), ...open.slice(0, bestIndex), open[bestIndex] as string]
  return rotated.join('\u0000')
}

/**
 * DFS three-color cycle detection. Returns closed paths so the designer can
 * print `a -> b -> a` instead of silently evaluating in the wrong order.
 */
export function findCycles(graph: DepGraph, subset?: Iterable<string>): string[][] {
  const candidates = new Set(subset ?? graph.nodes)
  if (candidates.size === 0) return []

  const color = new Map<string, number>()
  const stack: string[] = []
  const found = new Map<string, string[]>()

  const visit = (node: string) => {
    color.set(node, GRAY)
    stack.push(node)

    for (const target of graph.adj.get(node) ?? []) {
      if (!candidates.has(target)) continue
      const targetColor = color.get(target) ?? WHITE
      if (targetColor === GRAY) {
        const start = stack.lastIndexOf(target)
        if (start !== -1) {
          const cycle = [...stack.slice(start), target]
          const key = canonicalCycle(cycle)
          if (key && !found.has(key)) found.set(key, cycle)
        }
      } else if (targetColor === WHITE) {
        visit(target)
      }
    }

    stack.pop()
    color.set(node, BLACK)
  }

  for (const node of graph.nodes) {
    if (!candidates.has(node)) continue
    if ((color.get(node) ?? WHITE) === WHITE) visit(node)
  }

  return [...found.values()]
}

export function formatCycle(cycle: string[]): string {
  return cycle.join(' → ')
}

export class CircularDependencyError extends Error {
  readonly cycles: string[][]

  constructor(cycles: string[][]) {
    const paths = cycles.map(formatCycle).join(' | ')
    super(`CircularDependency: ${paths}`)
    this.name = 'CircularDependencyError'
    this.cycles = cycles
  }
}
