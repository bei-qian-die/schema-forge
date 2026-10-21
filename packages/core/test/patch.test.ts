import { describe, expect, it } from 'vitest'
import {
  applyPatch,
  diff,
  escapePointer,
  getAtPointer,
  invertPatch,
  PatchError,
  PatchHistory,
  toPointer,
  unescapePointer,
  type JsonPatch,
} from '../src'

interface Doc {
  title: string
  fields: { key: string; label: string; props?: Record<string, unknown> }[]
  meta: { revision: number; tags: string[] }
}

const doc = (): Doc => ({
  title: 'invoice',
  fields: [
    { key: 'a', label: 'A', props: { required: false } },
    { key: 'b', label: 'B' },
  ],
  meta: { revision: 1, tags: ['draft'] },
})

describe('RFC 6902 operations', () => {
  it('adds, replaces, copies, moves and removes immutably', () => {
    const before = doc()
    const patch: JsonPatch = [
      { op: 'add', path: '/fields/2', value: { key: 'c', label: 'C' } },
      { op: 'replace', path: '/fields/0/label', value: 'Alpha' },
      { op: 'copy', from: '/fields/1', path: '/fields/3' },
      { op: 'move', from: '/fields/0', path: '/fields/3' },
      { op: 'test', path: '/meta/revision', value: 1 },
    ]
    const after = applyPatch(before, patch)

    expect(before).toEqual(doc())
    expect(after.fields.map((field) => field.key)).toEqual(['b', 'c', 'b', 'a'])
    expect(after.fields[3]?.label).toBe('Alpha')
    expect(after.meta.tags).toEqual(['draft'])
    expect(after.fields[2]).not.toBe(before.fields[1])

    const removed = applyPatch(after, [{ op: 'remove', path: '/fields/1' }])
    expect(removed.fields.map((field) => field.key)).toEqual(['b', 'b', 'a'])
  })

  it('escapes JSON pointer segments', () => {
    expect(escapePointer('a/b~c')).toBe('a~1b~0c')
    expect(unescapePointer('a~1b~0c')).toBe('a/b~c')
    expect(toPointer(['fields', 0, 'a/b'])).toBe('/fields/0/a~1b')
    expect(getAtPointer(doc(), '/fields/1/label')).toBe('B')
  })

  it('rejects invalid patches without mutating the input', () => {
    const before = doc()
    expect(() => applyPatch(before, [{ op: 'remove', path: '/fields/9' }])).toThrowError(PatchError)
    expect(() => applyPatch(before, [{ op: 'test', path: '/title', value: 'nope' }])).toThrowError(
      /test 失败/,
    )
    expect(before).toEqual(doc())
  })

  it('rejects prototype-polluting paths', () => {
    expect(() =>
      applyPatch(doc(), [{ op: 'add', path: '/__proto__/polluted', value: true }]),
    ).toThrowError(PatchError)
  })
})

describe('diff', () => {
  it('round-trips a nested edit', () => {
    const before = doc()
    const after = structuredClone(before)
    after.fields[0]!.props = { required: true }
    after.fields.push({ key: 'c', label: 'C' })
    after.meta.tags = []

    const patch = diff(before, after)
    expect(applyPatch(before, patch)).toEqual(after)
  })

  it('produces no patch for equal documents', () => {
    expect(diff(doc(), doc())).toEqual([])
  })

  it('inverts a patch from the post-edit document', () => {
    const before = doc()
    const patch: JsonPatch = [{ op: 'replace', path: '/meta/revision', value: 2 }]
    const after = applyPatch(before, patch)
    const inverse = invertPatch(before, patch)
    expect(applyPatch(after, inverse)).toEqual(before)
  })
})

describe('PatchHistory', () => {
  it('undoes and redoes edits', () => {
    const history = new PatchHistory()
    const before = doc()
    const patch: JsonPatch = [{ op: 'replace', path: '/meta/revision', value: 2 }]
    const after = applyPatch(before, patch)
    history.push(patch, invertPatch(before, patch))

    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)

    const undo = history.undo()!
    expect(applyPatch(after, undo)).toEqual(before)
    expect(history.canRedo).toBe(true)

    const redo = history.redo()!
    expect(applyPatch(before, redo)).toEqual(after)
  })

  it('merges same-key edits inside the window', () => {
    let clock = 0
    const history = new PatchHistory({ mergeWindow: 300, now: () => clock })
    const first: JsonPatch = [{ op: 'replace', path: '/title', value: 'a' }]
    const second: JsonPatch = [{ op: 'replace', path: '/title', value: 'ab' }]
    const middle = applyPatch(doc(), first)
    const final = applyPatch(middle, second)

    history.push(first, invertPatch(doc(), first), { mergeKey: 'title' })
    clock = 200
    history.push(second, invertPatch(middle, second), { mergeKey: 'title' })

    expect(history.undoDepth).toBe(1)
    const undo = history.undo()!
    expect(applyPatch(final, undo)).toEqual(doc())
  })

  it('starts a new entry outside the merge window', () => {
    let clock = 0
    const history = new PatchHistory({ mergeWindow: 100, now: () => clock })
    const patch: JsonPatch = [{ op: 'replace', path: '/title', value: 'x' }]
    history.push(patch, invertPatch(doc(), patch), { mergeKey: 'title' })
    clock = 500
    history.push(patch, invertPatch(doc(), patch), { mergeKey: 'title' })
    expect(history.undoDepth).toBe(2)
  })

  it('clears redo on a new edit and respects the limit', () => {
    const history = new PatchHistory({ limit: 2 })
    const patch = (value: number): JsonPatch => [
      { op: 'replace', path: '/meta/revision', value },
    ]
    for (let value = 2; value <= 4; value++) {
      const before = doc()
      history.push(patch(value), invertPatch(before, patch(value)))
    }
    expect(history.undoDepth).toBe(2)
    history.undo()
    expect(history.canRedo).toBe(true)
    history.push(patch(9), [{ op: 'replace', path: '/meta/revision', value: 3 }])
    expect(history.canRedo).toBe(false)
  })
})
