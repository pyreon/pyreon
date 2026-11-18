/**
 * Template-owned bindings (`_bind`, `_renderBind`) do not register with the
 * ambient `EffectScope`: the cleanup they are returned to is their only owner.
 * An OWNER FRAME is their owner on an error path, where no cleanup is ever
 * handed out. These tests pin the frame contract: a throw disposes exactly
 * what was recorded since the frame opened, a normal exit forgets it, frames
 * nest by mark, and nothing is recorded outside a frame.
 */
import {
  _abortOwnerFrame,
  _bind,
  _closeOwnerFrame,
  _openOwnerFrame,
  _renderBind,
  effectScope,
  getCurrentScope,
  renderEffect,
  setCurrentScope,
  signal,
} from '../index'

const subs = (s: { debug(): { subscriberCount: number } }) => s.debug().subscriberCount

describe('owner frames', () => {
  test('template-owned bindings leave the ambient scope empty', () => {
    const x = signal(0)
    const scope = effectScope()
    const prev = getCurrentScope()
    setCurrentScope(scope)
    let d1: () => void
    let d2: () => void
    try {
      d1 = _bind(() => {
        x()
      })
      d2 = _renderBind(() => {
        x()
      })
    } finally {
      setCurrentScope(prev)
    }
    expect(scope._isEmpty()).toBe(true)
    expect(subs(x)).toBe(2)
    d1!()
    d2!()
    expect(subs(x)).toBe(0)
  })

  test('an aborted frame disposes the bindings recorded since it opened', () => {
    const x = signal(0)
    const mark = _openOwnerFrame()
    _bind(() => {
      x()
    })
    _renderBind(() => {
      x()
    })
    expect(subs(x)).toBe(2)
    _abortOwnerFrame(mark)
    expect(subs(x)).toBe(0)
  })

  test('a closed frame forgets its bindings: their returned disposers own them', () => {
    const x = signal(0)
    const mark = _openOwnerFrame()
    const d = _renderBind(() => {
      x()
    })
    _closeOwnerFrame(mark)
    // A later frame abort must not reach a binding a closed frame handed out.
    const m2 = _openOwnerFrame()
    _abortOwnerFrame(m2)
    expect(subs(x)).toBe(1)
    d()
    expect(subs(x)).toBe(0)
  })

  test('nested frames: an inner abort disposes only its own range', () => {
    const outer = signal(0)
    const inner = signal(0)
    const m1 = _openOwnerFrame()
    _bind(() => {
      outer()
    })
    const m2 = _openOwnerFrame()
    _bind(() => {
      inner()
    })
    _abortOwnerFrame(m2)
    expect(subs(inner)).toBe(0)
    expect(subs(outer)).toBe(1)
    _abortOwnerFrame(m1)
    expect(subs(outer)).toBe(0)
  })

  test('nested frames: an inner close hands its range out, the outer abort keeps its own', () => {
    const outer = signal(0)
    const inner = signal(0)
    const m1 = _openOwnerFrame()
    _bind(() => {
      outer()
    })
    const m2 = _openOwnerFrame()
    const dInner = _bind(() => {
      inner()
    })
    _closeOwnerFrame(m2)
    _abortOwnerFrame(m1)
    expect(subs(outer)).toBe(0)
    expect(subs(inner)).toBe(1)
    dInner()
  })

  test('public renderEffect is never recorded by a frame (its scope owns it)', () => {
    const x = signal(0)
    const scope = effectScope()
    const mark = _openOwnerFrame()
    scope.runInScope(() => {
      renderEffect(() => {
        x()
      })
    })
    _abortOwnerFrame(mark)
    expect(subs(x)).toBe(1)
    scope.stop()
    expect(subs(x)).toBe(0)
  })

  test('outside any frame nothing is recorded', () => {
    const x = signal(0)
    const d = _renderBind(() => {
      x()
    })
    const mark = _openOwnerFrame()
    _abortOwnerFrame(mark)
    expect(subs(x)).toBe(1)
    d()
  })
})
