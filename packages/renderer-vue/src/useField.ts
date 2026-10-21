import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import type { FieldStatus, Form } from '@schema-forge/core'

/**
 * A field subscribes to store events and only bumps its local tick when the
 * store says this path was touched. That is what makes re-rendering field
 * level instead of form level.
 */
export function useField(
  form: Form,
  path: Ref<string>,
  localStatus?: () => FieldStatus,
) {
  const tick = ref(0)

  const off = form.subscribe((event) => {
    if (event.type !== 'set' && event.type !== 'validate' && event.type !== 'reset') return
    if (localStatus) {
      tick.value++
      return
    }
    if (event.touched.includes(path.value)) tick.value++
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
