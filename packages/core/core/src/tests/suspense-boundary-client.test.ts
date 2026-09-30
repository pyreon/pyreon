// The CLIENT half of `SuspenseBoundary.register()` — the branch that actually
// increments/decrements `pending()` and calls `settle`. `@pyreon/core` runs in
// Node, so `isServer` (from `@pyreon/reactivity`, `typeof document ===
// 'undefined'`) is a module-level constant evaluated at import time and is
// `true` for every OTHER test file in this package. Stubbing `document`
// BEFORE the first import — vitest isolates each file, so `isServer` is
// evaluated against the stub — is the same technique `color-mode-client.test.ts`
// uses for the same reason.
const g = globalThis as Record<string, unknown>
g.document = {}

const { effectScope, runWithContextOwner, isServer } = await import('@pyreon/reactivity')
const { useContext } = await import('../context')
const { Suspense, SuspenseBoundaryContext, _setSuspenseHydrating } = await import('../suspense')

import type { SuspenseBoundary } from '../suspense'
import type { VNodeChild } from '../types'

function renderWithBoundary(props: { fallback: VNodeChild; children?: VNodeChild }): SuspenseBoundary {
  const scope = effectScope()
  return runWithContextOwner(scope, () => {
    Suspense(props)
    const boundary = useContext(SuspenseBoundaryContext)
    if (boundary === null) throw new Error('Suspense did not provide a boundary')
    return boundary
  })
}

describe('SuspenseBoundary.register(), off the server', () => {
  test('the stub actually flips isServer — otherwise this file proves nothing', () => {
    expect(isServer).toBe(false)
  })

  afterEach(() => {
    _setSuspenseHydrating(false)
  })

  test('registering a pending load increments pending(), settling decrements it', async () => {
    const boundary = renderWithBoundary({ fallback: 'loading' })
    expect(boundary.pending()).toBe(0)

    let resolve!: () => void
    const settled = new Promise<void>((r) => {
      resolve = r
    })
    boundary.register(settled)
    expect(boundary.pending()).toBe(1)

    resolve()
    await settled
    // `settle` runs as a `.then` continuation — flush one more microtask
    // turn so it has run before asserting.
    await Promise.resolve()
    expect(boundary.pending()).toBe(0)
  })

  test('a REJECTING load still settles — "a promise that rejects counts as settled"', async () => {
    const boundary = renderWithBoundary({ fallback: 'loading' })
    let reject!: (e: unknown) => void
    const settled = new Promise<void>((_r, rj) => {
      reject = rj
    })
    // `register()` attaches its own rejection handler (`.then(settle, settle)`)
    // BEFORE this test does, so the rejection is handled from the moment it
    // fires — passing the raw rejecting promise straight through is what
    // actually exercises that second `settle` reference, not a pre-caught one.
    boundary.register(settled)
    expect(boundary.pending()).toBe(1)

    reject(new Error('chunk failed'))
    await settled.catch(() => undefined)
    await Promise.resolve()
    expect(boundary.pending()).toBe(0)
  })

  test('two concurrent registrations both count, and settle independently', async () => {
    const boundary = renderWithBoundary({ fallback: 'loading' })
    let resolveA!: () => void
    let resolveB!: () => void
    const a = new Promise<void>((r) => {
      resolveA = r
    })
    const b = new Promise<void>((r) => {
      resolveB = r
    })
    boundary.register(a)
    boundary.register(b)
    expect(boundary.pending()).toBe(2)

    resolveA()
    await a
    await Promise.resolve()
    expect(boundary.pending()).toBe(1)

    resolveB()
    await b
    await Promise.resolve()
    expect(boundary.pending()).toBe(0)
  })

  test('still a no-op while hydrating, even off the server', () => {
    const boundary = renderWithBoundary({ fallback: 'loading' })
    _setSuspenseHydrating(true)
    boundary.register(Promise.resolve())
    expect(boundary.pending()).toBe(0)
  })
})
