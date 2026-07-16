/**
 * Compile-time type tests for `LoaderData<L>` — deriving a route loader's
 * resolved data type from the loader function itself, plus a coverage lock
 * for `ExtractParams` splat/optional segments (verified as part of the
 * type-helpers audit: the existing type already handles them).
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { ExtractParams, LoaderContext, LoaderData } from '../index'
import { useLoaderData } from '../index'

describe('LoaderData — derive resolved data from the loader fn', () => {
  it('unwraps an async loader (Promise return)', () => {
    const loader = async () => ({ posts: [{ id: 1, title: 'a' }] })
    expectTypeOf<LoaderData<typeof loader>>().toEqualTypeOf<{
      posts: { id: number; title: string }[]
    }>()
  })

  it('unwraps a loader that takes the LoaderContext', () => {
    const loader = async (_ctx: LoaderContext) => ({ user: 'ada' as const })
    expectTypeOf<LoaderData<typeof loader>>().toEqualTypeOf<{ user: 'ada' }>()
  })

  it('passes a sync-returning loader through unchanged', () => {
    const loader = () => ({ count: 1 })
    expectTypeOf<LoaderData<typeof loader>>().toEqualTypeOf<{ count: number }>()
  })

  it('unwraps nested promises via Awaited (edge)', () => {
    const loader = async () => Promise.resolve('deep' as const)
    expectTypeOf<LoaderData<typeof loader>>().toEqualTypeOf<'deep'>()
  })

  it('resolves to never for non-function inputs (negative)', () => {
    expectTypeOf<LoaderData<{ posts: string[] }>>().toEqualTypeOf<never>()
    expectTypeOf<LoaderData<string>>().toEqualTypeOf<never>()
  })

  it('composes with useLoaderData (the intended call shape)', () => {
    const loader = async () => ({ n: 42 })
    type Data = LoaderData<typeof loader>
    // Compile-only contract — never executed (useLoaderData needs a route frame).
    // oxlint-disable-next-line no-unused-vars
    function _contract() {
      const data = useLoaderData<Data>()
      expectTypeOf(data.n).toEqualTypeOf<number>()
      // @ts-expect-error — 'missing' is not on the loader's data
      const _missing = data.missing
    }
  })
})

describe('ExtractParams — splat/optional coverage lock (pre-existing type)', () => {
  it('extracts plain + multiple params', () => {
    expectTypeOf<ExtractParams<'/user/:id/posts/:postId'>>().toEqualTypeOf<
      { id: string } & { postId: string }
    >()
  })

  it('optional params are `string | undefined` with an optional key', () => {
    expectTypeOf<ExtractParams<'/user/:id?'>>().toEqualTypeOf<{ id?: string | undefined }>()
  })

  it('splat (catch-all) params extract — the `[...slug]` → `:slug*` fs-router shape', () => {
    expectTypeOf<ExtractParams<'/blog/:slug*'>>().toEqualTypeOf<{ slug: string }>()
  })

  it('a param-less path yields an empty param record', () => {
    expectTypeOf<keyof ExtractParams<'/about'>>().toEqualTypeOf<never>()
  })
})
