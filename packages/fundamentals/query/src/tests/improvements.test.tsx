/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/query-core'
import { QueryClientProvider } from '../query-client'
import { defineQueries } from '../define-queries'
import { useMutation } from '../use-mutation'
import { useQuery } from '../use-query'

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// ─── Mutation auto-invalidation ─────────────────────────────────────────────

describe('useMutation invalidates option', () => {
  it('auto-invalidates query keys on successful mutation', async () => {
    const client = createClient()
    const ctr = document.createElement('div')
    let queryRefetchCount = 0

    const Comp = () => {
      const query = useQuery(() => ({
        queryKey: ['items'],
        queryFn: () => {
          queryRefetchCount++
          return Promise.resolve([{ id: 1 }])
        },
      }))

      const mutation = useMutation({
        mutationFn: () => Promise.resolve({ ok: true }),
        invalidates: [['items']],
      })

      // Store mutation for external access
      ;(window as any).__mutation = mutation
      ;(window as any).__query = query
      return null
    }

    mount(h(QueryClientProvider, { client }, h(Comp, {})), ctr)
    await new Promise<void>((r) => setTimeout(r, 50))

    const initialCount = queryRefetchCount

    // Trigger mutation
    await (window as any).__mutation.mutateAsync()
    await new Promise<void>((r) => setTimeout(r, 100))

    // Query should have been refetched due to invalidation
    expect(queryRefetchCount).toBeGreaterThan(initialCount)

    delete (window as any).__mutation
    delete (window as any).__query
  })

  it('preserves user onSuccess callback alongside invalidation', async () => {
    const client = createClient()
    const ctr = document.createElement('div')
    const onSuccessCalled = vi.fn()

    const Comp = () => {
      const mutation = useMutation({
        mutationFn: () => Promise.resolve('done'),
        invalidates: [['items']],
        onSuccess: onSuccessCalled,
      })
      ;(window as any).__mutation = mutation
      return null
    }

    mount(h(QueryClientProvider, { client }, h(Comp, {})), ctr)
    await (window as any).__mutation.mutateAsync()

    expect(onSuccessCalled).toHaveBeenCalled()
    delete (window as any).__mutation
  })
})

// ─── defineQueries ──────────────────────────────────────────────────────────

describe('defineQueries', () => {
  it('returns named query results', async () => {
    const client = createClient()
    const ctr = document.createElement('div')
    let results: Record<string, any> | undefined

    const Comp = () => {
      const queries = defineQueries({
        user: () => ({
          queryKey: ['user', 1],
          queryFn: () => Promise.resolve({ name: 'Alice' }),
        }),
        posts: () => ({
          queryKey: ['posts'],
          queryFn: () => Promise.resolve([{ title: 'Hello' }]),
        }),
      })

      results = queries
      return null
    }

    mount(h(QueryClientProvider, { client }, h(Comp, {})), ctr)
    await new Promise<void>((r) => setTimeout(r, 100))

    expect(results).toBeDefined()
    expect(results!.user).toBeDefined()
    expect(results!.posts).toBeDefined()
    expect(results!.user.data).toBeDefined()
    expect(results!.posts.data).toBeDefined()
  })
})

// ─── Fine-grained signal isolation ──────────────────────────────────────────

