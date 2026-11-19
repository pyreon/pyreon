import { signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import { warn } from './entry'
import type { RecentsStorage } from './types'

const DEFAULT_MAX = 8

export interface Recents {
  readonly ids: Signal<readonly string[]>
  readonly max: number
  mark(id: string): void
  clear(): void
}

function load(storage: RecentsStorage | undefined, max: number): readonly string[] {
  if (storage === undefined || max === 0) return []
  try {
    const stored = storage.get()
    if (!Array.isArray(stored)) return []
    return stored.filter((id): id is string => typeof id === 'string').slice(0, max)
  } catch (error) {
    warn(`commands: reading the recents failed (${String(error)}); starting with none`)
    return []
  }
}

function save(storage: RecentsStorage | undefined, ids: string[]): void {
  if (storage === undefined) return
  try {
    storage.set(ids)
  } catch (error) {
    warn(`commands: saving the recents failed (${String(error)})`)
  }
}

/** The ids of the commands run last, newest first, unique and capped, optionally persisted. */
export function createRecents(options?: { max?: number; storage?: RecentsStorage }): Recents {
  const max = Math.max(0, options?.max ?? DEFAULT_MAX)
  const storage = options?.storage
  const ids = signal<readonly string[]>(load(storage, max))

  return {
    ids,
    max,
    mark(id) {
      if (max === 0) return
      const next = [id, ...ids.peek().filter((x) => x !== id)].slice(0, max)
      ids.set(next)
      save(storage, [...next])
    },
    clear() {
      ids.set([])
      save(storage, [])
    },
  }
}
