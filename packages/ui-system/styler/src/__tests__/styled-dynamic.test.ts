/**
 * Coverage for `DynamicStyled`'s reactive client path in styled.tsx —
 * the computed/renderEffect/ref machinery that only fires when a styled
 * component is driven by signal-backed `$rocketstyle`/`$rocketstate`
 * accessors and its ref is wired to a live element. Run under happy-dom
 * (`IS_SERVER === false`), unlike `styled-ssr-fast-path.test.tsx`.
 *
 * Covers:
 * - the `computed` body's per-axis reactive reads (both-reactive and
 *   one-reactive-one-static)
 * - the `equals: (a, b) => a === b` memoizer firing on re-eval
 * - the reactive-update ref wrapper (with/without a user-supplied ref,
 *   function and object forms)
 * - the renderEffect's classList toggle when `el` is set and the class
 *   changes (remove-old + add-new)
 * - the Tier-2 `classCache` and Element-layer `elClassCache` hit paths
 * - the final `h()` children spread (array, single, none)
 */
import { popContext, pushContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sheet } from '../sheet'
import { styled } from '../styled'
import { ThemeContext } from '../ThemeProvider'

// A minimal element double that records classList mutations, so the
// renderEffect's `el.classList.remove/add` can be asserted without a real
// DOM mount (styler has no @pyreon/runtime-dom dependency).
interface FakeEl {
  classes: Set<string>
  classList: { add(c: string): void; remove(c: string): void }
}
function fakeEl(initial?: string): FakeEl {
  const classes = new Set<string>()
  if (initial) classes.add(initial)
  return {
    classes,
    classList: {
      add: (c: string) => {
        classes.add(c)
      },
      remove: (c: string) => {
        classes.delete(c)
      },
    },
  }
}

function pushTheme() {
  pushContext(new Map([[ThemeContext.id, (() => ({})) as unknown]]))
}

describe('DynamicStyled — reactive client path', () => {
  beforeEach(() => {
    pushTheme()
  })
  afterEach(() => {
    popContext()
    sheet.clearCache()
  })

  it('both axes reactive: ref fires, signal change toggles classList', () => {
    const color = signal('rgb(1, 0, 0)')
    const rs = () => ({ color: color() })
    const rsState = () => ({ state: 'a' })
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    const vnode = Comp({ $rocketstyle: rs, $rocketstate: rsState })

    const initial = vnode.props.class as string
    expect(initial).toMatch(/^pyr-/)
    expect(typeof vnode.props.ref).toBe('function')

    const el = fakeEl(initial)
    vnode.props.ref(el) // anonymous ref wrapper, no originalRef

    color.set('rgb(2, 0, 0)') // computed re-evals → equals(a,b) → renderEffect toggles
    const after = [...el.classes]
    expect(after.length).toBe(1)
    expect(after[0]).not.toBe(initial)
  })

  it('one axis reactive, the other a static object (computed mixed-read branch)', () => {
    const color = signal('rgb(3, 0, 0)')
    const rs = () => ({ color: color() })
    // $rocketstate is a PLAIN OBJECT (non-function) → isReactiveState false,
    // so the computed body takes the `: $rsState` (static) arm.
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    const vnode = Comp({ $rocketstyle: rs, $rocketstate: { state: 's' } })
    expect(vnode.props.class).toMatch(/^pyr-/)
    const el = fakeEl(vnode.props.class)
    vnode.props.ref(el)
    color.set('rgb(4, 0, 0)')
    expect([...el.classes][0]).not.toBe(vnode.props.class)
  })

  it('reactive ref wrapper forwards a user-supplied FUNCTION ref', () => {
    const rs = () => ({ color: 'red' })
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    let received: unknown = 'unset'
    const userRef = (node: unknown) => {
      received = node
    }
    const vnode = Comp({ $rocketstyle: rs, $rocketstate: () => ({}), ref: userRef })
    const el = fakeEl()
    vnode.props.ref(el)
    expect(received).toBe(el) // originalRef function branch fired
  })

  it('reactive ref wrapper forwards a user-supplied OBJECT ref', () => {
    const rs = () => ({ color: 'blue' })
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    const userRef: { current: unknown } = { current: null }
    const vnode = Comp({ $rocketstyle: rs, $rocketstate: () => ({}), ref: userRef })
    const el = fakeEl()
    vnode.props.ref(el)
    expect(userRef.current).toBe(el) // originalRef object branch fired
  })

  it('reactive STATE with a STATIC style (computed reads $rs as the static arm)', () => {
    // $rocketstyle is a PLAIN OBJECT, $rocketstate is a function accessor →
    // hasReactive is true (computed created), but inside the computed body
    // `isReactiveRS ? $rs() : $rs` takes the `: $rs` (static) arm.
    const stateSig = signal('a')
    const rsState = () => ({ state: stateSig() })
    const Comp = styled('div')`
      color: ${(p: any) => p.$rocketstyle?.color};
      content: ${(p: any) => `"${p.$rocketstate?.state}"`};
    ` as any
    const vnode = Comp({ $rocketstyle: { color: 'red' }, $rocketstate: rsState })
    const initial = vnode.props.class as string
    expect(initial).toMatch(/^pyr-/)
    const el = fakeEl(initial)
    vnode.props.ref(el)
    stateSig.set('b') // computed reruns; $rs read via the static arm
    expect([...el.classes][0]).not.toBe(initial)
  })

  it('transition from an EMPTY initial class to a non-empty class (newClass/currentClassName guards)', () => {
    // Resolves to NO CSS while toggled off (empty class), then to real CSS
    // when toggled on — exercises the renderEffect's `if (currentClassName)`
    // false arm (empty → nothing to remove) on the first toggle.
    const on = signal(false)
    const rs = () => ({ on: on() })
    const Comp = styled('div')`
      ${(p: any) => (p.$rocketstyle?.on ? 'color: red;' : '')}
    ` as any
    const vnode = Comp({ $rocketstyle: rs, $rocketstate: () => ({}) })
    // Empty CSS → empty class → buildProps sets no `class` prop at all.
    expect(vnode.props.class).toBeUndefined()
    const el = fakeEl() // no initial class
    vnode.props.ref(el)
    on.set(true) // empty → non-empty: currentClassName falsy, newClass truthy
    const afterOn = [...el.classes]
    expect(afterOn.length).toBe(1)
    expect(afterOn[0]).toMatch(/^pyr-/)
    on.set(false) // non-empty → empty: currentClassName truthy, newClass falsy
    expect([...el.classes]).toEqual([])
  })

  it('signal change to the SAME resolved class does not toggle (equals short-circuit)', () => {
    // Resolve to the same CSS regardless of signal value → same class →
    // the renderEffect's `newClass !== currentClassName` is false.
    const tick = signal(0)
    const rs = () => {
      tick() // track, but ignore the value in the resolved CSS
      return { color: 'green' }
    }
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    const vnode = Comp({ $rocketstyle: rs, $rocketstate: () => ({}) })
    const initial = vnode.props.class as string
    const el = fakeEl(initial)
    vnode.props.ref(el)
    tick.set(1) // computed reruns but resolves the same class
    expect([...el.classes]).toEqual([initial])
  })
})

