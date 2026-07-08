import type { Computed, Signal } from '@pyreon/reactivity'
import { computed, signal } from '@pyreon/reactivity'
import type { FormState } from './types'

export interface FieldArrayItem<T> {
  /** Stable key for keyed rendering. */
  key: number
  /** Reactive value for this item. */
  value: Signal<T>
}

/** One item of a FORM-BOUND field array (`useFieldArray(form, name)`). */
export interface FormFieldArrayItem {
  /** Stable key for keyed `<For>` rendering — survives reorder/remove. */
  key: number
  /** Field-name base for this item, `${arrayName}.${index}`. Bind sub-fields
   *  with `form.register(`${item.name}.qty`)`; for a scalar-item array bind
   *  `form.register(item.name)`. */
  name: string
}

/** Result of the FORM-BOUND `useFieldArray(form, name)`. */
export interface UseFormFieldArrayResult<T> {
  /** Reactive item list (stable keys + field-name base). */
  items: Signal<FormFieldArrayItem[]>
  /** Number of items. */
  length: Computed<number>
  /** Append an item to the end (preserves existing items' state). */
  append: (value: T) => void
  /** Prepend an item to the start. */
  prepend: (value: T) => void
  /** Insert an item at `index`. */
  insert: (index: number, value: T) => void
  /** Remove the item at `index`. */
  remove: (index: number) => void
  /** Move an item. */
  move: (from: number, to: number) => void
  /** Swap two items. */
  swap: (a: number, b: number) => void
  /** Replace the whole array. */
  replace: (values: T[]) => void
  /** Current values (assembled from the form). */
  values: () => T[]
}

export interface UseFieldArrayResult<T> {
  /** Reactive list of items with stable keys. */
  items: Signal<FieldArrayItem<T>[]>
  /** Number of items. */
  length: Computed<number>
  /** Append a new item to the end. */
  append: (value: T) => void
  /** Prepend a new item to the start. */
  prepend: (value: T) => void
  /** Insert an item at the given index. */
  insert: (index: number, value: T) => void
  /** Remove the item at the given index. */
  remove: (index: number) => void
  /** Update the value of an item at the given index. */
  update: (index: number, value: T) => void
  /** Move an item from one index to another. */
  move: (from: number, to: number) => void
  /** Swap two items by index. */
  swap: (indexA: number, indexB: number) => void
  /** Replace all items. */
  replace: (values: T[]) => void
  /** Get all current values as a plain array. */
  values: () => T[]
}

function useStandaloneFieldArray<T>(initial: T[] = []): UseFieldArrayResult<T> {
  let nextKey = 0
  const makeItem = (value: T): FieldArrayItem<T> => ({
    key: nextKey++,
    value: signal(value),
  })

  const items = signal<FieldArrayItem<T>[]>(initial.map(makeItem))
  const length = computed(() => items().length)

  return {
    items,
    length,

    append(value: T) {
      items.update((arr) => [...arr, makeItem(value)])
    },

    prepend(value: T) {
      items.update((arr) => [makeItem(value), ...arr])
    },

    insert(index: number, value: T) {
      items.update((arr) => {
        const next = [...arr]
        next.splice(index, 0, makeItem(value))
        return next
      })
    },

    remove(index: number) {
      items.update((arr) => arr.filter((_, i) => i !== index))
    },

    update(index: number, value: T) {
      const current = items.peek()
      const item = current[index]
      if (item) {
        item.value.set(value)
      }
    },

    move(from: number, to: number) {
      items.update((arr) => {
        const next = [...arr]
        const [item] = next.splice(from, 1)
        if (item) next.splice(to, 0, item)
        return next
      })
    },

    swap(indexA: number, indexB: number) {
      items.update((arr) => {
        const next = [...arr]
        const a = next[indexA]
        const b = next[indexB]
        if (a && b) {
          next[indexA] = b
          next[indexB] = a
        }
        return next
      })
    },

    replace(values: T[]) {
      items.set(values.map(makeItem))
    },

    values() {
      return items.peek().map((item) => item.value.peek())
    },
  }
}

// ── Form-bound field array ──────────────────────────────────────────────────

type FormLike = FormState<Record<string, unknown>>

function shapeOf(v: unknown): string[] | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v as Record<string, unknown>)
    : null
}

/**
 * A FORM-BOUND field array: items live IN the form as registered fields keyed
 * `${name}.${index}[.${sub}]` (built on `registerField` + the nested-path
 * `values()` assembly), so item values reach `values()`/`onSubmit` and per-item
 * validators participate in `isValid` — unlike the standalone `useFieldArray`.
 * Supports homogeneous scalar OR object items (shape inferred from the first
 * item). `items()` gives `{ key, name }` for keyed `<For>` + `register` binding.
 *
 * v1 note: structural ops other than `append` re-index the trailing items
 * (their field NAMES change), which resets their touched/error state; values
 * are preserved.
 */
