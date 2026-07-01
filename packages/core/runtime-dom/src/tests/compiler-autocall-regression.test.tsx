/**
 * Runtime regression locks for the 2026-07 auto-call bug family — fuzz-found
 * divergences between the compiler backends that were RUNTIME-BROKEN on the
 * shipped (native-first) path. Full pipeline per the compiler-integration
 * harness: source → transformJSX (native-first) → esbuild JSX lowering (pass
 * 2 of the real Vite pipeline) → mount → signal flip → DOM assertion.
 *
 * The four locked bug shapes (see compiler r21-autocall-reachability.test.ts
 * for the emit-form + byte-equivalence layer of the same fix):
 *   1. `onClick={() => s.set(s + 1)}` — the canonical counter — added the
 *      signal FUNCTION on the native backend (auto-call never descended
 *      into handler bodies).
 *   2. `title={s ? "a" : "b"}` inside a `.map` re-emit was stuck forever
 *      (bare signal function is always truthy) in BOTH backends.
 *   3. `id={`v${s}`}` inside a conditional slot stringified the signal's
 *      SOURCE CODE into the DOM attribute on the native backend.
 *   4. `tabIndex={-1}` (signed literal) was silently DROPPED from the DOM
 *      by the native backend's static-attr catch-all.
 * Plus the fine-grained contract the fix standardizes:
 *   5. An EXACTLY-BARE signal attr in a conditional slot updates the
 *      attribute WITHOUT remounting the branch (same element identity).
 */
import { transformSync } from 'esbuild'
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, _rp, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { _tpl, _bindText, _bindDirect } from '../template'
import { _applyProps, _setStyle, mountChild, _mountSlot } from '../index'

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

/** Pass 2 of the real pipeline: lower remaining JSX to h() calls. */
function lowerJsx(code: string): string {
  return transformSync(code, {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
}

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _mountSlot,
  _rp,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const

/**
 * Compile a `const view = <jsx>` source (with signals declared in-file so the
 * compiler tracks them), execute it against the real runtime, mount, and
 * return the container + the live signals.
 */
function mountCompiled(source: string) {
  const out = transformJSX(source, 'regression.tsx').code
  const body = lowerJsx(stripImports(out)) + '\nreturn { view, s0, s1 }'
  const fn = new Function(...Object.keys(RUNTIME_DEPS), body)
  const { view, s0, s1 } = fn(...Object.values(RUNTIME_DEPS))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(view, container)
  return { container, s0, s1, cleanup, code: out }
}

const PRELUDE = 'const s0 = signal(1)\nconst s1 = signal(5)\n'

describe('compiler auto-call — runtime regression locks (native-first path)', () => {
  it('1. canonical counter handler: click increments the VALUE, not the function', () => {
    const { container, s1 } = mountCompiled(
      PRELUDE + 'const view = <button onClick={() => s1.set(s1 + 1)}>go</button>',
    )
    const btn = container.querySelector('button') as HTMLButtonElement & {
      __ev_click?: (e: unknown) => void
    }
    // Template-path handlers attach via the delegation expando — invoke it
    // directly (happy-dom has no delegation root here).
    btn.__ev_click?.({})
    // Pre-fix native emit was `s1.set(s1 + 1)` → "() => {...}1" garbage.
    expect(s1()).toBe(6)
    btn.__ev_click?.({})
    expect(s1()).toBe(7)
  })

  it('2. .map re-emit ternary attr tracks the signal (was stuck forever)', () => {
    const { container, s1 } = mountCompiled(
      PRELUDE + 'const view = <ul>{[1,2].map((i) => <li title={s1 ? "a" : "b"}>{i}</li>)}</ul>',
    )
    expect(container.querySelector('li')!.getAttribute('title')).toBe('a')
    s1.set(0)
    expect(container.querySelector('li')!.getAttribute('title')).toBe('b')
  })

  it('3. conditional-slot template-literal attr renders the VALUE, not the signal source', () => {
    const { container } = mountCompiled(
      PRELUDE + 'const view = <ul>{s0() ? <span id={`v${s1}`}>x</span> : null}</ul>',
    )
    // Pre-fix native emit left `v${s1}` bare → id="v(...args) => {…" garbage.
    expect(container.querySelector('span')!.getAttribute('id')).toBe('v5')
  })

  it('4. signed-literal attr is present in the DOM (was silently dropped)', () => {
    const { container } = mountCompiled(PRELUDE + 'const view = <p tabIndex={-1}>x</p>')
    expect(container.querySelector('p')!.getAttribute('tabindex')).toBe('-1')
  })

  it('5. EXACTLY-BARE slot attr is fine-grained: value updates, element identity survives', () => {
    const { container, s1 } = mountCompiled(
      PRELUDE + 'const view = <ul>{s0() ? <span title={s1}>x</span> : null}</ul>',
    )
    const before = container.querySelector('span')!
    expect(before.getAttribute('title')).toBe('5')
    s1.set(9)
    const after = container.querySelector('span')!
    expect(after.getAttribute('title')).toBe('9')
    // The whole point of leaving the bare signal uncalled in the slot: the
    // attr updates through its own renderEffect — the branch is NOT
    // remounted (no DOM state loss).
    expect(after).toBe(before)
  })

  it('6. duplicate static attrs: LAST value wins in the rendered DOM (JSX object semantics)', () => {
    const { container } = mountCompiled(PRELUDE + 'const view = <p id="a" title="t" id="b">x</p>')
    const p = container.querySelector('p')!
    expect(p.getAttribute('id')).toBe('b')
    expect(p.getAttribute('title')).toBe('t')
  })

  it('7. undefined attr is absent (setAttribute would coerce to the string "undefined")', () => {
    const { container } = mountCompiled(
      PRELUDE + 'const view = <div hidden={undefined}><span /></div>',
    )
    expect(container.querySelector('div')!.hasAttribute('hidden')).toBe(false)
  })
})
