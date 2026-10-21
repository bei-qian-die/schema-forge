import { applyPatch, diff, type JsonPatch } from './operations'

export interface HistoryOptions {
  limit?: number
  /** Consecutive edits with the same merge key collapse into one undo step. */
  mergeWindow?: number
  now?: () => number
}

export interface HistoryEntry {
  patch: JsonPatch
  inverse: JsonPatch
  mergeKey?: string
  timestamp: number
}

export interface PushOptions {
  mergeKey?: string
}

/**
 * Patch-based undo / redo. The stack only contains diffs, never schema
 * snapshots — and a patch is exactly what a collaboration layer would send.
 */
export class PatchHistory {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private readonly limit: number
  private readonly mergeWindow: number
  private readonly now: () => number

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 200
    this.mergeWindow = options.mergeWindow ?? 300
    this.now = options.now ?? (() => Date.now())
  }

  push(patch: JsonPatch, inverse: JsonPatch, options: PushOptions = {}): void {
    if (patch.length === 0) return
    const timestamp = this.now()
    const last = this.undoStack[this.undoStack.length - 1]

    if (
      options.mergeKey &&
      last &&
      last.mergeKey === options.mergeKey &&
      timestamp - last.timestamp <= this.mergeWindow
    ) {
      last.patch.push(...patch)
      last.inverse = [...inverse, ...last.inverse]
      last.timestamp = timestamp
    } else {
      this.undoStack.push({
        patch: [...patch],
        inverse: [...inverse],
        mergeKey: options.mergeKey,
        timestamp,
      })
      if (this.undoStack.length > this.limit) this.undoStack.shift()
    }

    this.redoStack = []
  }

  undo(): JsonPatch | null {
    const entry = this.undoStack.pop()
    if (!entry) return null
    this.redoStack.push(entry)
    return entry.inverse
  }

  redo(): JsonPatch | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    this.undoStack.push(entry)
    return entry.patch
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoDepth(): number {
    return this.undoStack.length
  }

  get redoDepth(): number {
    return this.redoStack.length
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}

/** Convenience for tests and time travel: apply a patch and keep both sides. */
export function invertPatch(document: unknown, patch: JsonPatch): JsonPatch {
  const next = applyPatch(document, patch)
  return diff(next, document)
}
