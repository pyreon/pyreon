import type { Computed, Signal } from '@pyreon/reactivity'
import { computed, signal } from '@pyreon/reactivity'

export interface FieldArrayItem<T> {
  /** Stable key for keyed rendering. */
  key: number
  /** Reactive value for this item. */
  value: Signal<T>
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

/**
 * Manage a dynamic array of form fields with stable keys.
 *
 * @example
 * const tags = useFieldArray<string>([])
 * tags.append('typescript')
 * tags.append('pyreon')
 * // tags.items() — array of { key, value } for keyed rendering
 */
export function useFieldArray<T>(initial: T[] = []): UseFieldArrayResult<T> {
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
