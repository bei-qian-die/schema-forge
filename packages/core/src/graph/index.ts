export {
  createDepGraph,
  addNode,
  addEdge,
  buildDepGraph,
  edgeCount,
  type DepGraph,
  type NodeKind,
  type EffectEdgeSpec,
} from './dep-graph'
export { toposort, type TopoResult } from './toposort'
export { findCycles, formatCycle, CircularDependencyError } from './cycle'
export { downstreamClosure, propagate } from './propagate'
