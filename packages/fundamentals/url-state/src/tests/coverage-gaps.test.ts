import { effectScope } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inferSerializer } from '../serializers'
import type { UrlStateSignal } from '../types'
import { setUrlRouter, useUrlState } from '../index'

/** Helper: set window.location.search to a given query string. */
function setSearch(search: string) {
  const url = new URL(window.location.href)
  url.search = search
  history.replaceState(null, '', url.toString())
}

describe('coverage gaps', () => {
  beforeEach(() => {
    setSearch('')
    setUrlRouter(null)
  })

  afterEach(() => {
    setSearch('')
    setUrlRouter(null)
  })

  // ── inferSerializer — repeat-format deserialize (serializers.ts L12) ──────
  //
  // The hook reads repeat-format arrays via getParamAll(), so it never invokes
  // the inferred repeat deserializer. Exercise it directly — both ternary arms:
  // empty-string → [] and non-empty → split on the sentinel.
  describe('inferSerializer repeat deserialize', () => {
    it('deserializes a non-empty repeat string into an array (split arm)', () => {
      const { deserialize } = inferSerializer([] as string[], 'repeat')
      expect(deserialize('a\0REPEAT\0b\0REPEAT\0c')).toEqual(['a', 'b', 'c'])
    })

    it('deserializes an empty repeat string into [] (empty arm)', () => {
      const { deserialize } = inferSerializer([] as string[], 'repeat')
      expect(deserialize('')).toEqual([])
    })

    it('round-trips a repeat serializer', () => {
      const { serialize, deserialize } = inferSerializer([] as string[], 'repeat')
      expect(deserialize(serialize(['x', 'y'] as string[]))).toEqual(['x', 'y'])
    })
  })

  // ── writeUrl repeat default-equality (.every callback — use-url-state L109) ─
  //
  // When a repeat array has the SAME length as the default AND every element
  // matches, the param is removed. The `.every((v, i) => v === defaultArr[i])`
  // callback only runs when the length check already passed AND length > 0.
  describe('repeat default equality element-wise', () => {
    it('removes the param when set equals a non-empty default element-wise', () => {
      const tags = useUrlState('tags', ['a', 'b'] as string[], { arrayFormat: 'repeat' })
      // First push a different value so the param is present in the URL.
      tags.set(['x', 'y'])
      expect(new URLSearchParams(window.location.search).getAll('tags')).toEqual(['x', 'y'])

      // Now set back to the default — same length (2 === 2) AND every element
      // matches → the `.every` callback runs for each index and returns true.
      tags.set(['a', 'b'])
      expect(new URLSearchParams(window.location.search).has('tags')).toBe(false)
    })

    it('keeps the param when same length but an element differs', () => {
      const tags = useUrlState('tags', ['a', 'b'] as string[], { arrayFormat: 'repeat' })
      // Same length as default (2) but second element differs → `.every` returns
      // false on the differing index → param is written, not removed.
      tags.set(['a', 'z'])
      expect(new URLSearchParams(window.location.search).getAll('tags')).toEqual(['a', 'z'])
    })
  })

  // ── onCleanup clears a pending debounce timer (use-url-state L181) ─────────
  //
  // The cleanup body runs `if (timer !== undefined) clearTimeout(timer)`. The
  // truthy arm only fires when a debounced write is still pending at teardown.
  describe('cleanup clears pending debounce timer', () => {
    it('clears the pending timer when the owning scope stops mid-debounce', () => {
      vi.useFakeTimers()
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

      const scope = effectScope()
      let page!: UrlStateSignal<number>
      scope.runInScope(() => {
        page = useUrlState('page', 1, { debounce: 100 })
      })

      // Start a debounce timer that has NOT yet fired.
      page.set(5)
      const clearCallsBefore = clearSpy.mock.calls.length

      // Stop the scope → onCleanup runs with `timer !== undefined` (truthy arm).
      scope.stop()
      expect(clearSpy.mock.calls.length).toBeGreaterThan(clearCallsBefore)

      // The debounced write must NOT land after teardown.
      vi.advanceTimersByTime(100)
      expect(new URLSearchParams(window.location.search).has('page')).toBe(false)

      clearSpy.mockRestore()
      vi.useRealTimers()
    })
  })
})
