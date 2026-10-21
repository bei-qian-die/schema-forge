import type { Dependency } from '../expression/deps'

export type NodeKind = 'value' | 'effect' | 'external'

export interface DepGraph {
  nodes: string[]
  /** dep -> targets ("who do I affect") */
  adj: Map<string, Set<string>>
  /** target -> deps ("who affects me") */
  rev: Map<string, Set<string>>
  kinds: Map<string, NodeKind>
}

export interface EffectEdgeSpec {
  id: string
  deps: Dependency[]
}

export function createDepGraph(): DepGraph {
  return {
    nodes: [],
    adj: new Map(),
    rev: new Map(),
    kinds: new Map(),
  }
}

export function addNode(graph: DepGraph, id: string, kind: NodeKind = 'external'): void {
  if (!graph.adj.has(id)) {
    graph.nodes.push(id)
    graph.adj.set(id, new Set())
    graph.rev.set(id, new Set())
    graph.kinds.set(id, kind)
  } else if (kind !== 'external') {
    const current = graph.kinds.get(id)
    if (current === 'external' || kind === 'effect') graph.kinds.set(id, kind)
  }
}

export function addEdge(graph: DepGraph, from: string, to: string): void {
  if (from === to) {
    // A self-dependency is a real cycle; keep it so the cycle reporter sees it.
  }
  addNode(graph, from)
  addNode(graph, to)
  graph.adj.get(from)!.add(to)
  graph.rev.get(to)!.add(from)
}

export function buildDepGraph(spec: {
  fields?: string[]
  effects?: EffectEdgeSpec[]
}): DepGraph {
  const graph = createDepGraph()
  for (const field of spec.fields ?? []) addNode(graph, field, 'value')
  for (const effect of spec.effects ?? []) {
    addNode(graph, effect.id, 'effect')
    for (const dep of effect.deps) {
      if (dep.path === effect.id) {
        addNode(graph, dep.path, dep.kind === 'status' ? 'effect' : 'value')
      }
      addEdge(graph, dep.path, effect.id)
    }
  }
  return graph
}

export function edgeCount(graph: DepGraph): number {
  let total = 0
  for (const targets of graph.adj.values()) total += targets.size
  return total
}
