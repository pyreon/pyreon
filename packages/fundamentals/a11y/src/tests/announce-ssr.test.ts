import { describe, expect, it, vi } from 'vitest'

// Force the SSR branch: with isServer true, announce() must be a no-op and
// never touch the DOM (there is no live region on the server). This covers
// the `if (isServer) return` guard that the happy-dom suite can't reach
// (isServer is captured false at module load when document exists).
vi.mock('@pyreon/reactivity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pyreon/reactivity')>()
  return { ...actual, isServer: true }
})

describe('announce — SSR no-op', () => {
  it('does nothing when isServer is true', async () => {
    const { announce } = await import('../announce')
    announce('should not render')
    expect(document.querySelector('[data-pyreon-announcer]')).toBeNull()
  })
})
