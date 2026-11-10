/**
 * `queryOptions` / `infiniteQueryOptions` / `mutationOptions` — declare once,
 * reuse in the hooks AND the imperative QueryClient API with the data type
 * carried by the tagged `queryKey`.
 */
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import type { InfiniteData } from '@tanstack/query-core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  infiniteQueryOptions,
  mutationOptions,
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '../index'

interface User {
  id: number
  name: string
}

const userQuery = (id: number) =>
  queryOptions({
    queryKey: ['user', id] as const,
    queryFn: async (): Promise<User> => ({ id, name: `user-${id}` }),
  })

const tick = () => new Promise((r) => setTimeout(r, 0))

function withClient(client: QueryClient, fn: () => void) {
  const el = document.createElement('div')
  const Probe = () => {
    fn()
    return null
  }
  const dispose = mount(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
    el,
  )
  return dispose
}

describe('queryOptions', () => {
  it('returns the options object unchanged', () => {
    const fn = async () => 1
    const opts = { queryKey: ['n'], queryFn: fn, staleTime: 5 }
    expect(queryOptions(opts)).toBe(opts)
  })

  it('types getQueryData / setQueryData through the tagged key', async () => {
    const client = new QueryClient()
    await client.prefetchQuery(userQuery(1))
    const cached = client.getQueryData(userQuery(1).queryKey)
    expectTypeOf(cached).toEqualTypeOf<User | undefined>()
    expect(cached).toEqual({ id: 1, name: 'user-1' })

    client.setQueryData(userQuery(2).queryKey, { id: 2, name: 'set' })
    expect(client.getQueryData(userQuery(2).queryKey)?.name).toBe('set')
  })

  it('drives useQuery reactively when the factory is called inside the accessor', async () => {
    const client = new QueryClient()
    const id = signal(1)
    let result: ReturnType<typeof useQuery<User>> | undefined
    const dispose = withClient(client, () => {
      result = useQuery(() => userQuery(id()))
    })
    await tick()
    expect(result!.data()?.name).toBe('user-1')
    expectTypeOf(result!.data()).toEqualTypeOf<User | undefined>()

    id.set(3)
    await tick()
    await tick()
    expect(result!.data()?.name).toBe('user-3')
    dispose()
  })
})

describe('infiniteQueryOptions', () => {
  it('tags the key with InfiniteData and works in useInfiniteQuery', async () => {
    const feed = infiniteQueryOptions({
      queryKey: ['feed'],
      queryFn: async ({ pageParam }: { pageParam: number }) => ({ items: [pageParam], next: pageParam + 1 }),
      initialPageParam: 0,
      getNextPageParam: (last) => last.next,
    })
    const client = new QueryClient()
    let q: ReturnType<typeof useInfiniteQuery> | undefined
    const dispose = withClient(client, () => {
      q = useInfiniteQuery(() => feed)
    })
    await tick()
    expect(q!.data()?.pages).toEqual([{ items: [0], next: 1 }])

    const cached = client.getQueryData(feed.queryKey)
    expectTypeOf(cached).toEqualTypeOf<InfiniteData<{ items: number[]; next: number }, number> | undefined>()
    expect(cached?.pageParams).toEqual([0])
    dispose()
  })
})

describe('mutationOptions', () => {
  it('returns the options unchanged and infers variables for useMutation', async () => {
    const seen: string[] = []
    const createPost = mutationOptions({
      mutationFn: async (title: string) => {
        seen.push(title)
        return { ok: true }
      },
    })
    expect(mutationOptions(createPost)).toBe(createPost)

    const client = new QueryClient()
    let m: ReturnType<typeof useMutation<{ ok: boolean }, Error, string>> | undefined
    const dispose = withClient(client, () => {
      m = useMutation(createPost)
    })
    const out = await m!.mutateAsync('hello')
    expectTypeOf(out).toEqualTypeOf<{ ok: boolean }>()
    expect(out).toEqual({ ok: true })
    expect(seen).toEqual(['hello'])
    dispose()
  })
})
