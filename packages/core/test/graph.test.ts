import { describe, expect, it } from 'vitest'
import {
  buildDepGraph,
  CircularDependencyError,
  downstreamClosure,
  edgeCount,
  findCycles,
  formatCycle,
  propagate,
  toposort,
} from '../src'

const diamonds = () =>
  buildDepGraph({
    fields: ['invoice.type', 'amount', 'company.taxNo'],
    effects: [
      { id: 'taxNo.visible', deps: [{ kind: 'value', path: 'invoice.type' }] },
      {
        id: 'taxNo.required',
        deps: [
          { kind: 'value', path: 'invoice.type' },
          { kind: 'status', path: 'taxNo.visible' },
        ],
      },
      {
        id: 'bank.visible',
        deps: [
          { kind: 'status', path: 'taxNo.visible' },
          { kind: 'value', path: 'amount' },
        ],
      },
    ],
  })

describe('toposort', () => {
  it('orders every dependency before its target', () => {
    const graph = diamonds()
    const { order, cyclic } = toposort(graph)
    expect(cyclic).toEqual([])
    expect(order).toHaveLength(graph.nodes.length)
    for (const node of graph.nodes) {
      const position = order.indexOf(node)
      for (const target of graph.adj.get(node) ?? []) {
        expect(order.indexOf(target)).toBeGreaterThan(position)
      }
    }
  })

  it('reports cycle participants and leaves the acyclic part ordered', () => {
    const graph = buildDepGraph({
      fields: ['a', 'b', 'c'],
      effects: [
        { id: 'a.visible', deps: [{ kind: 'status', path: 'b.visible' }] },
        { id: 'b.visible', deps: [{ kind: 'status', path: 'a.visible' }] },
        { id: 'c.visible', deps: [{ kind: 'value', path: 'a' }] },
      ],
    })
    const { order, cyclic } = toposort(graph)
    expect(cyclic).toEqual(expect.arrayContaining(['a.visible', 'b.visible']))
    expect(order).not.toContain('a.visible')
    expect(order).toContain('c.visible')
  })

  it('counts edges and keeps self edges for the cycle reporter', () => {
    const graph = buildDepGraph({
      fields: ['x'],
      effects: [{ id: 'x.visible', deps: [{ kind: 'value', path: 'x.visible' }] }],
    })
    expect(edgeCount(graph)).toBe(1)
    const { cyclic } = toposort(graph)
    expect(cyclic).toEqual(['x.visible'])
  })
})

describe('cycle detection', () => {
  it('returns closed paths with the entry node repeated', () => {
    const graph = buildDepGraph({
      effects: [
        { id: 'a.visible', deps: [{ kind: 'status', path: 'b.visible' }] },
        { id: 'b.visible', deps: [{ kind: 'status', path: 'a.visible' }] },
      ],
    })
    const { cyclic } = toposort(graph)
    const cycles = findCycles(graph, cyclic)
    expect(cycles).toHaveLength(1)
    expect(cycles[0]?.[0]).toBe(cycles[0]?.[cycles[0].length - 1])
    expect(formatCycle(cycles[0]!)).toContain('→')
  })

  it('deduplicates rotations of the same cycle', () => {
    const graph = buildDepGraph({
      effects: [
        { id: 'a.visible', deps: [{ kind: 'status', path: 'b.visible' }] },
        { id: 'b.visible', deps: [{ kind: 'status', path: 'c.visible' }] },
        { id: 'c.visible', deps: [{ kind: 'status', path: 'a.visible' }] },
      ],
    })
    const cycles = findCycles(graph)
    expect(cycles).toHaveLength(1)
    expect(cycles[0]).toHaveLength(4)
  })

  it('does not explore outside the supplied candidate subset', () => {
    const graph = buildDepGraph({
      fields: ['a'],
      effects: [
        { id: 'a.visible', deps: [{ kind: 'value', path: 'a' }] },
        { id: 'b.visible', deps: [{ kind: 'status', path: 'a.visible' }] },
      ],
    })
    expect(findCycles(graph, ['a.visible'])).toEqual([])
  })

  it('exposes a structured error type', () => {
    const error = new CircularDependencyError([['a.visible', 'b.visible', 'a.visible']])
    expect(error.name).toBe('CircularDependencyError')
    expect(error.message).toContain('a.visible → b.visible')
    expect(error.cycles).toHaveLength(1)
  })
})

describe('dirty propagation', () => {
  it('returns only the downstream closure', () => {
    const graph = diamonds()
    expect([...downstreamClosure(graph, 'invoice.type')].sort()).toEqual([
      'bank.visible',
      'invoice.type',
      'taxNo.required',
      'taxNo.visible',
    ])
    expect([...downstreamClosure(graph, 'amount')].sort()).toEqual(['amount', 'bank.visible'])
  })

  it('bumps versions in topological order', () => {
    const graph = diamonds()
    const { order } = toposort(graph)
    const versions = new Map<string, number>()
    const touched = propagate('invoice.type', graph, order, versions)
    expect(touched).toEqual(order.filter((node) => touched.includes(node)))
    expect(touched).not.toContain('amount')
    expect(versions.get('taxNo.visible')).toBe(1)
    expect(touched).toHaveLength(4)
  })
})
