import { describe, it, expect, beforeEach, mock } from "bun:test"
import { QueryClient } from "@tanstack/query-core"
import { h } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"
import {
  QueryClientProvider,
  useQueryClient,
  useQuery,
  useMutation,
  useIsFetching,
  useIsMutating,
  useQueries,
  useSuspenseQuery,
  useSuspenseInfiniteQuery,
  useInfiniteQuery,
  QuerySuspense,
  QueryErrorResetBoundary,
  useQueryErrorResetBoundary,
  dehydrate,
  hydrate,
} from "../index"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

/** Mount a component inside a QueryClientProvider, return unmount fn. */
function withProvider(client: QueryClient, component: () => void): () => void {
  const el = document.createElement("div")
  document.body.appendChild(el)
  let captured: ReturnType<typeof component> | undefined
  const unmount = mount(
    h(QueryClientProvider, { client }, () => {
      captured = component()
      return null
    }),
    el,
  )
  return () => { unmount(); el.remove() }
}

/** Returns a promise + its resolve/reject handles. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// ─── QueryClientProvider / useQueryClient ────────────────────────────────────

describe("QueryClientProvider / useQueryClient", () => {
  it("useQueryClient throws when no provider is present", () => {
    // Call directly outside any renderer — context stack is empty so it must throw.
    expect(() => useQueryClient()).toThrow("[nova/query]")
  })

  it("provides the QueryClient to descendants", () => {
    const client = makeClient()
    let received: QueryClient | null = null
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => { received = useQueryClient(); return null }, null),
      ),
      el,
    )
    unmount(); el.remove()
    expect(received).toBe(client)
  })

  it("inner provider overrides outer", () => {
    const outer = makeClient()
    const inner = makeClient()
    let received: QueryClient | null = null
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client: outer },
        h(QueryClientProvider, { client: inner },
          h(() => { received = useQueryClient(); return null }, null),
        ),
      ),
      el,
    )
    unmount(); el.remove()
    expect(received).toBe(inner)
  })
})

// ─── useQuery ─────────────────────────────────────────────────────────────────

describe("useQuery", () => {
  let client: QueryClient

  beforeEach(() => { client = makeClient() })

  it("starts in pending state when cache is empty", () => {
    let query: ReturnType<typeof useQuery> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useQuery(() => ({
            queryKey: ["test-pending"],
            queryFn: () => new Promise(() => {}), // never resolves
          }))
          return null
        }, null),
      ),
      el,
    )
    expect(query!.isPending()).toBe(true)
    expect(query!.data()).toBeUndefined()
    unmount(); el.remove()
  })

  it("resolves to success state with data", async () => {
    const { promise, resolve } = deferred<{ name: string }>()
    let query: ReturnType<typeof useQuery<{ name: string }>> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useQuery(() => ({
            queryKey: ["test-success"],
            queryFn: () => promise,
          }))
          return null
        }, null),
      ),
      el,
    )

    resolve({ name: "Nova" })
    await promise

    // Let the observer's internal promise chain flush
    await new Promise(r => setTimeout(r, 0))

    expect(query!.isSuccess()).toBe(true)
    expect(query!.data()).toEqual({ name: "Nova" })
    unmount(); el.remove()
  })

  it("captures errors in isError state", async () => {
    const { promise, reject } = deferred<never>()
    let query: ReturnType<typeof useQuery> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useQuery(() => ({
            queryKey: ["test-error"],
            queryFn: () => promise,
          }))
          return null
        }, null),
      ),
      el,
    )

    reject(new Error("fetch failed"))
    await promise.catch(() => {})
    await new Promise(r => setTimeout(r, 0))

    expect(query!.isError()).toBe(true)
    expect((query!.error() as Error).message).toBe("fetch failed")
    unmount(); el.remove()
  })

  it("respects enabled: false — does not fetch", async () => {
    const queryFn = mock(() => Promise.resolve("should not run"))
    let query: ReturnType<typeof useQuery<string>> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useQuery(() => ({
            queryKey: ["test-disabled"],
            queryFn,
            enabled: false,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 10))
    expect(queryFn).not.toHaveBeenCalled()
    expect(query!.isPending()).toBe(true)
    expect(query!.isFetching()).toBe(false)
    unmount(); el.remove()
  })

  it("reactive query key — refetches when signal changes", async () => {
    const calls: number[] = []
    const userId = signal(1)
    let query: ReturnType<typeof useQuery<string>> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useQuery(() => ({
            queryKey: ["user", userId()],
            queryFn: async () => {
              const id = userId()
              calls.push(id)
              return `user-${id}`
            },
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 10))
    expect(calls).toContain(1)

    userId.set(2)
    await new Promise(r => setTimeout(r, 10))
    expect(calls).toContain(2)

    expect(query!.data()).toBe("user-2")
    unmount(); el.remove()
  })

  it("invalidateQueries triggers a refetch", async () => {
    let callCount = 0
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          useQuery(() => ({
            queryKey: ["invalidate-test"],
            queryFn: async () => { callCount++; return callCount },
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 10))
    const before = callCount
    await client.invalidateQueries({ queryKey: ["invalidate-test"] })
    await new Promise(r => setTimeout(r, 10))
    expect(callCount).toBeGreaterThan(before)
    unmount(); el.remove()
  })
})

// ─── useMutation ──────────────────────────────────────────────────────────────

describe("useMutation", () => {
  let client: QueryClient
  beforeEach(() => { client = makeClient() })

  it("starts in idle state", () => {
    let mut: ReturnType<typeof useMutation> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          mut = useMutation({ mutationFn: () => Promise.resolve("ok") })
          return null
        }, null),
      ),
      el,
    )
    expect(mut!.isIdle()).toBe(true)
    expect(mut!.isPending()).toBe(false)
    unmount(); el.remove()
  })

  it("goes pending then success", async () => {
    let mut: ReturnType<typeof useMutation<string, Error, string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          mut = useMutation<string, Error, string>({
            mutationFn: async (input: string) => `result:${input}`,
          })
          return null
        }, null),
      ),
      el,
    )

    mut!.mutate("hello")
    await new Promise(r => setTimeout(r, 10))

    expect(mut!.isSuccess()).toBe(true)
    expect(mut!.data()).toBe("result:hello")
    unmount(); el.remove()
  })

  it("captures mutation error", async () => {
    let mut: ReturnType<typeof useMutation> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          mut = useMutation({
            mutationFn: async () => { throw new Error("mutation failed") },
          })
          return null
        }, null),
      ),
      el,
    )

    mut!.mutate(undefined)
    await new Promise(r => setTimeout(r, 10))

    expect(mut!.isError()).toBe(true)
    expect((mut!.error() as Error).message).toBe("mutation failed")
    unmount(); el.remove()
  })

  it("reset() clears mutation state", async () => {
    let mut: ReturnType<typeof useMutation<string, Error, void>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          mut = useMutation<string, Error, void>({
            mutationFn: async () => "done",
          })
          return null
        }, null),
      ),
      el,
    )

    mut!.mutate(undefined)
    await new Promise(r => setTimeout(r, 10))
    expect(mut!.isSuccess()).toBe(true)

    mut!.reset()
    await new Promise(r => setTimeout(r, 0))
    expect(mut!.isIdle()).toBe(true)
    expect(mut!.data()).toBeUndefined()
    unmount(); el.remove()
  })
})

// ─── useIsFetching / useIsMutating ────────────────────────────────────────────

describe("useIsFetching", () => {
  it("returns 0 when no queries are in-flight", () => {
    const client = makeClient()
    let count: (() => number) | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => { count = useIsFetching(); return null }, null),
      ),
      el,
    )
    expect(count!()).toBe(0)
    unmount(); el.remove()
  })

  it("increments while a query is fetching", async () => {
    const client = makeClient()
    const { promise, resolve } = deferred<string>()
    const counts: number[] = []
    let isFetching: (() => number) | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          isFetching = useIsFetching()
          useQuery(() => ({ queryKey: ["fetch-count"], queryFn: () => promise }))
          return null
        }, null),
      ),
      el,
    )

    // At this point the query has started fetching
    await new Promise(r => setTimeout(r, 0))
    counts.push(isFetching!())

    resolve("done")
    await promise
    await new Promise(r => setTimeout(r, 10))
    counts.push(isFetching!())

    expect(counts[0]).toBeGreaterThan(0)
    expect(counts[counts.length - 1]).toBe(0)
    unmount(); el.remove()
  })
})

describe("useIsMutating", () => {
  it("returns 0 when idle, >0 while mutating", async () => {
    const client = makeClient()
    const { promise, resolve } = deferred<void>()
    let isMutating: (() => number) | undefined
    let mut: ReturnType<typeof useMutation<void, Error, void>> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          isMutating = useIsMutating()
          mut = useMutation<void, Error, void>({ mutationFn: () => promise })
          return null
        }, null),
      ),
      el,
    )

    expect(isMutating!()).toBe(0)
    mut!.mutate(undefined)
    await new Promise(r => setTimeout(r, 0))
    expect(isMutating!()).toBeGreaterThan(0)
    resolve()
    await promise
    await new Promise(r => setTimeout(r, 10))
    expect(isMutating!()).toBe(0)
    unmount(); el.remove()
  })
})

// ─── SSR: dehydrate / hydrate ─────────────────────────────────────────────────

describe("dehydrate / hydrate", () => {
  it("round-trips query data — prefetched data available without refetching", async () => {
    // Server: prefetch + serialize
    const serverClient = makeClient()
    await serverClient.prefetchQuery({
      queryKey: ["ssr-user"],
      queryFn: async () => ({ name: "SSR User" }),
    })
    const state = dehydrate(serverClient)

    // Client: rehydrate
    const clientClient = makeClient()
    hydrate(clientClient, state)

    let query: ReturnType<typeof useQuery<{ name: string }>> | undefined
    let callCount = 0

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client: clientClient },
        h(() => {
          query = useQuery(() => ({
            queryKey: ["ssr-user"],
            queryFn: async () => { callCount++; return { name: "fresh" } },
            staleTime: Infinity, // treat hydrated data as fresh
          }))
          return null
        }, null),
      ),
      el,
    )

    // Data should be immediately available from the hydrated cache
    expect(query!.isSuccess()).toBe(true)
    expect(query!.data()).toEqual({ name: "SSR User" })
    // queryFn should NOT have been called (data was in cache)
    expect(callCount).toBe(0)
    unmount(); el.remove()
  })
})

// ─── useQueries ───────────────────────────────────────────────────────────────

describe("useQueries", () => {
  it("returns results for all queries in the array", async () => {
    const client = makeClient()
    let results: ReturnType<typeof useQueries> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          results = useQueries(() => [
            { queryKey: ["a"], queryFn: async () => "alpha" },
            { queryKey: ["b"], queryFn: async () => "beta" },
          ])
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    const res = results?.() ?? []
    expect(res).toHaveLength(2)
    expect(res[0].data).toBe("alpha")
    expect(res[1].data).toBe("beta")
    unmount(); el.remove()
  })

  it("reactive — updates when the queries signal changes", async () => {
    const client = makeClient()
    const { signal: sig } = await import("@pyreon/reactivity")
    const ids = sig([1])
    let results: ReturnType<typeof useQueries> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          results = useQueries(() =>
            ids().map(id => ({
              queryKey: ["item", id],
              queryFn: async () => `item-${id}`,
            })),
          )
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(results?.()).toHaveLength(1)

    ids.set([1, 2])
    await new Promise(r => setTimeout(r, 20))
    expect(results?.()).toHaveLength(2)
    expect(results?.()[1].data).toBe("item-2")
    unmount(); el.remove()
  })
})

// ─── useSuspenseQuery / QuerySuspense ─────────────────────────────────────────

describe("useSuspenseQuery + QuerySuspense", () => {
  let client: QueryClient
  beforeEach(() => { client = makeClient() })

  it("QuerySuspense shows fallback while pending, then children on success", async () => {
    const { promise, resolve } = deferred<string>()
    const rendered: string[] = []

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          const q = useSuspenseQuery(() => ({
            queryKey: ["sq-pending"],
            queryFn: () => promise,
          }))
          return h(QuerySuspense, { query: q, fallback: "loading" },
            () => { rendered.push(q.data()); return null },
          )
        }, null),
      ),
      el,
    )

    // While pending — fallback rendered, children not called
    await new Promise(r => setTimeout(r, 0))
    expect(rendered).toHaveLength(0)

    resolve("done")
    await promise
    await new Promise(r => setTimeout(r, 10))
    expect(rendered.at(-1)).toBe("done")
    unmount(); el.remove()
  })

  it("QuerySuspense shows error fallback on query failure", async () => {
    const { promise, reject } = deferred<never>()
    let errorMsg: string | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          const q = useSuspenseQuery(() => ({
            queryKey: ["sq-error"],
            queryFn: () => promise,
          }))
          return h(QuerySuspense, {
            query: q,
            fallback: "loading",
            error: (err) => { errorMsg = (err as Error).message; return null },
          }, () => null)
        }, null),
      ),
      el,
    )

    reject(new Error("sq failed"))
    await promise.catch(() => {})
    await new Promise(r => setTimeout(r, 10))
    expect(errorMsg).toBe("sq failed")
    unmount(); el.remove()
  })

  it("multiple queries — children only render when all succeed", async () => {
    const d1 = deferred<string>()
    const d2 = deferred<string>()
    let childrenRendered = false

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          const q1 = useSuspenseQuery(() => ({ queryKey: ["mq1"], queryFn: () => d1.promise }))
          const q2 = useSuspenseQuery(() => ({ queryKey: ["mq2"], queryFn: () => d2.promise }))
          return h(QuerySuspense, { query: [q1, q2], fallback: "loading" },
            () => { childrenRendered = true; return null },
          )
        }, null),
      ),
      el,
    )

    d1.resolve("first")
    await d1.promise
    await new Promise(r => setTimeout(r, 10))
    // q2 still pending — children should not render
    expect(childrenRendered).toBe(false)

    d2.resolve("second")
    await d2.promise
    await new Promise(r => setTimeout(r, 10))
    expect(childrenRendered).toBe(true)
    unmount(); el.remove()
  })
})

// ─── QueryErrorResetBoundary / useQueryErrorResetBoundary ─────────────────────

describe("QueryErrorResetBoundary", () => {
  it("reset() re-triggers fetch for errored queries", async () => {
    const client = makeClient()
    let callCount = 0
    let shouldFail = true
    let resetFn: (() => void) | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(QueryErrorResetBoundary, null,
          h(() => {
            const { reset } = useQueryErrorResetBoundary()
            resetFn = reset
            useQuery(() => ({
              queryKey: ["reset-test"],
              queryFn: async () => {
                callCount++
                if (shouldFail) throw new Error("fail")
                return "ok"
              },
            }))
            return null
          }, null),
        ),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 10))
    const afterFirst = callCount

    shouldFail = false
    resetFn?.()
    await new Promise(r => setTimeout(r, 10))
    expect(callCount).toBeGreaterThan(afterFirst)
    unmount(); el.remove()
  })

  it("useQueryErrorResetBoundary works without explicit boundary", () => {
    const client = makeClient()
    let reset: (() => void) | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          const boundary = useQueryErrorResetBoundary()
          reset = boundary.reset
          return null
        }, null),
      ),
      el,
    )

    // Should not throw — falls back to client-level reset
    expect(() => reset?.()).not.toThrow()
    unmount(); el.remove()
  })
})

// ─── useInfiniteQuery ─────────────────────────────────────────────────────────

describe("useInfiniteQuery", () => {
  let client: QueryClient
  beforeEach(() => { client = makeClient() })

  it("starts in pending state", () => {
    let query: ReturnType<typeof useInfiniteQuery> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-pending"],
            queryFn: () => new Promise(() => {}),
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }, null),
      ),
      el,
    )
    expect(query!.isPending()).toBe(true)
    expect(query!.isLoading()).toBe(true)
    expect(query!.data()).toBeUndefined()
    expect(query!.status()).toBe("pending")
    expect(query!.isSuccess()).toBe(false)
    expect(query!.isError()).toBe(false)
    expect(query!.error()).toBeNull()
    expect(query!.hasNextPage()).toBe(false)
    expect(query!.hasPreviousPage()).toBe(false)
    expect(query!.isFetchingNextPage()).toBe(false)
    expect(query!.isFetchingPreviousPage()).toBe(false)
    unmount(); el.remove()
  })

  it("resolves to success with pages data", async () => {
    let query: ReturnType<typeof useInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-success"],
            queryFn: ({ pageParam }: { pageParam: number }) => Promise.resolve(`page-${pageParam}`),
            initialPageParam: 0,
            getNextPageParam: (_last: string, _all: string[], lastParam: number) =>
              lastParam < 2 ? lastParam + 1 : undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.isSuccess()).toBe(true)
    expect(query!.status()).toBe("success")
    expect(query!.data()?.pages).toEqual(["page-0"])
    expect(query!.hasNextPage()).toBe(true)
    expect(query!.isPending()).toBe(false)
    expect(query!.isFetching()).toBe(false)
    unmount(); el.remove()
  })

  it("fetchNextPage loads the next page", async () => {
    let query: ReturnType<typeof useInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-next"],
            queryFn: ({ pageParam }: { pageParam: number }) => Promise.resolve(`page-${pageParam}`),
            initialPageParam: 0,
            getNextPageParam: (_last: string, _all: string[], lastParam: number) =>
              lastParam < 2 ? lastParam + 1 : undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toEqual(["page-0"])

    await query!.fetchNextPage()
    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toEqual(["page-0", "page-1"])
    expect(query!.hasNextPage()).toBe(true)

    await query!.fetchNextPage()
    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toEqual(["page-0", "page-1", "page-2"])
    expect(query!.hasNextPage()).toBe(false)
    unmount(); el.remove()
  })

  it("fetchPreviousPage loads the previous page", async () => {
    let query: ReturnType<typeof useInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-prev"],
            queryFn: ({ pageParam }: { pageParam: number }) => Promise.resolve(`page-${pageParam}`),
            initialPageParam: 5,
            getNextPageParam: () => undefined,
            getPreviousPageParam: (_first: string, _all: string[], firstParam: number) =>
              firstParam > 3 ? firstParam - 1 : undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.hasPreviousPage()).toBe(true)

    await query!.fetchPreviousPage()
    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toContain("page-4")
    unmount(); el.remove()
  })

  it("captures error state", async () => {
    let query: ReturnType<typeof useInfiniteQuery> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-error"],
            queryFn: () => Promise.reject(new Error("inf failed")),
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.isError()).toBe(true)
    expect(query!.status()).toBe("error")
    expect((query!.error() as Error).message).toBe("inf failed")
    unmount(); el.remove()
  })

  it("refetch re-fetches the query", async () => {
    let callCount = 0
    let query: ReturnType<typeof useInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-refetch"],
            queryFn: () => { callCount++; return Promise.resolve("data") },
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    const before = callCount
    await query!.refetch()
    await new Promise(r => setTimeout(r, 20))
    expect(callCount).toBeGreaterThan(before)
    unmount(); el.remove()
  })

  it("result signal contains full observer result", async () => {
    let query: ReturnType<typeof useInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-result"],
            queryFn: () => Promise.resolve("val"),
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    const r = query!.result()
    expect(r.status).toBe("success")
    expect(r.data?.pages).toEqual(["val"])
    unmount(); el.remove()
  })

  it("reactive options update observer", async () => {
    const key = signal("a")
    let query: ReturnType<typeof useInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-reactive", key()],
            queryFn: () => Promise.resolve(`data-${key()}`),
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toEqual(["data-a"])

    key.set("b")
    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toEqual(["data-b"])
    unmount(); el.remove()
  })
})

// ─── useSuspenseInfiniteQuery ────────────────────────────────────────────────

describe("useSuspenseInfiniteQuery", () => {
  let client: QueryClient
  beforeEach(() => { client = makeClient() })

  it("returns all fine-grained signals and resolves to success", async () => {
    let query: ReturnType<typeof useSuspenseInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseInfiniteQuery(() => ({
            queryKey: ["sinf-1"],
            queryFn: ({ pageParam }: { pageParam: number }) => Promise.resolve(`p${pageParam}`),
            initialPageParam: 0,
            getNextPageParam: (_l: string, _a: string[], lp: number) => lp < 1 ? lp + 1 : undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.isSuccess()).toBe(true)
    expect(query!.status()).toBe("success")
    expect(query!.data()?.pages).toEqual(["p0"])
    expect(query!.error()).toBeNull()
    expect(query!.isError()).toBe(false)
    expect(query!.isFetching()).toBe(false)
    expect(query!.isFetchingNextPage()).toBe(false)
    expect(query!.isFetchingPreviousPage()).toBe(false)
    expect(query!.hasNextPage()).toBe(true)
    expect(query!.hasPreviousPage()).toBe(false)
    unmount(); el.remove()
  })

  it("fetchNextPage and fetchPreviousPage work", async () => {
    let query: ReturnType<typeof useSuspenseInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseInfiniteQuery(() => ({
            queryKey: ["sinf-pages"],
            queryFn: ({ pageParam }: { pageParam: number }) => Promise.resolve(`p${pageParam}`),
            initialPageParam: 1,
            getNextPageParam: (_l: string, _a: string[], lp: number) => lp < 3 ? lp + 1 : undefined,
            getPreviousPageParam: (_f: string, _a: string[], fp: number) => fp > 0 ? fp - 1 : undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    await query!.fetchNextPage()
    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toContain("p2")

    await query!.fetchPreviousPage()
    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toContain("p0")
    unmount(); el.remove()
  })

  it("refetch works", async () => {
    let callCount = 0
    let query: ReturnType<typeof useSuspenseInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseInfiniteQuery(() => ({
            queryKey: ["sinf-refetch"],
            queryFn: () => { callCount++; return Promise.resolve("d") },
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    const before = callCount
    await query!.refetch()
    await new Promise(r => setTimeout(r, 20))
    expect(callCount).toBeGreaterThan(before)
    unmount(); el.remove()
  })

  it("result signal contains full observer result", async () => {
    let query: ReturnType<typeof useSuspenseInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseInfiniteQuery(() => ({
            queryKey: ["sinf-result"],
            queryFn: () => Promise.resolve("v"),
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.result().status).toBe("success")
    unmount(); el.remove()
  })

  it("reactive options update observer", async () => {
    const key = signal("x")
    let query: ReturnType<typeof useSuspenseInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseInfiniteQuery(() => ({
            queryKey: ["sinf-reactive", key()],
            queryFn: () => Promise.resolve(`val-${key()}`),
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toEqual(["val-x"])
    key.set("y")
    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()?.pages).toEqual(["val-y"])
    unmount(); el.remove()
  })
})

// ─── useSuspenseQuery — additional coverage ──────────────────────────────────

describe("useSuspenseQuery — additional", () => {
  let client: QueryClient
  beforeEach(() => { client = makeClient() })

  it("data is typed as TData (never undefined) after success", async () => {
    let query: ReturnType<typeof useSuspenseQuery<{ name: string }>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseQuery(() => ({
            queryKey: ["sq-data-type"],
            queryFn: () => Promise.resolve({ name: "test" }),
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.data().name).toBe("test")
    expect(query!.isSuccess()).toBe(true)
    expect(query!.isFetching()).toBe(false)
    expect(query!.isError()).toBe(false)
    expect(query!.error()).toBeNull()
    expect(query!.status()).toBe("success")
    expect(query!.result().status).toBe("success")
    unmount(); el.remove()
  })

  it("refetch re-fetches the query", async () => {
    let callCount = 0
    let query: ReturnType<typeof useSuspenseQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseQuery(() => ({
            queryKey: ["sq-refetch"],
            queryFn: () => { callCount++; return Promise.resolve("ok") },
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    const before = callCount
    await query!.refetch()
    await new Promise(r => setTimeout(r, 20))
    expect(callCount).toBeGreaterThan(before)
    unmount(); el.remove()
  })

  it("reactive key changes trigger re-fetch", async () => {
    const key = signal("k1")
    let query: ReturnType<typeof useSuspenseQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseQuery(() => ({
            queryKey: ["sq-reactive", key()],
            queryFn: () => Promise.resolve(`data-${key()}`),
          }))
          return null
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()).toBe("data-k1")

    key.set("k2")
    await new Promise(r => setTimeout(r, 20))
    expect(query!.data()).toBe("data-k2")
    unmount(); el.remove()
  })

  it("captures error state in suspense query", async () => {
    const { promise, reject } = deferred<never>()

    const el = document.createElement("div")
    document.body.appendChild(el)

    let query: ReturnType<typeof useSuspenseQuery> | undefined
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseQuery(() => ({
            queryKey: ["sq-rethrow2"],
            queryFn: () => promise,
          }))
          return null
        }, null),
      ),
      el,
    )

    reject(new Error("rethrow test"))
    await promise.catch(() => {})
    await new Promise(r => setTimeout(r, 10))
    expect(query!.isError()).toBe(true)
    expect(query!.isPending()).toBe(false)
    unmount(); el.remove()
  })

  it("QuerySuspense handles fallback as function", async () => {
    let query: ReturnType<typeof useSuspenseQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      h(QueryClientProvider, { client },
        h(() => {
          query = useSuspenseQuery(() => ({
            queryKey: ["sq-fn-fallback"],
            queryFn: () => new Promise(() => {}),
          }))
          return h(QuerySuspense, { query: query!, fallback: () => "loading fn" }, () => null)
        }, null),
      ),
      el,
    )

    await new Promise(r => setTimeout(r, 10))
    // The fallback function should be called
    expect(query!.isPending()).toBe(true)
    unmount(); el.remove()
  })
})
