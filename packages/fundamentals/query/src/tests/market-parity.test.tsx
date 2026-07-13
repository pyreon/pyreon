/**
 * Market-parity tests — consumer-shaped coverage for TanStack-adapter-family
 * capabilities the README/docs matrix claims but that the existing suite did
 * not exercise directly through the Pyreon adapter: `select`, `placeholderData`
 * / `keepPreviousData` on a reactive key change, and optimistic `onMutate`
 * updates with rollback. All flow through query-core via `QueryObserverOptions`
 * pass-through — these lock that the adapter doesn't drop them.
 */
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { keepPreviousData, QueryClient } from '@tanstack/query-core'
import { QueryClientProvider, useMutation, useQuery } from '../index'

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  })
}

const tick = (ms = 10) => new Promise<void>((r) => setTimeout(r, ms))

describe('select — query-core transform passes through the adapter', () => {
  it('data() reflects the selected/derived value, not the raw payload', async () => {
    const client = makeClient()
    let query: ReturnType<typeof useQuery<string>> | undefined
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          query = useQuery<string, Error>(() => ({
            queryKey: ['sel'],
            // raw payload is an object; `select` narrows to the name string
            queryFn: async () => ({ id: 1, name: 'Alice' }) as unknown as string,
            select: (raw: unknown) => (raw as { name: string }).name,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )
    await tick()
    expect(query!.data()).toBe('Alice')
    unmount?.()
    el.remove()
  })
})

describe('placeholderData: keepPreviousData — reactive key change keeps prior data', () => {
  it('data() holds the previous page while the new key fetches', async () => {
    const client = makeClient()
    const page = signal(1)
    let resolvers: Array<(v: string) => void> = []
    let query: ReturnType<typeof useQuery<string>> | undefined
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          query = useQuery<string, Error>(() => ({
            queryKey: ['page', page()],
            queryFn: () =>
              new Promise<string>((res) => {
                resolvers.push(res)
              }),
            placeholderData: keepPreviousData,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )
    // resolve page 1
    await tick(0)
    resolvers[0]!('page-1')
    await tick()
    expect(query!.data()).toBe('page-1')

    // switch to page 2 — its fetch is in flight, so keepPreviousData keeps page-1
    page.set(2)
    await tick()
    expect(query!.data()).toBe('page-1') // previous data retained, not undefined
    expect(query!.isFetching()).toBe(true)

    // resolve page 2 — data advances
    resolvers[resolvers.length - 1]!('page-2')
    await tick()
    expect(query!.data()).toBe('page-2')

    unmount?.()
    el.remove()
  })
})

describe('optimistic update — onMutate writes the cache, error rolls back', () => {
  it('setQueryData in onMutate applies immediately; onError restores the snapshot', async () => {
    const client = makeClient()
    const KEY = ['todos']
    client.setQueryData(KEY, ['a'])

    let readData: () => string[] | undefined = () => undefined
    let mutation: ReturnType<typeof useMutation<unknown, Error, string, { prev: string[] }>> | undefined
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          const q = useQuery<string[], Error>(() => ({
            queryKey: KEY,
            queryFn: async () => (client.getQueryData(KEY) as string[]) ?? [],
            staleTime: Number.POSITIVE_INFINITY,
          }))
          readData = () => q.data()
          mutation = useMutation<unknown, Error, string, { prev: string[] }>({
            // Delay the rejection so the optimistic window is observable
            // (an instant reject collapses onMutate → onError into one tick).
            mutationFn: () =>
              new Promise((_res, rej) => setTimeout(() => rej(new Error('server down')), 30)),
            onMutate: (next: string) => {
              const prev = (client.getQueryData(KEY) as string[]) ?? []
              client.setQueryData(KEY, [...prev, next]) // optimistic
              return { prev }
            },
            onError: (_e, _v, ctx) => {
              if (ctx) client.setQueryData(KEY, ctx.prev) // rollback
            },
          })
          return null
        }}
      </QueryClientProvider>,
      el,
    )
    await tick()
    expect(readData()).toEqual(['a'])

    // fire the failing mutation — optimistic write lands, then rolls back
    mutation!.mutate('b')
    await tick(10)
    expect(readData()).toEqual(['a', 'b']) // optimistic value applied (before reject)

    await tick(40)
    expect(readData()).toEqual(['a']) // rolled back after the mutation rejected
    expect(mutation!.isError()).toBe(true)

    unmount?.()
    el.remove()
  })
})
