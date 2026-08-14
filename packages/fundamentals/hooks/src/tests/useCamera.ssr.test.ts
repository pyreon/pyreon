// The server arm, in its own file because it mocks `isClient` at module load
// — a per-file mock, not something a single `it` can scope.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@pyreon/reactivity', async () => {
  const actual = await vi.importActual<typeof import('@pyreon/reactivity')>('@pyreon/reactivity')
  return { ...actual, isClient: false }
})

const { useCamera } = await import('../useCamera')

describe('useCamera on the server', () => {
  it('reports unavailable', () => {
    expect(useCamera().isAvailable()).toBe(false)
  })

  it('capture() RESOLVES null instead of touching the DOM', async () => {
    // An SSR render that calls capture() must not reach `document`. Resolving
    // null keeps the contract identical to a dismissed sheet, so callers need
    // no separate server branch.
    const created = vi.spyOn(document, 'createElement')
    await expect(useCamera().capture()).resolves.toBeNull()
    expect(created).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