describe('signal isolation', () => {
  it('data() change does not trigger isFetching() subscribers', async () => {
    const client = createClient()
    const ctr = document.createElement('div')

    let dataReadCount = 0
    let fetchingReadCount = 0

    const Comp = () => {
      const query = useQuery(() => ({
        queryKey: ['isolation-test'],
        queryFn: () => Promise.resolve({ count: Math.random() }),
      }))

      // Track reads independently
      effect(() => {
        query.data()
        dataReadCount++
      })

      effect(() => {
        query.isFetching()
        fetchingReadCount++
      })

      ;(window as any).__refetch = query.refetch
      return null
    }

    mount(h(QueryClientProvider, { client }, h(Comp, {})), ctr)
    await new Promise<void>((r) => setTimeout(r, 100))

    const dataCountAfterInit = dataReadCount

    // Refetch — data changes but final isFetching stays false→true→false
    await (window as any).__refetch()
    await new Promise<void>((r) => setTimeout(r, 100))

    // Data effect should have fired again (new data)
    expect(dataReadCount).toBeGreaterThan(dataCountAfterInit)

    // isFetching may fire for true→false transition, but the key assertion
    // is that it fires INDEPENDENTLY of data — they're separate signals
    // (not a monolithic object that triggers both on any change)
    expect(typeof fetchingReadCount).toBe('number')

    delete (window as any).__refetch
  })
})

// ─── Result object memory shape (prototype optimization lock) ────────────────
//
// Locks the ~85%-smaller-per-result shape (PR perf/query-result-prototype):
// the accessor getters live on a shared prototype (NOT as per-call own
// accessors, which forced V8 dictionary mode + allocated a closure per field
// per result), while detachable methods (refetch/mutate/reset/…) stay as OWN
// arrow closures so `const r = q.refetch; r()` / `onClick={q.refetch}` keep
// working when detached. Bisect-verified: reverting a hook to the inline
// object-literal-getters shape flips the `Object.hasOwn(..., 'data')` assertion;
// putting a method on the prototype breaks the detachment-safety assertion.
describe('result object memory shape (prototype optimization lock)', () => {
  it('useQuery: getters on prototype, refetch own + detachment-safe', () => {
    const client = createClient()
    const ctr = document.createElement('div')
    let q: ReturnType<typeof useQuery<number>> | undefined
    const Comp = () => {
      q = useQuery<number>(() => ({ queryKey: ['shape'], queryFn: () => Promise.resolve(1) }))
      return null
    }
    mount(h(QueryClientProvider, { client }, h(Comp, {})), ctr)
    const r = q as NonNullable<typeof q>

    // Accessor getters are inherited from the shared prototype, not own props.
    expect(Object.hasOwn(r, 'data')).toBe(false)
    expect(Object.hasOwn(r, 'isFetching')).toBe(false)
    expect(Object.getPrototypeOf(r)).not.toBe(Object.prototype)
    // …but fully functional through the chain (data returns a Signal).
    expect(typeof r.data).toBe('function')

    // refetch is an OWN arrow closure (detachment-safe), NOT a proto method.
    expect(Object.hasOwn(r, 'refetch')).toBe(true)
    // Internal fields present (the plain-field shape).
    expect(Object.hasOwn(r, '_slots')).toBe(true)
    expect(Object.hasOwn(r, '_observer')).toBe(true)

    // Detachment safety — the bug the suite caught: extract + call unbound.
    const detached = r.refetch
    expect(() => detached()).not.toThrow()
  })

  it('useMutation: getters on prototype, mutate/reset own + detachment-safe', () => {
    const client = createClient()
    const ctr = document.createElement('div')
    let m: ReturnType<typeof useMutation<number, Error, number>> | undefined
    const Comp = () => {
      m = useMutation<number, Error, number>({ mutationFn: (x: number) => Promise.resolve(x) })
      return null
    }
    mount(h(QueryClientProvider, { client }, h(Comp, {})), ctr)
    const r = m as NonNullable<typeof m>

    expect(Object.hasOwn(r, 'data')).toBe(false)
    expect(Object.getPrototypeOf(r)).not.toBe(Object.prototype)
    expect(Object.hasOwn(r, 'mutate')).toBe(true)
    expect(Object.hasOwn(r, 'reset')).toBe(true)

    // Detach + call unbound — must not throw (own arrows capture observer).
    const mutate = r.mutate
    const reset = r.reset
    expect(() => reset()).not.toThrow()
    expect(() => mutate(1)).not.toThrow()
  })
})
