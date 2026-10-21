import type { DepGraph } from './dep-graph'

export interface TopoResult {
  order: string[]
  /** Nodes that never reached in-degree zero — the cycle participants. */
  cyclic: string[]
}

/**
 * Kahn's algorithm. Deterministic with respect to node insertion order, which
 * keeps compile snapshots stable in tests and in the designer DAG.
 */
export function toposort(graph: DepGraph): TopoResult {
  const indegree = new Map<string, number>()
  for (const node of graph.nodes) indegree.set(node, 0)
  for (const targets of graph.adj.values()) {
    for (const target of targets) {
      indegree.set(target, (indegree.get(target) ?? 0) + 1)
    }
  }

  const queue: string[] = graph.nodes.filter((node) => (indegree.get(node) ?? 0) === 0)
  const order: string[] = []

  for (let i = 0; i < queue.length; i++) {
    const node = queue[i] as string
    order.push(node)
    for (const target of graph.adj.get(node) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) queue.push(target)
    }
  }

  const visited = new Set(order)
  const cyclic = graph.nodes.filter((node) => !visited.has(node))
  return { order, cyclic }
}
