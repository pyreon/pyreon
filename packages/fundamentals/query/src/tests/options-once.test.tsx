import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import {
  QueryClientProvider,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from '../index'

function mountWith(component: () => void): () => void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    <QueryClientProvider client={client}>
      {() => {
        component()
        return null
      }}
    </QueryClientProvider>,
    el,
  )
  return () => {
    unmount()
    el.remove()
  }
}

const queryFn = () => new Promise<number>(() => {})

describe('the options builder runs ONCE per change — not twice at mount', () => {
  const cases: Array<[string, (key: () => number, count: () => void) => void]> = [
    ['useQuery', (key, count) => void useQuery(() => (count(), { queryKey: ['q', key()], queryFn }))],
    [
      'useSuspenseQuery',
      (key, count) => void useSuspenseQuery(() => (count(), { queryKey: ['s', key()], queryFn })),
    ],
    [
      'useInfiniteQuery',
      (key, count) =>
        void useInfiniteQuery(() => (count(), {
          queryKey: ['i', key()],
          queryFn,
          initialPageParam: 0,
          getNextPageParam: () => undefined,
        })),
    ],
    [
      'useSuspenseInfiniteQuery',
      (key, count) =>
        void useSuspenseInfiniteQuery(() => (count(), {
          queryKey: ['si', key()],
          queryFn,
          initialPageParam: 0,
          getNextPageParam: () => undefined,
        })),
    ],
    ['useQueries', (key, count) => void useQueries(() => (count(), [{ queryKey: ['a', key()], queryFn }]))],
    [
      'useSuspenseQueries',
      (key, count) => void useSuspenseQueries(() => (count(), [{ queryKey: ['b', key()], queryFn }])),
    ],
  ]

  it.each(cases)('%s', (_name, use) => {
    const key = signal(0)
    let calls = 0
    const unmount = mountWith(() => use(() => key(), () => void calls++))
    expect(calls).toBe(1)

    // Still reactive: a tracked read inside the builder re-runs it once.
    key.set(1)
    expect(calls).toBe(2)
    unmount()
  })
})
