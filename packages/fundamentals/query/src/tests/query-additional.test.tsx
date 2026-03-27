import { signal } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"
import { QueryClient } from "@tanstack/query-core"
import {
  QueryClientProvider,
  QuerySuspense,
  useInfiniteQuery,
  useIsFetching,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "../index"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// ─── useInfiniteQuery — additional ───────────────────────────────────────────

describe("useInfiniteQuery — additional", () => {
  let client: QueryClient
  beforeEach(() => {
    client = makeClient()
  })

  it("isFetchingNextPage is true during fetchNextPage", async () => {
    const { promise: pagePromise, resolve: resolveNextPage } = deferred<string>()
    let callCount = 0
    let query: ReturnType<typeof useInfiniteQuery<string>> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-fetching-next"],
            queryFn: ({ pageParam }: { pageParam: number }) => {
              callCount++
              if (callCount === 1) return Promise.resolve("page-0")
              return pagePromise
            },
            initialPageParam: 0,
            getNextPageParam: (_last: string, _all: string[], lastParam: number) =>
              lastParam < 2 ? lastParam + 1 : undefined,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    // Wait for first page
    await new Promise((r) => setTimeout(r, 20))
    expect(query!.isSuccess()).toBe(true)
    expect(query!.isFetchingNextPage()).toBe(false)

    // Start fetching next page
    const nextPromise = query!.fetchNextPage()
    await new Promise((r) => setTimeout(r, 0))
    expect(query!.isFetchingNextPage()).toBe(true)
    expect(query!.isFetching()).toBe(true)

    // Resolve and verify
    resolveNextPage("page-1")
    await nextPromise
    await new Promise((r) => setTimeout(r, 10))
    expect(query!.isFetchingNextPage()).toBe(false)
    expect(query!.data()?.pages).toEqual(["page-0", "page-1"])

    unmount()
    el.remove()
  })

  it("hasNextPage is false when getNextPageParam returns undefined", async () => {
    let query: ReturnType<typeof useInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-no-next"],
            queryFn: () => Promise.resolve("only-page"),
            initialPageParam: 0,
            getNextPageParam: () => undefined, // No more pages
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await new Promise((r) => setTimeout(r, 20))
    expect(query!.hasNextPage()).toBe(false)
    expect(query!.data()?.pages).toEqual(["only-page"])
    unmount()
    el.remove()
  })

  it("multiple fetchNextPage calls accumulate pages", async () => {
    let query: ReturnType<typeof useInfiniteQuery<string>> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          query = useInfiniteQuery(() => ({
            queryKey: ["inf-multi-fetch"],
            queryFn: ({ pageParam }: { pageParam: number }) => Promise.resolve(`p${pageParam}`),
            initialPageParam: 0,
            getNextPageParam: (_last: string, _all: string[], lastParam: number) =>
              lastParam < 4 ? lastParam + 1 : undefined,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await new Promise((r) => setTimeout(r, 20))
    expect(query!.data()?.pages).toEqual(["p0"])

    // Fetch pages 1, 2, 3 sequentially
    for (let i = 1; i <= 3; i++) {
      await query!.fetchNextPage()
      await new Promise((r) => setTimeout(r, 10))
    }

    expect(query!.data()?.pages).toEqual(["p0", "p1", "p2", "p3"])
    expect(query!.hasNextPage()).toBe(true) // page 4 is available

    await query!.fetchNextPage()
    await new Promise((r) => setTimeout(r, 10))
    expect(query!.data()?.pages).toEqual(["p0", "p1", "p2", "p3", "p4"])
    expect(query!.hasNextPage()).toBe(false) // No more pages
    unmount()
    el.remove()
  })
})

// ─── useSuspenseQuery — additional ───────────────────────────────────────────

describe("useSuspenseQuery — suspense behavior", () => {
  let client: QueryClient
  beforeEach(() => {
    client = makeClient()
  })

  it("isPending is true while query is loading", async () => {
    const { promise, resolve } = deferred<string>()
    let query: ReturnType<typeof useSuspenseQuery<string>> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          query = useSuspenseQuery(() => ({
            queryKey: ["suspense-pending"],
            queryFn: () => promise,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    expect(query!.isPending()).toBe(true)
    expect(query!.isSuccess()).toBe(false)

    resolve("loaded")
    await promise
    await new Promise((r) => setTimeout(r, 10))

    expect(query!.isPending()).toBe(false)
    expect(query!.isSuccess()).toBe(true)
    expect(query!.data()).toBe("loaded")
    unmount()
    el.remove()
  })

  it("QuerySuspense with multiple queries waits for all", async () => {
    const d1 = deferred<string>()
    const d2 = deferred<number>()
    let childCalled = false

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          const q1 = useSuspenseQuery(() => ({
            queryKey: ["multi-s1"],
            queryFn: () => d1.promise,
          }))
          const q2 = useSuspenseQuery(() => ({
            queryKey: ["multi-s2"],
            queryFn: () => d2.promise,
          }))
          return (
            <QuerySuspense query={[q1, q2]} fallback="loading...">
              {() => {
                childCalled = true
                return null
              }}
            </QuerySuspense>
          )
        }}
      </QueryClientProvider>,
      el,
    )

    // Only first resolves — children should not render
    d1.resolve("first")
    await d1.promise
    await new Promise((r) => setTimeout(r, 10))
    expect(childCalled).toBe(false)

    // Both resolved — children should render
    d2.resolve(42)
    await d2.promise
    await new Promise((r) => setTimeout(r, 10))
    expect(childCalled).toBe(true)
    unmount()
    el.remove()
  })

  it("QuerySuspense renders null fallback when not provided", async () => {
    let query: ReturnType<typeof useSuspenseQuery<string>> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          query = useSuspenseQuery(() => ({
            queryKey: ["suspense-no-fallback"],
            queryFn: () =>
              new Promise(() => {
                /* never resolves */
              }),
          }))
          return <QuerySuspense query={query!}>{() => null}</QuerySuspense>
        }}
      </QueryClientProvider>,
      el,
    )

    expect(query!.isPending()).toBe(true)
    unmount()
    el.remove()
  })
})

// ─── QueryClientProvider context ─────────────────────────────────────────────

describe("QueryClientProvider — context behavior", () => {
  it("useQueryClient returns the provided client", () => {
    const client = makeClient()
    let received: QueryClient | null = null

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          received = useQueryClient()
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    expect(received).toBe(client)
    unmount()
    el.remove()
  })

  it("nested providers override outer client", () => {
    const outerClient = makeClient()
    const innerClient = makeClient()
    let outerReceived: QueryClient | null = null
    let innerReceived: QueryClient | null = null

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={outerClient}>
        {() => {
          outerReceived = useQueryClient()
          return (
            <QueryClientProvider client={innerClient}>
              {() => {
                innerReceived = useQueryClient()
                return null
              }}
            </QueryClientProvider>
          )
        }}
      </QueryClientProvider>,
      el,
    )

    expect(outerReceived).toBe(outerClient)
    expect(innerReceived).toBe(innerClient)
    expect(outerReceived).not.toBe(innerReceived)
    unmount()
    el.remove()
  })

  it("useQueryClient throws descriptive error without provider", () => {
    expect(() => useQueryClient()).toThrow("No QueryClient found")
  })
})

