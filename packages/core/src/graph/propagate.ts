import type { DepGraph } from './dep-graph'

/**
 * Precision primitive: downstream closure of a changed node, including itself.
 * Backed by the forward adjacency list, never a full graph scan.
 */
export function downstreamClosure(graph: DepGraph, start: string): Set<string> {
  const down = new Set<string>([start])
  const stack: string[] = [start]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const target of graph.adj.get(current) ?? []) {
      if (!down.has(target)) {
        down.add(target)
        stack.push(target)
      }
    }
  }
  return down
}

/**
 * Plan-compatible helper: bump version only for nodes inside the changed
 * node's downstream closure, walking in topological order.
 */
export function propagate(
  path: string,
  graph: DepGraph,
  order: string[],
  version: Map<string, number>,
): string[] {
  const down = downstreamClosure(graph, path)
  const touched: string[] = []
  for (const node of order) {
    if (!down.has(node)) continue
    version.set(node, (version.get(node) ?? 0) + 1)
    touched.push(node)
  }
  return touched
}
