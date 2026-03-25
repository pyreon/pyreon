import type { Computed, Signal } from "@pyreon/reactivity"
import { computed } from "@pyreon/reactivity"
import type { FormState } from "./types"

/**
 * Watch specific field values reactively. Returns a computed signal
 * that re-evaluates when any of the watched fields change.
 *
 * @example
 * // Watch a single field
 * const email = useWatch(form, 'email')
 * // email() => current email value
 *
 * @example
 * // Watch multiple fields
 * const [first, last] = useWatch(form, ['firstName', 'lastName'])
 * // first() => firstName value, last() => lastName value
 *
 * @example
 * // Watch all fields
 * const all = useWatch(form)
 * // all() => { email: '...', password: '...' }
 */
export function useWatch<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
  form: FormState<TValues>,
  name: K,
): Signal<TValues[K]>

export function useWatch<
  TValues extends Record<string, unknown>,
  K extends (keyof TValues & string)[],
>(form: FormState<TValues>, names: K): { [I in keyof K]: Signal<TValues[K[I] & keyof TValues]> }

export function useWatch<TValues extends Record<string, unknown>>(
  form: FormState<TValues>,
): Computed<TValues>

export function useWatch<TValues extends Record<string, unknown>, K extends keyof TValues & string>(
  form: FormState<TValues>,
  nameOrNames?: K | K[],
): Signal<TValues[K]> | Signal<TValues[K]>[] | Computed<TValues> {
  // Watch all fields
  if (nameOrNames === undefined) {
    return computed(() => {
      const result = {} as TValues
      for (const key of Object.keys(form.fields) as (keyof TValues & string)[]) {
        ;(result as Record<string, unknown>)[key] = form.fields[key].value()
      }
      return result
    })
  }

  // Watch multiple fields
  if (Array.isArray(nameOrNames)) {
    return nameOrNames.map((name) => form.fields[name].value) as Signal<TValues[K]>[]
  }

  // Watch single field
  return form.fields[nameOrNames].value
}
