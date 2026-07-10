/**
 * Dev-mode diagnostics for the silent-stringify failure shapes (PZ-02 / PZ-05 /
 * PZ-10 — reported from a production app):
 *
 * 1. PZ-02 — a VNode (or NativeItem, or an array containing one) in a text
 *    binding. FIXED at the runtime layer: an ATTACHED `_bindText` binding now
 *    permanently UPGRADES to a subtree mount on the first VNode-shaped value
 *    (see bindtext-vnode-upgrade.test.tsx for the full matrix) — so the
 *    attached specs below assert the MOUNT, not the old coercion. The warning
 *    remains only for the degenerate DETACHED-text-node case (nowhere to
 *    mount); the detached specs lock that. Sink:
 *    `_bindText` (fast path `String(source._v)` + fallback `String(fn())`).
 *
 * 2. PZ-05 — a raw FUNCTION is String()-coerced in a text position → renders
 *    the function's SOURCE text (e.g. an accessor neutralized by an
 *    `as never` cast). Same sinks; the check targets the RESULT value, never
 *    the legitimately-callable SOURCE.
 *
 * 3. PZ-10 — `props.foo()` throws `TypeError: foo is not a function` because
 *    `foo={expr}` with a compiler-visible signal compiled to `_rp(() => expr)`
 *    and `makeReactiveProps` converted it to a GETTER — `props.foo` is the
 *    VALUE. The setup catch in mount.ts appends a dev-gated diagnosis.
 *
 * Warning tests are bisect-verified (see PR description): implementation
 * reverted → specs fail on the missing console.warn/error; restored → pass.
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, _rp, cx, type ComponentFn } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _tpl, _bindText, _bindDirect } from '../template'
import { _applyProps, _setStyle, mount, mountChild } from '../index'

// ─── Compile-and-mount helpers (precedent: compiler-integration.test.tsx) ────

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _rp,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const

const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

/** Compile a standalone JSX expression, execute, mount. */
function compileAndMount(source: string, globals: Record<string, unknown> = {}) {
  const { code } = transformJSX(source, 'test.tsx')
  const body = stripImports(code)
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `return ${body}`)
  const result = fn(...DEP_VALUES, ...Object.values(globals))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(result, container)
  return { container, cleanup, code }
}

// ─── Spies ────────────────────────────────────────────────────────────────────

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  errorSpy.mockRestore()
  document.body.innerHTML = ''
})

const vnodeWarnCalls = () =>
  warnSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes('A VNode was coerced to'))
const fnWarnCalls = () =>
  warnSpy.mock.calls.filter((c: unknown[]) =>
    String(c[0]).includes('A function was coerced to its source string'),
  )

// ─── PZ-02: VNode coerced to "[object Object]" in a text binding ─────────────

describe('_bindText VNode handling (PZ-02 — fixed: attached bindings upgrade, detached warn)', () => {
  it('fast path: signal holding a VNode MOUNTS the subtree (no warning, no coercion)', () => {
    const sig = signal<unknown>(h('span', {}, 'hi'))
    const text = document.createTextNode('')
    const host = document.createElement('div')
    host.appendChild(text)
    // Attached host (the harness convention): cleanup removers skip DOM
    // removal in DISCONNECTED trees by design (`isConnected` guard).
    document.body.appendChild(host)

    const dispose = _bindText(sig as never, text)

    // Pre-fix: warned once + text.data === '[object Object]'.
    expect(vnodeWarnCalls().length).toBe(0)
    expect(host.innerHTML).toContain('<span>hi</span>')
    expect(host.textContent).toBe('hi')

    // Subsequent VNode values swap through the polymorphic path.
    sig.set(h('em', {}, 'again'))
    expect(vnodeWarnCalls().length).toBe(0)
    expect(host.textContent).toBe('again')
    expect(host.querySelector('em')).not.toBeNull()
    dispose()
    expect(host.textContent, 'dispose removes the subtree').toBe('')
  })

  it('fallback path (REAL compiled shape): {row.cell()} returning JSX MOUNTS (no warning)', () => {
    // `<td>{row.cell()}</td>` compiles to
    // `_bindText(row.cell, __t0, () => row.cell())` — row.cell has no
    // `.direct`, so the renderEffect fallback handles the RESULT.
    const row = { cell: () => h('span', { class: 'badge' }, 'active') }
    const { container, cleanup, code } = compileAndMount('<td>{row.cell()}</td>', { row })

    expect(code).toContain('_bindText')
    expect(vnodeWarnCalls().length).toBe(0)
    expect(container.textContent).toBe('active')
    expect(container.querySelector('span.badge')).not.toBeNull()
    expect(container.textContent).not.toContain('[object Object]')
    cleanup()
  })

  it('DETACHED text node: array containing VNodes still warns (nowhere to mount)', () => {
    const sig = signal<unknown>([h('i', {}, 'a'), h('i', {}, 'b')])
    const text = document.createTextNode('')
    const dispose = _bindText(sig as never, text)
    expect(vnodeWarnCalls().length).toBe(1)
    const msg = String(vnodeWarnCalls()[0]![0])
    expect(msg).toContain('[Pyreon] A VNode was coerced to "[object Object]" in a text binding')
    expect(msg).toContain('no parent')
    dispose()
  })

  it('DETACHED text node: NativeItem (__isNative) still warns (nowhere to mount)', () => {
    const native = _tpl('<b>x</b>', () => null)
    const sig = signal<unknown>(native)
    const text = document.createTextNode('')
    const dispose = _bindText(sig as never, text)
    expect(vnodeWarnCalls().length).toBe(1)
    dispose()
  })

  it('DETACHED text node, fallback path: a bare callable returning a VNode still warns + coerces', () => {
    const accessor = () => h('b', {}, 'x')
    const text = document.createTextNode('')
    const dispose = _bindText(accessor as never, text)
    expect(vnodeWarnCalls().length).toBe(1)
    expect(text.data).toBe('[object Object]')
    dispose()
  })

  it('plain strings / numbers / null / booleans do NOT warn (fast + fallback + compiled)', () => {
    const sig = signal<unknown>('hello')
    const t1 = document.createTextNode('')
    const d1 = _bindText(sig as never, t1)
    sig.set(42)
    sig.set(null)
    sig.set(false)

    const row = { cell: () => 'plain text' }
    const { container, cleanup } = compileAndMount('<td>{row.cell()}</td>', { row })
    expect(container.textContent).toBe('plain text')

    const num = signal(7)
    const { container: c2, cleanup: cl2 } = compileAndMount('<td>{num()}</td>', { num })
    expect(c2.textContent).toBe('7')

    expect(vnodeWarnCalls().length).toBe(0)
    expect(fnWarnCalls().length).toBe(0)
    d1()
    cleanup()
    cl2()
  })

  it('plain non-VNode objects do NOT trigger the VNode warning (scoped check, no false positives)', () => {
    const sig = signal<unknown>({ some: 'object' })
    const text = document.createTextNode('')
    const dispose = _bindText(sig as never, text)
    expect(vnodeWarnCalls().length).toBe(0)
    dispose()
  })
})

