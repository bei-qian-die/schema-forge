import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import type { FieldStatus, Form } from '@schema-forge/core'

export interface LocalFieldScope {
  /** Row subtree path for fields outside the compiled graph, e.g. `items[2]`. */
  path?: string
  /** Value paths read by the local flag expressions. */
  dependencies?: readonly string[]
}

function overlaps(a: string, b: string): boolean {
  return (
    a === b ||
    a.startsWith(`${b}.`) ||
    a.startsWith(`${b}[`) ||
    b.startsWith(`${a}.`) ||
    b.startsWith(`${a}[`)
  )
}

/**
 * A field subscribes to store events and only bumps its local tick when the
 * store says this path was touched. That is what makes re-rendering field
 * level instead of form level.
 */
export function useField(
  form: Form,
  path: Ref<string>,
  localStatus?: () => FieldStatus,
  localScope?: () => LocalFieldScope,
) {
  const tick = ref(0)

  const off = form.subscribe((event) => {
    if (event.type !== 'set' && event.type !== 'validate' && event.type !== 'reset') return
    if (event.type === 'reset') {
      tick.value++
      return
    }
    if (!localStatus) {
      if (event.touched.includes(path.value)) tick.value++
      return
    }

    const scope = localScope?.() ?? {}
    const current = path.value
    const affected = event.touched.some(
      (touched) =>
        overlaps(touched, current) ||
        (scope.path !== undefined && overlaps(touched, scope.path)) ||
        (scope.dependencies ?? []).some((dependency) => overlaps(touched, dependency)),
    )
    if (affected) tick.value++
  })

  onBeforeUnmount(off)

  const status = computed<FieldStatus>(() => {
    tick.value
    return localStatus ? localStatus() : form.getStatus(path.value)
  })

  const errors = computed<string[]>(() => {
    tick.value
    return form.getErrors(path.value)
  })

  const value = computed<unknown>(() => {
    tick.value
    return form.getValue(path.value)
  })

  const version = computed<number>(() => {
    tick.value
    return form.getVersion(path.value)
  })

  return { tick, status, errors, value, version }
}
