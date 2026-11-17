// @vitest-environment happy-dom
/// <reference lib="dom" />
import { describe, expect, it, vi } from 'vitest'
import { transformJSX, transformJSX_JS } from '../../jsx'
import { compileAndMount } from './harness'

/**
 * A signal's own method passed BY REFERENCE in JSX (#4356): `ref={panel.set}`,
 * `onClick={panel.set}`, `cb={count.update}`.
 *
 * Signal methods live on a shared prototype and read `this`, so a detached
 * `panel.set` has no signal. The compiler knows `panel` is a signal, so its
 * auto-call pass BINDS the reference: `panel.set.bind(panel)` (both backends;
 * `user.name` still reads `user().name`). What the compiler cannot prove is a
 * signal (`holder.sig.set`) stays as written, and calling it detached throws a
 * `[Pyreon]` error naming the fix (dev) instead of "Cannot read properties of
 * undefined (reading '_v')".
 */
const SRC = `
  import { signal, computed } from '@pyreon/reactivity'
  export function P() {
    const panel = signal(null)
    const total = computed(() => 1)
    return <div ref={panel.set} onClick={panel.set}><Comp a={panel.update} b={total.dispose} d={panel.name} /></div>
  }`

describe('a signal method passed by reference in JSX', () => {
  it('both backends bind the reference to its signal and leave a value member a read', () => {
    const native = transformJSX(SRC, 'p.tsx')
    const js = transformJSX_JS(SRC, 'p.tsx')
    expect(native.code).toBe(js.code)
    expect(native.warnings).toEqual(js.warnings)
    expect(native.code).toContain('panel.set.bind(panel)')
    expect(native.code).toContain('a={panel.update.bind(panel)}')
    expect(native.code).toContain('b={total.dispose.bind(total)}')
    expect(native.code).toContain('panel().name')
    expect(native.code).not.toContain('panel().set')
  })

  it('a callback param that shadows the signal is not bound', () => {
    const src = `import { signal } from '@pyreon/reactivity'
      export function P() { const panel = signal(null)
        return <ul><For each={[{ set: () => {} }]} by={(i) => 1}>{(panel) => <li ref={panel.set} />}</For></ul> }`
    for (const fn of [transformJSX, transformJSX_JS]) {
      expect(fn(src, 'p.tsx').code).not.toContain('panel.set.bind')
    }
  })

  it('ref={panel.set} records the element (shipped backend, mounted)', () => {
    const seen: { panel?: () => unknown } = {}
    const { container, unmount } = compileAndMount(
      `<div id="p" ref={panel.set} title={user.name}>{user.name}</div>`,
      { seen },
      `const panel = signal(null); const user = signal({ name: 'Ada' }); seen.panel = panel`,
    )
    const div = container.querySelector('#p')
    expect(seen.panel!()).toBe(div)
    expect(div?.getAttribute('title')).toBe('Ada')
    unmount()
  })

  it('a method the compiler cannot prove is a signal fails at runtime with a [Pyreon] error naming the fix', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const holder = { sig: (globalThis as { __sig?: unknown }).__sig }
    const { unmount } = compileAndMount(`<div ref={holder.sig.set}>x</div>`, { holder }, `holder.sig = signal(null)`)
    const logged = errors.mock.calls.flat().map((a) => (a instanceof Error ? a.message : String(a))).join('\n')
    errors.mockRestore()
    expect(logged).toContain('[Pyreon] signal.set() was called without its signal')
    expect(logged).toContain('(v) => sig.set(v)')
    unmount()
  })
  it('an explicit arrow still records the element', () => {
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
