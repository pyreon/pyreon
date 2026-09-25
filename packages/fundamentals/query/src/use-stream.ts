import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, effect, signal, untrack } from '@pyreon/reactivity'
import type { QueryClient } from '@tanstack/query-core'
import { useQueryClient } from './query-client'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Where a {@link useStream} is in its lifecycle. `idle` = not started (the
 * source returned `undefined`, or the hook is disabled / aborted).
 */
export type StreamState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'

/** What a stream source receives each time the hook (re)starts it. */
export interface StreamSourceContext {
  /** Aborts on unmount, `abort()`, `restart()`, or when a tracked input changes. */
  signal: AbortSignal
  /**
   * Report finer lifecycle states (`open`, `reconnecting`). Optional — a
   * plain async iterable that never calls it still gets `connecting` →
   * `closed` / `error`. `@pyreon/http/stream`'s `onStatus` fits it exactly.
   */
  onStatus: (status: Exclude<StreamState, 'idle'>) => void
}

/**
 * Opens the stream. Called inside a tracking scope, so a signal read here
 * re-starts the stream when it changes. Return `undefined` while the inputs
 * are not ready — the hook stays `idle` instead of opening a half-formed
 * request.
 */
export type StreamSource<T> = (ctx: StreamSourceContext) => AsyncIterable<T> | undefined

export interface UseStreamOptions<T> {
  /** Whether the stream runs. Default: true. */
  enabled?: boolean | (() => boolean)
  /**
   * How many events `events()` keeps — the oldest are dropped. Default 1000.
   * A stream can run for hours, and an unbounded buffer is a memory leak
   * with a delay; pass `Infinity` only for a stream you know ends.
   */
  maxEvents?: number
  /** Called for every event — write it into the query cache, append to a log, … */
  onEvent?: (event: T, queryClient: QueryClient) => void
}

export interface UseStreamResult<T> {
  /** Events received since the stream (re)started, oldest first, bounded by `maxEvents`. */
  events: () => readonly T[]
  /** The most recent event, or `undefined` before the first. */
  latest: () => T | undefined
  /** Lifecycle state. */
  status: () => StreamState
  /** The error that ended the stream, or `undefined`. */
  error: () => unknown
  /** Stop the stream. A later input change does NOT restart it — call `restart()`. */
  abort: () => void
  /** Start a fresh stream (events cleared), undoing an `abort()`. */
  restart: () => void
}

// ─── useStream ───────────────────────────────────────────────────────────────

/**
 * Consume any async-iterable stream as signals — Server-Sent Events, NDJSON,
 * an LLM token stream — with cancellation tied to the component.
 *
 * Unlike {@link useSSE} (which wraps the browser's `EventSource`), the source
 * is a function returning an async iterable, so it can be a POST, send auth
 * headers, validate every event, and run through a mock transport. A
 * generated client's `use<Op>Stream` hooks are built on this.
 *
 * @example
 * ```ts
 * import { openEventStream } from '@pyreon/http/stream'
 *
 * const feed = useStream((ctx) =>
 *   openEventStream((c) => tail({ params: { room: room() }, signal: c.signal, headers: c.headers }), {
 *     signal: ctx.signal,
 *     onStatus: ctx.onStatus,
 *   }),
 * )
 * // feed.events() / feed.latest() / feed.status() / feed.error()
 * ```
 */
export function useStream<T>(
  source: StreamSource<T>,
  options: UseStreamOptions<T> = {},
): UseStreamResult<T> {
  const queryClient = useQueryClient()
  const events: Signal<readonly T[]> = signal<readonly T[]>([])
  const latest = signal<T | undefined>(undefined)
  const status = signal<StreamState>('idle')
  const error = signal<unknown>(undefined)
  const max = options.maxEvents ?? 1000

  let controller: AbortController | null = null
  // A newer run supersedes an older one, whose late events must not land
  // (a slow stream finishing after an input change would clobber the new one).
  let generation = 0
  let aborted = false
  const restartTick = signal(0)

  function stop(): void {
    generation++
    controller?.abort()
    controller = null
  }

  function isEnabled(): boolean {
    if (options.enabled === undefined) return true
    return typeof options.enabled === 'function' ? options.enabled() : options.enabled
  }

  async function consume(iterable: AsyncIterable<T>, gen: number): Promise<void> {
    const live = (): boolean => gen === generation
    try {
      for await (const event of iterable) {
        if (!live()) return
        batch(() => {
          const prev = events.peek()
          const next = prev.length >= max ? [...prev.slice(prev.length - max + 1), event] : [...prev, event]
          events.set(max <= 0 ? [] : next)
          latest.set(event)
          if (status.peek() !== 'open') status.set('open')
        })
        options.onEvent?.(event, queryClient)
      }
      if (live()) status.set('closed')
    } catch (e) {
      // A superseded or aborted run bumped `generation` first, so its abort
      // rejection lands here as not-live and is dropped: `abort()` reads as
      // `closed`, never as an error.
      if (!live()) return
      batch(() => {
        error.set(e)
        status.set('error')
      })
    }
  }

  function start(ctxSource: () => AsyncIterable<T> | undefined, gen: number): void {
    const iterable = ctxSource()
    if (!iterable) {
      status.set('idle')
      return
    }
    batch(() => {
      events.set([])
      latest.set(undefined)
      error.set(undefined)
      status.set('connecting')
    })
    // Untracked: the iterator's first step runs synchronously, and whatever
    // it reads (a transport's settings, a stored id) is not an input of THIS
    // stream — only the source call above is.
    untrack(() => {
      void consume(iterable, gen)
    })
  }

  effect(() => {
    restartTick()
    const enabled = isEnabled()
    if (aborted) return
    stop()
    if (!enabled) {
      status.set('idle')
      return
    }
    const gen = generation
    const ac = new AbortController()
    controller = ac
    const ctx: StreamSourceContext = {
      signal: ac.signal,
      onStatus: (s) => {
        if (gen === generation) status.set(s)
      },
    }
    // The source call is TRACKED: its signal reads are this stream's inputs.
    start(() => source(ctx), gen)
  })

  onUnmount(() => {
    aborted = true
    stop()
  })

  return {
    events: () => events(),
    latest: () => latest(),
    status: () => status(),
    error: () => error(),
    abort: () => {
      aborted = true
      stop()
      status.set('closed')
    },
    restart: () => {
      aborted = false
      // Through the effect, not a direct call: the source must run TRACKED
      // again, or an input change after a restart would be ignored.
      restartTick.set(restartTick.peek() + 1)
    },
  }
}
