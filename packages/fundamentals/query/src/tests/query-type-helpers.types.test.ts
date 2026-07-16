/**
 * Compile-time type tests for `QueryData<R>` / `QueryError<R>` — unwrapping
 * the Pyreon adapter's fine-grained result shapes. (Tagged query-key
 * inference is TanStack's own `InferDataFromTag` — deliberately not
 * duplicated here.)
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { InfiniteData } from '@tanstack/query-core'
import type {
  QueryData,
  QueryError,
  UseInfiniteQueryResult,
  UseQueryResult,
  UseSuspenseQueryResult,
} from '../index'

interface Post {
  id: number
  title: string
}

describe('QueryData — resolved data type of a query result', () => {
  it('unwraps UseQueryResult (no undefined — that is the signal artifact)', () => {
    expectTypeOf<QueryData<UseQueryResult<Post[]>>>().toEqualTypeOf<Post[]>()
    expectTypeOf<QueryData<UseQueryResult<string, Error>>>().toEqualTypeOf<string>()
  })

  it('unwraps UseSuspenseQueryResult', () => {
    expectTypeOf<QueryData<UseSuspenseQueryResult<Post>>>().toEqualTypeOf<Post>()
  })

  it('unwraps infinite results to InfiniteData<Page>', () => {
    expectTypeOf<QueryData<UseInfiniteQueryResult<Post[]>>>().toEqualTypeOf<
      InfiniteData<Post[]>
    >()
  })

  it('resolves to never for non-result inputs (negative)', () => {
    expectTypeOf<QueryData<{ data: Post[] }>>().toEqualTypeOf<never>()
    expectTypeOf<QueryData<Post>>().toEqualTypeOf<never>()
  })

  it('rejects passing the result where the data is expected (negative)', () => {
    const takesData = (_rows: QueryData<UseQueryResult<Post[]>>) => {}
    takesData([{ id: 1, title: 'a' }])
    const partialResult: Partial<UseQueryResult<Post[]>> = {}
    // @ts-expect-error — the RESULT object is not the resolved data type
    takesData(partialResult)
  })
})

describe('QueryError — error type of a query result', () => {
  it('extracts the TError generic', () => {
    class ApiError extends Error {
      code = 0
    }
    expectTypeOf<QueryError<UseQueryResult<Post[], ApiError>>>().toEqualTypeOf<ApiError>()
    // DefaultError default
    expectTypeOf<QueryError<UseQueryResult<Post[]>>>().toEqualTypeOf<Error>()
  })

  it('resolves to never for non-result inputs (negative)', () => {
    expectTypeOf<QueryError<string>>().toEqualTypeOf<never>()
  })
})