// ─── PZ-05: raw function stringified into a text position ────────────────────

describe('_bindText function-coercion warning (PZ-05)', () => {
  it('fast path: signal holding a FUNCTION warns with the as-never guidance', () => {
    const sig = signal<unknown>(() => 'i am an accessor that never got called')
    const text = document.createTextNode('')
    const dispose = _bindText(sig as never, text)
    expect(fnWarnCalls().length).toBe(1)
    const msg = String(fnWarnCalls()[0]![0])
    expect(msg).toContain('[Pyreon] A function was coerced to its source string in a text position')
    expect(msg).toContain("as never")
    dispose()
  })

  it('fallback path: accessor RESULT being a function warns; the accessor SOURCE itself does not', () => {
    // The source is a bare callable — legitimately CALLED by the fallback.
    // Only the RESULT being a function is the bug shape.
    const returnsFunction = () => () => 'inner'
    const t1 = document.createTextNode('')
    const d1 = _bindText(returnsFunction as never, t1)
    expect(fnWarnCalls().length).toBe(1)

    warnSpy.mockClear()

    // Legit accessor source returning text — NO warning.
    const legit = () => 'fine'
    const t2 = document.createTextNode('')
    const d2 = _bindText(legit as never, t2)
    expect(fnWarnCalls().length).toBe(0)
    expect(t2.data).toBe('fine')

    // Legit signal source (fast path) — NO warning.
    const sig = signal('ok')
    const t3 = document.createTextNode('')
    const d3 = _bindText(sig as never, t3)
    expect(fnWarnCalls().length).toBe(0)
    expect(vnodeWarnCalls().length).toBe(0)
    d1()
    d2()
    d3()
  })
})

// ─── PZ-10: reactive prop called as a function — setup-throw diagnosis ───────

describe('setup-catch reactive-prop diagnosis (PZ-10)', () => {
  const diagCalls = () =>
    errorSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes('compiler-wrapped reactive prop'))

  it('calling a getter-backed reactive prop as a function appends the diagnosis', () => {
    const items = signal(['a', 'b'])
    const Picker: ComponentFn = (props) => {
      // The child types the prop as `() => T` and calls it — but the
      // compiler wrapped `list={items()}` as `_rp(() => items())` and
      // makeReactiveProps converted it to a getter: props.list IS the value.
      const list = (props.list as () => string[])()
      return h('ul', {}, list.join(','))
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    mount(h(Picker, { list: _rp(() => items()) }), el)

    // Standard setup error still fires...
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('threw during setup'),
      expect.any(Error),
    )
    // ...plus the dev diagnosis with dynamic component + prop names.
    expect(diagCalls().length).toBe(1)
    const msg = String(diagCalls()[0]![0])
    expect(msg).toContain('<Picker> called props.list as a function')
    expect(msg).toContain("'list' is a compiler-wrapped reactive prop")
    expect(msg).toContain('auto-unwraps')
    expect(msg).toContain('list={() => value}')
  })

  it('a genuine unrelated "x is not a function" (no getter descriptor) gets NO prop diagnosis', () => {
    const Broken: ComponentFn = () => {
      // Thrown directly with the exact message shape V8 produces for calling
      // a non-function (`const x = 5; x()` → "x is not a function") — a real
      // TypeError instance whose message MATCHES the diagnosis regex, while
      // props.x carries a plain DATA descriptor (no getter). This exercises
      // the "regex matches but no getter descriptor" negative path without a
      // literal non-function invocation (code-quality finding on the old
      // `(5 as unknown as () => void)()` form; behavior-identical).
      throw new TypeError('x is not a function')
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    mount(h(Broken, { x: 'a plain data prop' }), el)

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('threw during setup'),
      expect.any(Error),
    )
    expect(diagCalls().length).toBe(0)
  })

  it('a non-TypeError setup throw gets NO prop diagnosis', () => {
    const Broken: ComponentFn = () => {
      throw new Error('list is not a function') // message matches, type does not
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    mount(h(Broken, { list: _rp(() => [1]) }), el)
    expect(diagCalls().length).toBe(0)
  })
})
