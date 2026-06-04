import { signal } from '@pyreon/reactivity'
import type { Patch } from '../types'
import { trackedSignal } from '../patch'

// Regression lock for the bug the owner... er, the missing `wrapSignal` primitive
// hid: the hand-rolled `trackedSignal` facade delegated `.peek`/`.subscribe`/
// `.set`/`.update` but NOT `.direct`, and did NOT forward the internal `_v`
// field. The compiler-emitted `_bindText(source, textNode)` fast path reads
// `source._v` directly AND subscribes via `source.direct(...)`, bypassing the
// function call — so a model field bound via `{() => model.field()}` (the text
// fast path) would read `_v === undefined`, write '' to the text node, and stay
// empty on every subsequent write. Routing `trackedSignal` through
// `@pyreon/reactivity`'s `wrapSignal` makes both `_v` and `.direct` delegate to
// the inner signal by construction, so the contract holds. Bisect: revert
// `trackedSignal` to the hand-rolled facade → `_v` is undefined here.
describe('trackedSignal — _bindText fast-path contract', () => {
  it('forwards `_v` (live) so the text fast path reads the real value', () => {
    const inner = signal('hello')
    const ts = trackedSignal(inner, 'field', () => {})
    expect((ts as unknown as { _v: string })._v).toBe('hello')
    ts.set('world')
    expect((ts as unknown as { _v: string })._v).toBe('world')
  })

  it('delegates `.direct` so the fast path can subscribe a direct updater', () => {
    const inner = signal(0)
    const patches: Patch[] = []
    const ts = trackedSignal(inner, 'n', (p) => patches.push(p))
    const direct = (ts as unknown as { direct?: (fn: () => void) => () => void }).direct
    expect(typeof direct).toBe('function')

    let fired = 0
    const dispose = direct!(() => {
      fired++
    })
    ts.set(42)
    expect(fired).toBe(1)
    expect((ts as unknown as { _v: number })._v).toBe(42)
    // writes still emit patches as before
    expect(patches).toEqual([{ op: 'replace', path: 'n', value: 42 }])
    dispose()
    ts.set(43)
    expect(fired).toBe(1) // disposed
  })

  it('reads/writes still behave as a normal tracked signal', () => {
    const inner = signal(1)
    const patches: Patch[] = []
    const ts = trackedSignal(inner, 'x', (p) => patches.push(p))
    expect(ts()).toBe(1)
    expect(ts.peek()).toBe(1)
    ts.update((c) => c + 1)
    expect(ts()).toBe(2)
    expect(inner()).toBe(2)
    expect(patches).toEqual([{ op: 'replace', path: 'x', value: 2 }])
  })
})
