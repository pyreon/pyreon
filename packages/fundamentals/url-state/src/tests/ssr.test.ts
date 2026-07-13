// @vitest-environment node
//
// Real SSR coverage. Under the `node` environment `document`/`window` are
// undefined, so `@pyreon/reactivity`'s `isClient` const is `false` at module
// load — exercising the `if (!isClient) return` SSR guards in `url.ts` and the
// non-client branch in `use-url-state.ts` with the actual production value
// (NOT a mock / NOT a v8-ignore).
import { describe, expect, it } from 'vitest'
import { isClient } from '@pyreon/reactivity'
import { commitParams, getParam, getParamAll, setParamRepeated, setParams } from '../url'
import { batchUrlUpdates, useUrlState } from '../index'

describe('SSR safety (node environment)', () => {
  it('isClient is false under the node environment', () => {
    expect(isClient).toBe(false)
    expect(typeof document).toBe('undefined')
  })

  // ── url.ts SSR guards ─────────────────────────────────────────────────────

  it('getParam returns null in SSR (url.ts L5 guard)', () => {
    expect(getParam('page')).toBeNull()
  })

  it('getParamAll returns [] in SSR (url.ts L14 guard)', () => {
    expect(getParamAll('tags')).toEqual([])
  })

  it('setParams is a no-op in SSR and does not throw (url.ts L41 guard)', () => {
    expect(() => setParams({ page: '3' }, true)).not.toThrow()
    expect(() => setParams({ page: null }, false)).not.toThrow()
  })

  it('setParamRepeated is a no-op in SSR and does not throw (url.ts L73 guard)', () => {
    expect(() => setParamRepeated('tags', ['a', 'b'], true)).not.toThrow()
    expect(() => setParamRepeated('tags', null, false)).not.toThrow()
  })

  it('commitParams is a no-op in SSR and does not throw', () => {
    expect(() =>
      commitParams(new Map([['page', '3']]), new Map([['tags', ['a']]]), true),
    ).not.toThrow()
  })

  it('batchUrlUpdates is SSR-safe — signals update, no history calls, no throw', () => {
    const page = useUrlState('page', 1)
    const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
    expect(() =>
      batchUrlUpdates(() => {
        page.set(3)
        tags.set(['a', 'b'])
      }),
    ).not.toThrow()
    expect(page()).toBe(3)
    expect(tags()).toEqual(['a', 'b'])
  })

  // ── use-url-state.ts non-client branch ────────────────────────────────────

  it('useUrlState falls back to the default value in SSR (no URL to read)', () => {
    // getParam returns null in SSR → initial falls back to the default.
    const page = useUrlState('page', 7)
    expect(page()).toBe(7)
  })

  it('useUrlState skips the popstate listener in SSR (use-url-state.ts L150 guard)', () => {
    // The `if (isClient)` block (popstate registration) is skipped — there is no
    // window to listen on. The accessor must still be fully usable.
    const q = useUrlState('q', '')
    expect(q()).toBe('')
    // .set() updates the signal; setParams is a no-op server-side (no throw).
    expect(() => q.set('hello')).not.toThrow()
    expect(q()).toBe('hello')
  })

  it('repeat-format useUrlState falls back to default in SSR', () => {
    const tags = useUrlState('tags', ['x'] as string[], { arrayFormat: 'repeat' })
    expect(tags()).toEqual(['x'])
    expect(() => tags.set(['a', 'b'])).not.toThrow()
  })

  it('schema-mode useUrlState falls back to defaults in SSR', () => {
    const state = useUrlState({ page: 1, q: '' })
    expect(state.page()).toBe(1)
    expect(state.q()).toBe('')
  })
})
