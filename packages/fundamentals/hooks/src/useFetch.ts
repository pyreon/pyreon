import { batch, isClient, onCleanup, signal, type Signal } from '@pyreon/reactivity'

export interface UseFetchResult<T> {
  /** Decoded JSON result — `undefined` until the first successful fetch. */
  data: Signal<T | undefined>
  /** The most recent failure — `undefined` on success / before first settle. */
  error: Signal<unknown>
  /** True while a request is in flight. */
  isPending: Signal<boolean>
  /** Re-run the fetch. Aborts any request still in flight. */
  refetch: () => void
}

/**
 * Thin reactive JSON fetch — `{ data, error, isPending, refetch }`.
 *
 * The web half of Pyreon's multiplatform `useFetch<T>(url)` contract:
 * the SAME call in a shared `.tsx` source compiles to a `PyreonFetch<T>`
 * container on iOS (URLSession `.task {}` harness) and Android
 * (`LaunchedEffect` + kotlinx-serialization) via PMTC, while this
 * implementation runs on web. Deliberately thinner than
 * `@pyreon/query` — no cache, no dedup, no retries; reach for the
 * TanStack adapter when you need those.
 *
 * Fires once at component setup (client only — SSR renders the
 * not-yet-loaded state and the client fetch runs after hydration).
 * Each `refetch()` aborts the previous in-flight request, so a slow
 * stale response can never clobber a fresh one; unmount aborts too.
 *
 * @example
 * ```tsx
 * type Quote = { id: number; text: string }
 * const quotes = useFetch<Quote[]>('/api/quotes.json')
 * <Show when={quotes.isPending}><Text>Loading…</Text></Show>
 * <For each={() => quotes.data() ?? []} by={(q) => q.id}>
 *   {(q) => <Text>{q.text}</Text>}
 * </For>
 * ```
 */
export function useFetch<T>(url: string): UseFetchResult<T> {
  const data = signal<T | undefined>(undefined)
  const error = signal<unknown>(undefined)
  const isPending = signal(false)
  let controller: AbortController | null = null

  const refetch = (): void => {
    if (!isClient) return
    controller?.abort()
    const current = (controller = new AbortController())
    isPending.set(true)
    fetch(url, { signal: current.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`[Pyreon] useFetch ${url}: HTTP ${res.status}`)
        }
        return res.json() as Promise<T>
      })
      .then((json) => {
        if (current.signal.aborted) return
        // Atomic settle: data + cleared error + isPending=false in one notify
        // cycle (avoids an intermediate render with data set but still pending).
        batch(() => {
          data.set(json)
          error.set(undefined)
          isPending.set(false)
        })
      })
      .catch((err: unknown) => {
        if (current.signal.aborted) return
        batch(() => {
          error.set(err)
          isPending.set(false)
        })
      })
  }

  refetch()
  onCleanup(() => controller?.abort())

  return { data, error, isPending, refetch }
}
