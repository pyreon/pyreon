import { batch, isClient, onCleanup, signal, type Signal } from '@pyreon/reactivity'

/**
 * The request options `useFetch` accepts.
 *
 * A deliberately SMALL subset of the web `RequestInit`, because every field
 * here must lower to both native targets. PMTC reads `method` / `headers` /
 * `body` off this object literal and builds a `PyreonHttpRequest`; anything
 * else has no native analogue and the compiler warns rather than dropping it
 * silently. `body` is a STRING (serialize before calling) — a `FormData` or
 * `Blob` body has no shared-source meaning across three targets.
 */
export interface UseFetchInit {
  /** HTTP verb. Defaults to GET. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Request headers. Must be a literal object to reach native. */
  headers?: Record<string, string>
  /** Request body, already serialized. */
  body?: string
}

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
 * Pass `init` for a non-GET request. On native it lowers to `PyreonHttp`
 * (URLSession on iOS, OkHttp on Android) — the layer that carries verbs,
 * headers and a body. Keep every value a LITERAL: PMTC bakes them into the
 * emitted request at compile time and warns loudly for anything it cannot
 * read, because a request that silently falls back to GET is worse than one
 * that fails to build.
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
export function useFetch<T>(
  source: string | PromiseLike<T>,
  init?: UseFetchInit,
): UseFetchResult<T> {
  const data = signal<T | undefined>(undefined)
  const error = signal<unknown>(undefined)
  const isPending = signal(false)
  let controller: AbortController | null = null

  // An `@pyreon/http` endpoint CALL is the shape `@pyreon/native-compiler`
  // documents as the crossing surface — `useFetch<T>(getUser({ params }))`
  // lowers to a native fetch of the templated URL. On the web that call has
  // already fired the request and returns a promise, so the string path here
  // did `fetch(String(promise))` — a request for the literal `[object
  // Promise]` — while the endpoint's own rejection went unhandled and surfaced
  // as an uncaught page error. Adopting the promise is what makes the
  // documented shape mean the same thing on all three targets.
  if (typeof source !== 'string') {
    isPending.set(true)
    let disposed = false
    onCleanup(() => {
      disposed = true
    })
    Promise.resolve(source).then(
      (json) => {
        if (disposed) return
        batch(() => {
          data.set(json)
          error.set(undefined)
          isPending.set(false)
        })
      },
      (err: unknown) => {
        if (disposed) return
        batch(() => {
          error.set(err)
          isPending.set(false)
        })
      },
    )
    // A settled promise cannot be re-issued, and this hook never held the URL
    // that produced it. Say so instead of silently doing nothing: the caller
    // wanted a new request and did not get one.
    const refetchPromise = (): void => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[Pyreon] useFetch(): refetch() does nothing when the source is a promise — ' +
            'the request was already issued by whatever produced it. Pass a URL string, ' +
            'or drive the endpoint through useQuery, which owns its own refetch.',
        )
      }
    }
    return { data, error, isPending, refetch: refetchPromise }
  }
  const url = source

  const refetch = (): void => {
    if (!isClient) return
    controller?.abort()
    const current = (controller = new AbortController())
    isPending.set(true)
    fetch(url, {
      signal: current.signal,
      ...(init?.method ? { method: init.method } : {}),
      ...(init?.headers ? { headers: init.headers } : {}),
      ...(init?.body !== undefined ? { body: init.body } : {}),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`[Pyreon] useFetch ${url}: HTTP ${res.status}`)
        }
        return res.json() as Promise<T>
      })
      .then((json) => {
        if (current.signal.aborted) return
        // Batched: three writes land in one flush, so a consumer reading
        // `data()` and `isPending()` in the same effect sees the settled pair
        // instead of an intermediate "data arrived but still pending" state.
        batch(() => {
          data.set(json)
          error.set(undefined)
          isPending.set(false)
        })
      })
      .catch((err: unknown) => {
        if (current.signal.aborted) return
        error.set(err)
        isPending.set(false)
      })
  }

  refetch()
  onCleanup(() => controller?.abort())

  return { data, error, isPending, refetch }
}
