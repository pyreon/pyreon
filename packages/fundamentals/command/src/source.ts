import { batch, signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import type { Command } from './types'

/** The async source of a page: the function form of `children`, called with the query and an AbortSignal. */
export type SourceFn = (query: string, signal: AbortSignal) => readonly Command[] | Promise<readonly Command[]>

export interface Source {
  /** The commands of the latest answer. Kept while a newer request is pending, so the list does not flicker. */
  readonly results: Signal<readonly Command[]>
  /** `true` from the request until its answer (the debounce wait included). */
  readonly loading: Signal<boolean>
  readonly error: Signal<unknown>
  /** Ask for the results of `query`. Debounced unless `immediate`. A newer request supersedes (and aborts) an older one. */
  request(load: SourceFn, query: string, immediate: boolean): void
  /** Abort the pending request and drop the timer; the results stay. */
  cancel(): void
  /** Cancel and forget the results and the error. */
  reset(): void
}

function asList(value: unknown): readonly Command[] {
  if (!Array.isArray(value)) throw new Error('[Pyreon] command: an async source (a function `children`) must return an array of commands, or a promise of one')

  return value as readonly Command[]
}

/**
 * Latest wins: every request takes a ticket; an answer is used only if its ticket is still the newest and its signal was not
 * aborted, so a slow earlier response can never overwrite a newer one. The previous request is aborted when a newer one
 * starts, and the timer and the request are released by `cancel`.
 */
export function createSource(debounceMs: number): Source {
  const results = signal<readonly Command[]>([])
  const loading = signal(false)
  const error = signal<unknown>(undefined)
  let ticket = 0
  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function stop(): void {
    ticket++
    if (timer !== null) clearTimeout(timer)
    timer = null
    controller?.abort()
    controller = null
  }

  function settle(mine: number, answer: () => void): void {
    if (mine !== ticket) return
    try {
      answer()
    } catch (thrown) {
      error.set(thrown)
    }
    loading.set(false)
  }

  function start(load: SourceFn, query: string, mine: number): void {
    timer = null
    const own = new AbortController()
    controller = own
    let answer: readonly Command[] | Promise<readonly Command[]>
    try {
      answer = load(query, own.signal)
    } catch (thrown) {
      settle(mine, () => error.set(thrown))

      return
    }
    if (typeof (answer as PromiseLike<unknown>).then !== 'function') {
      settle(mine, () => {
        results.set(asList(answer))
        error.set(undefined)
      })

      return
    }
    ;(answer as Promise<readonly Command[]>).then(
      (list) =>
        settle(mine, () => {
          results.set(asList(list))
          error.set(undefined)
        }),
      (thrown: unknown) => {
        if (!own.signal.aborted) settle(mine, () => error.set(thrown))
      },
    )
  }

  return {
    results,
    loading,
    error,
    request(load, query, immediate) {
      stop()
      const mine = ticket
      loading.set(true)
      error.set(undefined)
      if (immediate || debounceMs <= 0) start(load, query, mine)
      else timer = setTimeout(() => start(load, query, mine), debounceMs)
    },
    cancel() {
      stop()
      loading.set(false)
    },
    reset() {
      stop()
      batch(() => {
        loading.set(false)
        results.set([])
        error.set(undefined)
      })
    },
  }
}