function useFormFieldArray<T>(form: FormLike, name: string): UseFormFieldArrayResult<T> {
  let nextKey = 0
  let itemKeys: string[] | null = null // null = scalar items; else object sub-keys

  const fieldName = (i: number, sub?: string): string =>
    sub != null ? `${name}.${i}.${sub}` : `${name}.${i}`

  const registerItem = (i: number, value: T): void => {
    if (itemKeys) {
      for (const k of itemKeys) {
        form.registerField(fieldName(i, k), (value as Record<string, unknown>)[k])
      }
    } else {
      form.registerField(fieldName(i), value)
    }
  }
  const unregisterItem = (i: number): void => {
    if (itemKeys) for (const k of itemKeys) form.unregisterField(fieldName(i, k))
    else form.unregisterField(fieldName(i))
  }

  const readValues = (): T[] =>
    ((form.getValues() as Record<string, unknown>)[name] as T[] | undefined) ?? []

  // Seed from the form's current value for `name`.
  const seed = readValues()
  if (seed.length > 0) itemKeys = shapeOf(seed[0])
  let keys: number[] = seed.map(() => nextKey++)
  seed.forEach((v, i) => registerItem(i, v))

  const makeItems = (): FormFieldArrayItem[] => keys.map((key, i) => ({ key, name: fieldName(i) }))
  const itemsSig = signal<FormFieldArrayItem[]>(makeItems())
  const length = computed(() => itemsSig().length)

  // Re-register the whole array from an ordered value + key list (the general
  // path for reorder/remove/insert, where trailing field NAMES shift).
  const rebuild = (values: T[], newKeys: number[]): void => {
    if (itemKeys === null && values.length > 0) itemKeys = shapeOf(values[0])
    const oldLen = keys.length
    for (let i = 0; i < oldLen; i++) unregisterItem(i)
    keys = newKeys
    for (let i = 0; i < values.length; i++) registerItem(i, values[i]!)
    itemsSig.set(makeItems())
  }

  return {
    items: itemsSig,
    length,
    append(value: T) {
      // Fast path: no re-index — register at the end, existing items untouched.
      if (itemKeys === null && keys.length === 0) itemKeys = shapeOf(value)
      registerItem(keys.length, value)
      keys = [...keys, nextKey++]
      itemsSig.set(makeItems())
    },
    prepend(value: T) {
      rebuild([value, ...readValues()], [nextKey++, ...keys])
    },
    insert(index: number, value: T) {
      const vs = readValues()
      vs.splice(index, 0, value)
      const ks = [...keys]
      ks.splice(index, 0, nextKey++)
      rebuild(vs, ks)
    },
    remove(index: number) {
      const vs = readValues()
      vs.splice(index, 1)
      const ks = [...keys]
      ks.splice(index, 1)
      rebuild(vs, ks)
    },
    move(from: number, to: number) {
      const vs = readValues()
      const [v] = vs.splice(from, 1)
      if (v !== undefined) vs.splice(to, 0, v)
      const ks = [...keys]
      const [k] = ks.splice(from, 1)
      if (k !== undefined) ks.splice(to, 0, k)
      rebuild(vs, ks)
    },
    swap(a: number, b: number) {
      const vs = readValues()
      const ks = [...keys]
      ;[vs[a], vs[b]] = [vs[b]!, vs[a]!]
      ;[ks[a], ks[b]] = [ks[b]!, ks[a]!]
      rebuild(vs, ks)
    },
    replace(values: T[]) {
      rebuild([...values], values.map(() => nextKey++))
    },
    values: readValues,
  }
}

/**
 * Manage a dynamic array of fields with stable keys. Two forms:
 *
 * - **Standalone** — `useFieldArray<T>(initial?)`: a self-contained reactive
 *   array of `{ key, value: Signal }` items (not wired to a form).
 * - **Form-bound** — `useFieldArray<T>(form, name)`: items live IN the form as
 *   registered fields (`${name}.${index}[.${sub}]`), so their values reach
 *   `values()`/`onSubmit` and per-item validators gate `isValid`.
 *
 * @example
 * // Standalone
 * const tags = useFieldArray<string>([])
 * tags.append('pyreon')
 *
 * @example
 * // Form-bound (line items reach onSubmit as `items: [...]`)
 * const items = useFieldArray<{ qty: number }>(form, 'items')
 * items.append({ qty: 1 })
 * // render: <For each={items.items} by={i => i.key}>{(it) =>
 * //   <input {...form.register(`${it().name}.qty`, { type: 'number' })} />}</For>
 */
export function useFieldArray<T>(initial?: T[]): UseFieldArrayResult<T>
export function useFieldArray<T>(form: FormLike, name: string): UseFormFieldArrayResult<T>
export function useFieldArray<T>(
  arg1?: T[] | FormLike,
  arg2?: string,
): UseFieldArrayResult<T> | UseFormFieldArrayResult<T> {
  if (arg1 != null && typeof arg2 === 'string' && 'registerField' in (arg1 as object)) {
    return useFormFieldArray<T>(arg1 as FormLike, arg2)
  }
  return useStandaloneFieldArray<T>((arg1 as T[] | undefined) ?? [])
}
