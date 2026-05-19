import { describe, expect, it } from 'vitest'
import * as storeEntry from '../store'

/**
 * `@pyreon/svelte-compat/store` is the `svelte/store` import surface —
 * the vite plugin's `compat: 'svelte'` aliases `svelte/store` to it.
 * It must re-export exactly the store API (no lifecycle/context) so the
 * subpath mirrors Svelte's real `svelte/store` shape, and the
 * re-exported functions must be the same identities as `../index`.
 */
describe('@pyreon/svelte-compat/store entry', () => {
  it('exposes exactly the store API', () => {
    expect(Object.keys(storeEntry).sort()).toEqual([
      'derived',
      'get',
      'readable',
      'readonly',
      'writable',
    ])
  })

  it('re-exported writable/derived/get round-trip through the subpath', () => {
    const n = storeEntry.writable(2)
    const doubled = storeEntry.derived(n, (v: number) => v * 2)
    expect(storeEntry.get(doubled)).toBe(4)
    n.set(5)
    expect(storeEntry.get(doubled)).toBe(10)

    const ro = storeEntry.readonly(n)
    expect('set' in ro).toBe(false)
    expect(storeEntry.get(ro)).toBe(5)

    const r = storeEntry.readable(7)
    expect(storeEntry.get(r)).toBe(7)
  })
})
