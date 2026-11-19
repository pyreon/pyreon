import { batch, signal } from '@pyreon/reactivity'
import { createSource } from './source'
import type { Source, SourceFn } from './source'
import type { Command } from './types'

/** The async sources that are searched from the root while the user types (`inline: true` commands), one per command. */
export interface Inline {
  /** Read it to follow sources being added and dropped. */
  version(): number
  /** Ask the sources for `query`: new ones at once, the others debounced; sources that are no longer wanted are forgotten. */
  sync(commands: readonly Command[], query: string): void
  results(id: string): readonly Command[]
  loading(): boolean
  error(): unknown
  /** Abort and forget everything. */
  reset(): void
}

export function createInline(debounceMs: number): Inline {
  const sources = new Map<string, Source>()
  const version = signal(0)

  function drop(id: string, source: Source): void {
    source.reset()
    sources.delete(id)
  }

  return {
    version: () => version(),
    sync(commands, query) {
      const wanted = new Set(commands.map((c) => c.id))
      batch(() => {
        let changed = false
        for (const [id, source] of sources) {
          if (!wanted.has(id)) {
            drop(id, source)
            changed = true
          }
        }
        for (const command of commands) {
          let source = sources.get(command.id)
          const fresh = source === undefined
          if (source === undefined) {
            source = createSource(debounceMs)
            sources.set(command.id, source)
            changed = true
          }
          source.request(command.children as SourceFn, query, fresh)
        }
        if (changed) version.set(version.peek() + 1)
      })
    },
    results: (id) => sources.get(id)?.results() ?? [],
    loading() {
      version()
      for (const source of sources.values()) if (source.loading()) return true

      return false
    },
    error() {
      version()
      for (const source of sources.values()) {
        const error = source.error()
        if (error !== undefined) return error
      }

      return undefined
    },
    reset() {
      for (const [id, source] of sources) drop(id, source)
      version.set(version.peek() + 1)
    },
  }
}
