// @vitest-environment node
// True SSR environment — no `document` at module load, so the `isClient` guard
// (from @pyreon/reactivity) is correctly `false` here. This is the real shape of
// SSR (the hooks module loads in Node with no DOM), and the right way to exercise
// `useOnline` / `useEventListener`'s SSR fallbacks — vs runtime-deleting `window`
// in happy-dom, which can't move the module-level `isClient` after import.
import { describe, expect, it } from 'vitest'
import { useEventListener } from '../useEventListener'
import { useOnline } from '../useOnline'

describe('useOnline — SSR fallback (no DOM at load)', () => {
  it('returns true unconditionally without touching window/navigator', () => {
    const online = useOnline()
    expect(online()).toBe(true)
  })
})

describe('useEventListener — SSR no-op (no DOM at load)', () => {
  it('returns early without throwing', () => {
    expect(() => useEventListener('resize', () => {})).not.toThrow()
  })
})
