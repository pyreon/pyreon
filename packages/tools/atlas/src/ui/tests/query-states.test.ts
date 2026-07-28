/**
 * Query states — the four states every data component has.
 *
 * The assertions are about the SHAPE being faithful to TanStack's, because the
 * whole value is that a component branching on `isLoading` / `isFetching` /
 * `status` behaves here exactly as it will against a real query.
 */
import { describe, expect, it } from 'vitest'
import { EXPECTED, makeQueryResult, QUERY_STATES, queryStateById } from '../query-states'

const DATA = { rows: [1, 2, 3] }

describe('the presets', () => {
  it('covers the four states, in request order', () => {
    expect(QUERY_STATES.map((s) => s.id)).toEqual(['loading', 'success', 'error', 'refetching'])
  })

  it('falls back to loading for an unknown id rather than throwing', () => {
    expect(queryStateById('nope' as never).id).toBe('loading')
  })

  it('says what the component should show in each state', () => {
    for (const s of QUERY_STATES) expect(EXPECTED[s.id]).toBeTruthy()
  })
})

describe('loading', () => {
  it('has no data, is pending, and IS loading', () => {
    const q = makeQueryResult('loading', DATA)
    expect(q.data()).toBeUndefined()
    expect(q.status()).toBe('pending')
    expect(q.isPending()).toBe(true)
    expect(q.isLoading()).toBe(true)
    expect(q.isFetching()).toBe(true)
    expect(q.isSuccess()).toBe(false)
    expect(q.isError()).toBe(false)
  })
})

describe('success', () => {
  it('has data and is not fetching', () => {
    const q = makeQueryResult('success', DATA)
    expect(q.data()).toEqual(DATA)
    expect(q.status()).toBe('success')
    expect(q.isSuccess()).toBe(true)
    expect(q.isFetching()).toBe(false)
    expect(q.error()).toBeNull()
  })
})

describe('error', () => {
  it('carries an error and NO data', () => {
    const q = makeQueryResult('error', DATA)
    expect(q.data()).toBeUndefined()
    expect(q.status()).toBe('error')
    expect(q.isError()).toBe(true)
    expect(q.error()).toBeInstanceOf(Error)
  })
})

describe('refetching — the state hand-written stories get wrong', () => {
  it('keeps status success AND the previous data while fetching', () => {
    // TanStack does not revert to `pending` on a refetch. A component that
    // renders a spinner instead of the stale rows here has a real bug, and it
    // is invisible if "refetching" is modelled as loading-with-no-data.
    const q = makeQueryResult('refetching', DATA)
    expect(q.status()).toBe('success')
    expect(q.data()).toEqual(DATA)
    expect(q.isSuccess()).toBe(true)
    expect(q.isFetching()).toBe(true)
  })

  it('is NOT isLoading — that is first-load only', () => {
    // The distinction this panel exists to make visible.
    const q = makeQueryResult('refetching', DATA)
    expect(q.isLoading()).toBe(false)
    expect(q.isPending()).toBe(false)
    expect(makeQueryResult('loading', DATA).isLoading()).toBe(true)
  })
})
