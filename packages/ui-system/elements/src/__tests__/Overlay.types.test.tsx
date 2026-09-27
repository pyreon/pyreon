/**
 * Compile-time lock: Overlay's `trigger` / `children` render-prop callbacks
 * receive a CONTEXTUAL type under strict TS.
 *
 * `Content` (the `render()` input) carries several function types, and a union
 * with more than one call signature gives an inline arrow no contextual type —
 * so `trigger={(t) => …}` failed with `TS7006: Parameter 't' implicitly has an
 * 'any' type`. These fixtures typecheck only while the renderer signatures are
 * the sole callable members of the prop unions (verified by reverting the fix:
 * `tsc` reports TS7006 on every `(t)` / `(c)` below).
 */
import { Overlay } from '../index'

describe('Overlay render-prop typing', () => {
  it('types trigger + content render-prop params (no implicit any)', () => {
    const inlineChildren = (
      <Overlay trigger={(t) => <button ref={t.ref}>{String(t.active)}</button>}>
        {(c) => <div ref={c.ref}>{String(c.align)}</div>}
      </Overlay>
    )
    const propChildren = (
      <Overlay
        trigger={(t) => <button ref={t.ref} onClick={() => t.showContent?.()} />}
        children={(c) => <div ref={c.ref} data-align-x={c.alignX} />}
      />
    )
    expect(inlineChildren).toBeTruthy()
    expect(propChildren).toBeTruthy()
  })

  it('still accepts components, accessors and static content', () => {
    const Btn = (p: { ref?: (n: HTMLElement | null) => void; active?: boolean }) => (
      <button ref={p.ref}>{String(p.active)}</button>
    )
    const component = <Overlay trigger={Btn}>{<div>static</div>}</Overlay>
    const accessor = <Overlay trigger={() => <button>x</button>}>{'text'}</Overlay>
    expect(component).toBeTruthy()
    expect(accessor).toBeTruthy()
  })
})
