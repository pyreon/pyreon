/**
 * Compile-time tests: `select` changes the result type without casts, and
 * `useQueries` infers each query's data type. The bodies are type-checked by
 * `tsc` (the package's `typecheck`); they are never called at runtime — the
 * hooks need a mounted QueryClientProvider.
 */

import type { Signal } from '@pyreon/reactivity'
import type { QueryObserverResult } from '@tanstack/query-core'
import { describe, expectTypeOf, it } from 'vitest'
import { useQueries, useQuery, useSuspenseQuery } from '../index'

interface User {
  id: number
  name: string
}
const fetchUser = async (): Promise<User> => ({ id: 1, name: 'a' })

describe('useQuery — select changes the data type', () => {
  it('infers TData from select, TQueryFnData from queryFn', () => {
    const typeOnly = () => {
      const q = useQuery(() => ({
        queryKey: ['user'],
        queryFn: fetchUser,
        select: (u) => {
          expectTypeOf(u).toEqualTypeOf<User>()
          return u.name
        },
      }))
      expectTypeOf(q.data).toEqualTypeOf<Signal<string | undefined>>()
    }
    void typeOnly
  })

  it('without select, data is the queryFn result', () => {
    const typeOnly = () => {
      const q = useQuery(() => ({ queryKey: ['user'], queryFn: fetchUser }))
      expectTypeOf(q.data).toEqualTypeOf<Signal<User | undefined>>()
    }
    void typeOnly
  })

  it('a single explicit generic still means the data type (back-compat)', () => {
    const typeOnly = () => {
      const q = useQuery<User>(() => ({ queryKey: ['user'], queryFn: fetchUser }))
      expectTypeOf(q.data).toEqualTypeOf<Signal<User | undefined>>()
    }
    void typeOnly
  })

  it('useSuspenseQuery narrows the selected type too', () => {
    const typeOnly = () => {
      const q = useSuspenseQuery(() => ({
        queryKey: ['user'],
        queryFn: fetchUser,
        select: (u) => u.id,
      }))
      expectTypeOf(q.data).toEqualTypeOf<Signal<number>>()
    }
    void typeOnly
  })
})

describe('useQueries — per-query result types', () => {
  it('a tuple of queries yields a tuple of typed results', () => {
    const typeOnly = () => {
      const results = useQueries(() => [
        { queryKey: ['user'], queryFn: fetchUser },
        { queryKey: ['count'], queryFn: async () => 42 },
        { queryKey: ['name'], queryFn: fetchUser, select: (u: User) => u.name },
      ])
      expectTypeOf(results()[0]).toEqualTypeOf<QueryObserverResult<User>>()
      expectTypeOf(results()[1]).toEqualTypeOf<QueryObserverResult<number>>()
      expectTypeOf(results()[2]).toEqualTypeOf<QueryObserverResult<string>>()
    }
    void typeOnly
  })

  it('a mapped array yields an array of typed results', () => {
    const typeOnly = (ids: number[]) => {
      const results = useQueries(() => ids.map((id) => ({ queryKey: ['user', id], queryFn: fetchUser })))
      expectTypeOf(results()).toEqualTypeOf<QueryObserverResult<User>[]>()
    }
    void typeOnly
  })

  it('still assignable to the old untyped shape', () => {
    const typeOnly = () => {
      const results = useQueries(() => [{ queryKey: ['user'], queryFn: fetchUser }])
      const loose: Signal<QueryObserverResult[]> = results
      void loose
    }
    void typeOnly
  })
})
