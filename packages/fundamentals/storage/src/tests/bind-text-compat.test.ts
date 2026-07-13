/**
 * Regression: storage signals didn't forward the internal `_v` field that
 * the compiler-emitted `_bindText` / `_bindDirect` fast paths read.
 *
 * Bug shape: when JSX `{() => theme()}` (where `theme` was declared via
 * `useStorage`) lands in a text binding, the compiler optimizes to
 * `_bindText(theme, textNode)` instead of `_bindText(() => theme(), textNode)`.
 * `_bindText`'s fast path reads `source._v` directly (skipping the function
 * call) AND registers the text-update closure via `source.direct(...)`.
 *
 * Storage signals delegated `.direct` (so subscribe-on-change worked) but
 * forgot `._v` — the text-update read undefined → wrote empty string. The
 * symptom: SSR rendered `<strong>light</strong>` correctly but post-
 * hydration the textNode went empty and stayed empty even after
 * `theme.set('dark')` (the binding fired but read the missing `_v` again).
 *
 * Fix: forward `_v` via getter so storage signals honor the same
 * structural contract as base signals.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetRegistry,
  _resetStorageListener,
  useCookie,
  useMemoryStorage,
  useSessionStorage,
  useStorage,
} from '../index'

interface SignalLike<T> {
  _v: T
  direct(cb: () => void): () => void
}

const internal = <T,>(sig: unknown): SignalLike<T> => sig as SignalLike<T>

describe('storage signals — _bindText / _bindDirect compat (`_v` forwarding)', () => {
  afterEach(() => {
    _resetRegistry()
    _resetStorageListener()
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // Cross-origin / disabled — skip.
    }
  })

  it('useStorage signal forwards `_v` to the underlying base signal', () => {
    const theme = useStorage('test-theme-v', 'light')
    // Bug-shape: pre-fix this is `undefined`.
    expect(internal<string>(theme)._v).toBe('light')

    // After set, both the public read and `_v` reflect the new value.
    theme.set('dark')
    expect(theme()).toBe('dark')
    expect(internal<string>(theme)._v).toBe('dark')
  })

  it('useStorage `_v` reflects values read from localStorage on init', () => {
    try {
      localStorage.setItem('test-init', JSON.stringify('preloaded'))
    } catch {
      // Skip if storage unavailable.
      return
    }
    const sig = useStorage('test-init', 'fallback')
    expect(sig()).toBe('preloaded')
    expect(internal<string>(sig)._v).toBe('preloaded')
  })

  it('useSessionStorage signal forwards `_v`', () => {
    const step = useSessionStorage('test-step-v', 1)
    expect(internal<number>(step)._v).toBe(1)
    step.set(3)
    expect(internal<number>(step)._v).toBe(3)
  })

  it('useCookie signal forwards `_v`', () => {
    const locale = useCookie('test-locale-v', 'en')
    expect(internal<string>(locale)._v).toBe('en')
    locale.set('de')
    expect(internal<string>(locale)._v).toBe('de')
  })

  it('useMemoryStorage signal forwards `_v`', () => {
    const note = useMemoryStorage('test-note-v', '')
    expect(internal<string>(note)._v).toBe('')
    note.set('hello')
    expect(internal<string>(note)._v).toBe('hello')
  })

  it('simulates the compiler `_bindText` fast path end-to-end (`_v` init + `.direct` update)', () => {
    // This mirrors EXACTLY what the compiler-emitted `_bindText(source, node)`
    // does for `{() => theme()}`: seed the text node from `source._v` (NOT a
    // function call), then subscribe via `source.direct(...)`. Pre-fix `_v` was
    // undefined → the node bound to '' and stayed empty.
    const theme = useStorage('bind-fastpath', 'light')
    const node = { data: '' as string }
    const src = internal<string>(theme)
    node.data = String(src._v) // initial fast-path read
    // `.direct` is a notify-only subscription; the fast-path closure re-reads
    // `_v` on each notification (which is why forwarding `_v` is load-bearing).
    const dispose = src.direct(() => {
      node.data = String(src._v)
    })
    expect(node.data).toBe('light')
    theme.set('dark')
    expect(node.data).toBe('dark') // .direct fired with the live value
    dispose()
  })

  it('`_v` getter tracks the underlying signal even when the wrapper is held across mutations', () => {
    // The wrapper is captured ONCE; the getter must read the LIVE value
    // from the underlying signal each access. Pre-fix this is undefined
    // forever. Post-fix it tracks the underlying `sig._v` on every read.
    const theme = useStorage('test-live-v', 'a')
    const captured = theme
    expect(internal<string>(captured)._v).toBe('a')
    theme.set('b')
    expect(internal<string>(captured)._v).toBe('b')
    theme.set('c')
    expect(internal<string>(captured)._v).toBe('c')
  })
})
