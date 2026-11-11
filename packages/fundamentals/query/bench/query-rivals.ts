/**
 * @pyreon/query vs TanStack react-query, SWR and Apollo Client — ⚠ happy-dom.
 *
 * Run: `bun run bench:rivals` (from packages/fundamentals/query). Harness and
 * measurement contract: `scripts/bench/rivals-harness.ts` (one process per
 * op × arm × round, cluster-bootstrap CI95 over processes, gate before timing).
 *
 * WHAT IS COMPARED — the full stack a user ships to put CACHED server data on
 * screen, because that is the only layer where Pyreon has its own code. Pyreon
 * query wraps `@tanstack/query-core`, so a bare cache read/write race
 * (`getQueryData` vs SWR's cache vs Apollo's `readQuery`) would time TanStack's
 * engine, not Pyreon. Each arm therefore goes cache → component → DOM text:
 *  - `cache write → DOM`: write new data for a key that one mounted component
 *    displays, and surface it in the DOM synchronously.
 *  - `mount+unmount (cache hit)`: mount a component that reads an already
 *    cached key (no fetch), render it to the DOM, unmount.
 * Every arm displays the same JSON text for the data, read back by the gate.
 *
 * Idiomatic per library (one component reading `data`):
 *  - Pyreon: `useQuery(() => ({ queryKey, queryFn, staleTime: Infinity }))`
 *    under `QueryClientProvider`; write with `client.setQueryData`.
 *  - react-query: the same options through `@tanstack/react-query`; write with
 *    `setQueryData`. https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientsetquerydata
 *  - SWR: `useSWRImmutable(key, fetcher)` (SWR's documented equivalent of
 *    `staleTime: Infinity`), cache seeded and written with the global
 *    `mutate(key, data, { revalidate: false })`.
 *    https://swr.vercel.app/docs/revalidation#disable-automatic-revalidations ·
 *    https://swr.vercel.app/docs/mutation#mutate
 *  - Apollo Client: `InMemoryCache` + `client.writeQuery`, read with
 *    `useQuery(QUERY, { fetchPolicy: 'cache-only' })` from
 *    `@apollo/client/react`; no network link is reached
 *    (`ApolloLink.empty()`). Apollo NORMALIZES writes into its entity store
 *    (`__typename` + `id`) and re-reads the query from it — more work per
 *    write than a key→value cache, which is its documented design.
 *    https://www.apollographql.com/docs/react/caching/cache-interaction#writequery
 *
 * Apollo delivers a cache write to `useQuery` one microtask later, so the write
 * op awaits ONE microtask in every arm before committing (equal overhead).
 *
 * React commits: React batches the update a cache write schedules. Like
 * `query-bench.ts`, every React arm forces it synchronously with
 * `flushSync(() => root.render(tree))`, so the timed window holds the
 * re-render work rather than scheduler latency. Pyreon's update is synchronous.
 * React arms mount into ONE warm root (createRoot is per app, not per widget).
 *
 * Skipped: urql. `@urql/core`'s default document cache has no imperative write
 * (data enters only as an operation result through the exchange pipeline), and
 * Graphcache exposes writes only inside exchange `updates` callbacks, so there
 * is no idiomatic "write this key, show it" path to set against
 * `setQueryData`. A fetch-driven comparison would time the exchange pipeline
 * and promise scheduling, not cache → DOM.
 *
 * ⚠ happy-dom is a JavaScript DOM, not a browser: relative work is meaningful,
 * absolute times are not.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { runRivalBench, type Arm, type ArmFn } from '../../../../scripts/bench/rivals-harness'

GlobalRegistrator.register()
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

type Id = 'pyreon' | 'react-query' | 'swr' | 'apollo'
const ARMS: readonly Arm<Id>[] = [
  { id: 'pyreon', label: 'Pyreon (@pyreon/query)' },
  { id: 'react-query', label: 'TanStack react-query', pkg: '@tanstack/react-query' },
  { id: 'swr', label: 'SWR', pkg: 'swr' },
  { id: 'apollo', label: 'Apollo Client', pkg: '@apollo/client' },
]

let sink = 0
const KEY = 'bench-item'
type Item = { __typename: 'Item'; id: string; v: number }
const item = (v: number): Item => ({ __typename: 'Item', id: '1', v })
const text = (d: Item | undefined | null) => (d ? `v=${d.v}` : 'none')

/** One mounted component showing KEY; `write(v)` updates it and commits to the DOM. */
interface Harness {
  read(): string
  /** Write, yield ONE microtask (every arm), then commit. */
  write(v: number): Promise<void>
  /** Mount a fresh reader of the cached key, commit, unmount. Returns the text it rendered. */
  mountOnce(): string
}

