export {
  applyPatch,
  diff,
  createPatch,
  getAtPointer,
  pointerSegments,
  toPointer,
  escapePointer,
  unescapePointer,
  PatchError,
  type JsonPatch,
  type JsonPatchOperation,
} from './operations'
export { PatchHistory, invertPatch, type HistoryOptions, type HistoryEntry } from './history'
