/**
 * `_effectOwned` — the `effect()` a runtime-dom structural boundary (a reactive
 * range, a keyed list) is built on. Its disposer is RETURNED to an owning
 * cleanup, so like `_bind` / `_renderBind` it does not also register with the
 * ambient `EffectScope`; an owner frame owns it on an error path. Inside a
 * `<For>` row that registration was the only thing that made the row keep an
 * `EffectScope` (plus its array and a stop closure) for every conditional cell.
 *
 * Bisect-verified: building `_effectOwned` as a plain `effect()` (scope
 * registration back, no owner-frame record) fails the first spec with
 * `expected false to be true` and the owner-frame spec with `expected 1 to be
 * +0`; the onUpdate and inner-effect specs stay green, because they pin what
 * it must KEEP doing.
 */
import { effect, effectScope, getCurrentScope, setCurrentScope, signal } from '../index'
import { _abortOwnerFrame, _closeOwnerFrame, _effectOwned, _openOwnerFrame } from '../internal'

const subs = (s: { debug(): { subscriberCount: number } }) => s.debug().subscriberCount

describe('_effectOwned', () => {
  test('does not register with the ambient scope; its own dispose releases it', () => {
    const x = signal(0)
    const scope = effectScope()
    const prev = getCurrentScope()
    setCurrentScope(scope)
    let runs = 0
    let e: () => void
    try {
      e = _effectOwned(() => {
        x()
        runs++
      })
    } finally {
      setCurrentScope(prev)
    }
    expect(scope._isEmpty()).toBe(true)
    x.set(1)
    expect(runs).toBe(2)
    e!()
    expect(subs(x)).toBe(0)
  })

  test('re-runs notify the creating scope (onUpdate) exactly as effect() does', async () => {
    const x = signal(0)
    const scope = effectScope()
    let updates = 0
    scope.addUpdateHook(() => updates++)
    const prev = getCurrentScope()
    setCurrentScope(scope)
    let e: () => void
    try {
      e = _effectOwned(() => {
        x()
      })
    } finally {
      setCurrentScope(prev)
    }
    x.set(1)
    await Promise.resolve()
    expect(updates).toBe(1)
    e!()
  })

  test('an aborted owner frame disposes it; a closed one leaves it to its owner', () => {
    const x = signal(0)
    const aborted = _openOwnerFrame()
    _effectOwned(() => {
      x()
    })
    expect(subs(x)).toBe(1)
    _abortOwnerFrame(aborted)
    expect(subs(x)).toBe(0)

    const closed = _openOwnerFrame()
    const e = _effectOwned(() => {
      x()
    })
    _closeOwnerFrame(closed)
    expect(subs(x)).toBe(1)
    e()
    expect(subs(x)).toBe(0)
  })

  test('an enclosing effect run still collects it as an inner effect', () => {
    const outer = signal(0)
    const x = signal(0)
    let inner = 0
    const e = effect(() => {
      outer()
      _effectOwned(() => {
        x()
        inner++
      })
    })
    expect(subs(x)).toBe(1)
    // The outer re-run disposes the previous inner effect before creating a new one.
    outer.set(1)
    expect(subs(x)).toBe(1)
    x.set(1)
    expect(inner).toBe(3)
    e.dispose()
    expect(subs(x)).toBe(0)
  })
})