describe('DynamicStyled — cache hit paths', () => {
  beforeEach(() => {
    pushTheme()
  })
  afterEach(() => {
    popContext()
    sheet.clearCache()
  })

  it('Tier-2 classCache: same $rocketstyle + $rocketstate identity hits the cache', () => {
    const rsObj = { color: 'rgb(5, 0, 0)' }
    const stateObj = { state: 'x' }
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    // First render resolves + stores in classCache.
    const v1 = Comp({ $rocketstyle: rsObj, $rocketstate: stateObj })
    // Second render with the SAME object identities → classCache hit
    // (inner.get(rsState) !== undefined → return cached).
    const v2 = Comp({ $rocketstyle: rsObj, $rocketstate: stateObj })
    expect(v2.props.class).toBe(v1.props.class)
  })

  it('classCache: same $rocketstyle but new $rocketstate reuses the inner map (!inner false)', () => {
    const rsObj = { color: 'rgb(6, 0, 0)' }
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    // First render allocates inner WeakMap for rsObj.
    Comp({ $rocketstyle: rsObj, $rocketstate: { state: 'a' } })
    // Second render: same rsObj (inner exists) but new rsState → miss on
    // inner.get → resolve → `let inner = classCache.get(rs)` is truthy →
    // the `if (!inner)` allocation branch is skipped.
    const v2 = Comp({ $rocketstyle: rsObj, $rocketstate: { state: 'b' } })
    expect(v2.props.class).toMatch(/^pyr-/)
  })

  it('Element-layer elClassCache: same $element + $childFix hits the cache', () => {
    const elObj = { direction: 'rows', gap: 8 }
    // No $rocketstyle/$rocketstate → the rocketstyle classCache is skipped
    // and the $element branch (elClassCache) applies. A DYNAMIC template
    // (interpolation) routes through DynamicStyled.doResolve, where the
    // elClassCache lives — a static template would take the StaticStyled
    // path and never reach it.
    const Comp = styled('div')`color: ${() => 'rgb(7, 0, 0)'};` as any
    const v1 = Comp({ $element: elObj, $childFix: false })
    // Second render with the SAME $element + $childFix → elClassCache hit
    // (inner truthy AND inner.get($childFix) !== undefined).
    const v2 = Comp({ $element: elObj, $childFix: false })
    expect(v2.props.class).toBe(v1.props.class)
  })

  it('elClassCache: same $element with a new $childFix reuses the inner map (!inner false)', () => {
    const elObj = { direction: 'inline' }
    const Comp = styled('div')`color: ${() => 'rgb(8, 0, 0)'};` as any
    // First render allocates the inner Map for elObj.
    Comp({ $element: elObj, $childFix: false })
    // Second render: same elObj (inner exists) but new $childFix → miss on
    // inner.get → resolve → `let inner = elClassCache.get($el)` truthy →
    // the `if (!inner)` allocation branch is skipped.
    const v2 = Comp({ $element: elObj, $childFix: true })
    expect(v2.props.class).toMatch(/^pyr-/)
  })
})

describe('DynamicStyled — children spread in the reactive return', () => {
  beforeEach(() => {
    pushTheme()
  })
  afterEach(() => {
    popContext()
    sheet.clearCache()
  })

  it('forwards an array of children', () => {
    const rs = () => ({ color: 'red' })
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    const vnode = Comp({ $rocketstyle: rs, $rocketstate: () => ({}), children: ['a', 'b'] })
    expect(vnode.children).toEqual(['a', 'b'])
  })

  it('forwards a single non-array child', () => {
    const rs = () => ({ color: 'red' })
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    const vnode = Comp({ $rocketstyle: rs, $rocketstate: () => ({}), children: 'solo' })
    expect(vnode.children).toEqual(['solo'])
  })

  it('emits no children when none are provided', () => {
    const rs = () => ({ color: 'red' })
    const Comp = styled('div')`color: ${(p: any) => p.$rocketstyle?.color};` as any
    const vnode = Comp({ $rocketstyle: rs, $rocketstate: () => ({}) })
    expect(vnode.children).toEqual([])
  })
})
