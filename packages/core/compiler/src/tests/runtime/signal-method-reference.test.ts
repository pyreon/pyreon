// @vitest-environment happy-dom
/// <reference lib="dom" />
import { describe, expect, it, vi } from 'vitest'
import { transformJSX, transformJSX_JS } from '../../jsx'
import { compileAndMount } from './harness'

/**
 * A signal's own method passed BY REFERENCE in JSX (#4356): `ref={panel.set}`,
 * `onClick={panel.set}`, `cb={count.update}`.
 *
 * The compiler's signal auto-call rewrote the member's object and emitted
 * `panel().set`: the `.set` field of the signal's VALUE, `undefined`, so the
 * ref was silently ignored (or `null.set` threw). And the reference cannot work
 * as written anyway: signal methods live on a shared prototype and read `this`,
 * so a detached `panel.set` has no signal. Now:
 *
 * - the compiler leaves `panel.set` as written (both backends; `user.name`
 *   still reads `user().name`) and warns `signal-method-reference` with the
 *   arrow that works;
 * - calling the detached method throws a `[Pyreon]` error naming the fix
 *   (dev), instead of "Cannot read properties of undefined (reading '_v')".
 *
 * Bisect-verified: without the compiler change the emit spec sees
 * `panel().set` and no warning; without the reactivity guard the runtime spec
 * sees only "Cannot read properties of undefined".
 */
const SRC = `
  import { signal, computed } from '@pyreon/reactivity'
  export function P() {
    const panel = signal(null)
    const total = computed(() => 1)
    return <div ref={panel.set} onClick={panel.set}><Comp a={panel.update} b={total.dispose} d={panel.name} /></div>
  }`

describe('a signal method passed by reference in JSX', () => {
  it('both backends keep the reference as written and warn with the fix', () => {
    const native = transformJSX(SRC, 'p.tsx')
    const js = transformJSX_JS(SRC, 'p.tsx')
    expect(native.code).toBe(js.code)
    expect(native.warnings).toEqual(js.warnings)
    expect(native.code).not.toContain('panel().set')
    expect(native.code).not.toContain('panel().update')
    expect(native.code).toContain('panel().name')
    const refs = native.warnings.filter((w) => w.code === 'signal-method-reference')
    expect(refs.map((w) => w.message.match(/"([^"]+)" is passed/)?.[1])).toEqual([
      'panel.set',
      'panel.set',
      'panel.update',
      'total.dispose',
    ])
    expect(refs[0]!.message).toContain('ref={(v) => panel.set(v)}')
  })

  it('the templated shape from the issue: no auto-call, one warning per attribute', () => {
    const src = `import { signal } from '@pyreon/reactivity'
      export function P() { const panel = signal(null); return <div ref={panel.set} onClick={panel.set}>x</div> }`
    for (const fn of [transformJSX, transformJSX_JS]) {
      const r = fn(src, 'p.tsx')
      expect(r.code).toContain('const __r = panel.set;')
      expect(r.code).toContain('__ev_click = panel.set;')
      expect(r.warnings.filter((w) => w.code === 'signal-method-reference')).toHaveLength(2)
    }
  })

  it('a callback param that shadows the signal is not reported', () => {
    const src = `import { signal } from '@pyreon/reactivity'
      export function P() { const panel = signal(null)
        return <ul><For each={[{ set: () => {} }]} by={(i) => 1}>{(panel) => <li ref={panel.set} />}</For></ul> }`
    for (const fn of [transformJSX, transformJSX_JS]) {
      expect(fn(src, 'p.tsx').warnings.filter((w) => w.code === 'signal-method-reference')).toEqual([])
    }
  })

  it('at runtime the detached method fails with a [Pyreon] error naming the fix', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = compileAndMount(`<div ref={panel.set}>x</div>`, {}, `const panel = signal(null)`)
    const logged = errors.mock.calls.flat().map((a) => (a instanceof Error ? a.message : String(a))).join('\n')
    errors.mockRestore()
    expect(logged).toContain('[Pyreon] signal.set() was called without its signal')
    expect(logged).toContain('(v) => sig.set(v)')
    unmount()
  })

  it('the arrow the warning suggests records the element', () => {
    const seen: { panel?: () => unknown } = {}
    const { container, unmount } = compileAndMount(
      `<div id="p" ref={(el) => panel.set(el)} title={user.name}>{user.name}</div>`,
      { seen },
      `const panel = signal(null); const user = signal({ name: 'Ada' }); seen.panel = panel`,
    )
    const div = container.querySelector('#p')
    expect(seen.panel!()).toBe(div)
    expect(div?.textContent).toBe('Ada')
    expect(div?.getAttribute('title')).toBe('Ada')
    unmount()
  })
})