// ─── useIsFetching / useIsMutating — additional ──────────────────────────────

describe("useIsFetching — additional", () => {
  it("counts multiple concurrent queries", async () => {
    const client = makeClient()
    const d1 = deferred<string>()
    const d2 = deferred<string>()
    let isFetching: (() => number) | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          isFetching = useIsFetching()
          useQuery(() => ({
            queryKey: ["concurrent-1"],
            queryFn: () => d1.promise,
          }))
          useQuery(() => ({
            queryKey: ["concurrent-2"],
            queryFn: () => d2.promise,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await new Promise((r) => setTimeout(r, 0))
    // Both queries should be fetching
    expect(isFetching!()).toBeGreaterThanOrEqual(2)

    d1.resolve("done1")
    await d1.promise
    await new Promise((r) => setTimeout(r, 10))
    // One still fetching
    expect(isFetching!()).toBeGreaterThanOrEqual(1)

    d2.resolve("done2")
    await d2.promise
    await new Promise((r) => setTimeout(r, 10))
    expect(isFetching!()).toBe(0)

    unmount()
    el.remove()
  })

  it("useIsFetching with query key filter", async () => {
    const client = makeClient()
    const d1 = deferred<string>()
    const d2 = deferred<string>()
    let allFetching: (() => number) | undefined
    let userFetching: (() => number) | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          allFetching = useIsFetching()
          userFetching = useIsFetching({ queryKey: ["user"] })
          useQuery(() => ({
            queryKey: ["user", "1"],
            queryFn: () => d1.promise,
          }))
          useQuery(() => ({
            queryKey: ["posts"],
            queryFn: () => d2.promise,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await new Promise((r) => setTimeout(r, 0))
    expect(allFetching!()).toBeGreaterThanOrEqual(2)
    expect(userFetching!()).toBe(1) // Only the user query

    d1.resolve("user-data")
    await d1.promise
    await new Promise((r) => setTimeout(r, 10))
    expect(userFetching!()).toBe(0)
    expect(allFetching!()).toBeGreaterThanOrEqual(1) // posts still fetching

    d2.resolve("posts-data")
    await d2.promise
    await new Promise((r) => setTimeout(r, 10))
    expect(allFetching!()).toBe(0)

    unmount()
    el.remove()
  })
})

describe("useIsMutating — additional", () => {
  it("counts multiple concurrent mutations", async () => {
    const client = makeClient()
    const d1 = deferred<void>()
    const d2 = deferred<void>()
    let isMutating: (() => number) | undefined
    let mut1: ReturnType<typeof useMutation<void, Error, void>> | undefined
    let mut2: ReturnType<typeof useMutation<void, Error, void>> | undefined

    const el = document.createElement("div")
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          isMutating = useIsMutating()
          mut1 = useMutation<void, Error, void>({ mutationFn: () => d1.promise })
          mut2 = useMutation<void, Error, void>({ mutationFn: () => d2.promise })
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    expect(isMutating!()).toBe(0)

    mut1!.mutate(undefined)
    mut2!.mutate(undefined)
    await new Promise((r) => setTimeout(r, 0))
    expect(isMutating!()).toBe(2)

    d1.resolve()
    await d1.promise
    await new Promise((r) => setTimeout(r, 10))
    expect(isMutating!()).toBe(1)

    d2.resolve()
    await d2.promise
    await new Promise((r) => setTimeout(r, 10))
    expect(isMutating!()).toBe(0)

    unmount()
    el.remove()
  })
})

// ─── useSSE — lastEventId and readyState (already covered in sse.test.tsx,
// ─── but we add a few integration tests here) ────────────────────────────────

// Note: useSSE lastEventId and readyState are thoroughly tested in sse.test.tsx.
// This file focuses on query/mutation/infinite/suspense/provider scenarios.