async function harness(id: Id): Promise<Harness> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const scratch = document.createElement('div')
  document.body.appendChild(scratch)

  if (id === 'pyreon') {
    const { h } = await import('@pyreon/core')
    const { mount } = await import('@pyreon/runtime-dom')
    const { QueryClient } = await import('@tanstack/query-core')
    const { QueryClientProvider, useQuery } = await import('../src/index')
    const client = new QueryClient()
    client.setQueryData([KEY], item(0))
    const Comp = () => {
      const q = useQuery<Item>(() => ({
        queryKey: [KEY],
        queryFn: () => Promise.resolve(item(0)),
        staleTime: Number.POSITIVE_INFINITY,
      }))
      return h('span', null, () => text(q.data()))
    }
    mount(h(QueryClientProvider, { client }, h(Comp, {})), container)
    return {
      read: () => container.textContent ?? '',
      write: async (v) => {
        client.setQueryData([KEY], item(v))
        await Promise.resolve()
      },
      mountOnce: () => {
        const dispose = mount(h(QueryClientProvider, { client }, h(Comp, {})), scratch)
        const t = scratch.textContent ?? ''
        if (typeof dispose === 'function') dispose()
        return t
      },
    }
  }

  const React = (await import('react')).default
  const { createElement: h } = React
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')
  const root = createRoot(container)
  const scratchRoot = createRoot(scratch)
  let Tree: () => React.ReactElement
  let write: (v: number) => void

  if (id === 'react-query') {
    const { QueryClient, QueryClientProvider, useQuery } = await import('@tanstack/react-query')
    const client = new QueryClient()
    client.setQueryData([KEY], item(0))
    const Comp = () => {
      const q = useQuery({
        queryKey: [KEY],
        queryFn: () => Promise.resolve(item(0)),
        staleTime: Number.POSITIVE_INFINITY,
      })
      return h('span', null, text(q.data))
    }
    Tree = () => h(QueryClientProvider, { client }, h(Comp))
    write = (v) => client.setQueryData([KEY], item(v))
  } else if (id === 'swr') {
    const { mutate } = await import('swr')
    const useSWRImmutable = (await import('swr/immutable')).default
    await mutate(KEY, item(0), { revalidate: false })
    const fetcher = () => Promise.resolve(item(0))
    const Comp = () => {
      const { data } = useSWRImmutable<Item>(KEY, fetcher)
      return h('span', null, text(data))
    }
    Tree = () => h(Comp)
    write = (v) => {
      void mutate(KEY, item(v), { revalidate: false })
    }
  } else {
    const { ApolloClient, ApolloLink, InMemoryCache, gql } = await import('@apollo/client')
    const { ApolloProvider, useQuery } = await import('@apollo/client/react')
    const QUERY = gql`
      query Item {
        item {
          id
          v
        }
      }
    `
    const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() })
    client.writeQuery({ query: QUERY, data: { item: item(0) } })
    const Comp = () => {
      const { data } = useQuery<{ item: Item }>(QUERY, { fetchPolicy: 'cache-only' })
      return h('span', null, text(data?.item))
    }
    Tree = () => h(ApolloProvider, { client }, h(Comp))
    write = (v) => client.writeQuery({ query: QUERY, data: { item: item(v) } })
  }

  flushSync(() => root.render(Tree()))
  // Subscriptions attach in passive effects — let the mount settle.
  await new Promise((r) => setTimeout(r, 0))
  return {
    read: () => container.textContent ?? '',
    write: async (v) => {
      write(v)
      await Promise.resolve()
      flushSync(() => root.render(Tree()))
    },
    mountOnce: () => {
      flushSync(() => scratchRoot.render(Tree()))
      const t = scratch.textContent ?? ''
      flushSync(() => scratchRoot.render(null))
      return t
    },
  }
}

await runRivalBench<Id>({
  title: '@pyreon/query vs react-query / SWR / Apollo Client — ⚠ happy-dom',
  file: import.meta.path,
  pyreon: 'pyreon',
  arms: ARMS,
  sink: () => sink,
  ops: {
    'cache write → DOM': {
      note: 'one mounted reader; write new data for its key, yield one microtask (Apollo delivers on one), commit (React arms: flushSync)',
      async: true,
      iters: 300,
      runs: 15,
      warmup: 1_000,
      make: async (id): Promise<ArmFn> => {
        const hn = await harness(id)
        let i = 0
        return async () => {
          await hn.write(++i)
          sink += hn.read().length
        }
      },
    },
    'mount+unmount (cache hit)': {
      note: 'mount a reader of an already-cached key, render, unmount (React arms reuse one warm root)',
      iters: 100,
      runs: 15,
      warmup: 500,
      make: async (id): Promise<ArmFn> => {
        const hn = await harness(id)
        return () => {
          sink += hn.mountOnce().length
        }
      },
    },
  },
  gate: async () => {
    for (const arm of ARMS) {
      const hn = await harness(arm.id)
      const fail = (what: string, got: string) => {
        throw new Error(`[correctness] ${arm.label}: ${what} — DOM reads "${got}"`)
      }
      if (hn.read() !== 'v=0') fail('initial cached data', hn.read())
      await hn.write(7)
      if (hn.read() !== 'v=7') fail('write(7) committed', hn.read())
      await hn.write(8)
      if (hn.read() !== 'v=8') fail('write(8) committed', hn.read())
      const m = hn.mountOnce()
      if (m !== 'v=8') fail('fresh mount reads the cached value', m)
    }
  },
  footnotes: [
    '⚠ happy-dom. React arms include React render + reconcile (that is how they surface a cache change). Apollo additionally normalizes each write. urql skipped: no imperative cache write in its documented API (see header).',
  ],
})
