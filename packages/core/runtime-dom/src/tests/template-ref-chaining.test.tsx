/**
 * Runtime lock for sibling-ref CHAINING — the compiled template's shortened
 * walks must resolve to the SAME nodes the fully-expanded walks did.
 *
 * `childNodeAccessor` now emits `__e0.nextElementSibling` where it used to emit
 * `__root.firstElementChild.nextElementSibling`, so a K-child template costs
 * O(K) DOM property reads instead of O(K²). `template-ref-chaining.test.ts` (in
 * `@pyreon/compiler`) locks the emitted SHAPE; a shape assertion cannot tell you
 * the refs still point at the right nodes, so these specs MOUNT the emitted code
 * and read the resulting DOM.
 *
 * Every spec compiles REAL JSX source through `transformJSX` — the actual
 * client transform, NOT vitest's JSX transform, which routes through `h()` and
 * would mask template-codegen bugs entirely (see anti-patterns "the flow
 * package's vitest-browser tests use a JSX transform that does NOT match the
 * real compiler"). Sibling file `slot-before-sibling-refs.test.tsx` locks the
 * phase-1/phase-2 ORDERING that makes chaining safe; this file locks that the
 * chained refs are correct — including the cases where chaining hangs a ref off
 * a placeholder const that phase 2 later removes or replaces.
 */
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { Fragment, h, _rp, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'

import { _tpl, _bindText, _bindDirect, _mountSlot, _textSlot, _setChild, _setChildAt } from '../template'
import { _applyProps, _setAttr, _setClass, _setStyle, mountChild } from '../index'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _setChild,
  _setChildAt,
  _mountSlot,
  _textSlot,
  _rp,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

function lowerResidualJsx(code: string): string {
  return transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
}

/** Compile a source defining `App` with the REAL transform, mount it, return the host. */
function mountSource(
  source: string,
  globals: Record<string, unknown> = {},
): { container: HTMLDivElement; cleanup: () => void } {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lowerResidualJsx(code.replace(/^import\s+.*$/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  const App = fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(h(App as never, null), container) ?? (() => {})
  return { container, cleanup }
}

describe('compiled sibling-ref chaining — shortened walks resolve identically', () => {
  it('an 8-cell row binds every cell to its OWN node, in order', () => {
    const sigs = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`c${i}`, signal(`v${i}`)]),
    )
    const src = `export function App() {
      return <tr>${Array.from({ length: 8 }, (_, i) => `<td>{c${i}()}</td>`).join('')}</tr>
    }`
    const { container, cleanup } = mountSource(src, sigs)
    const cells = [...container.querySelectorAll('td')].map((td) => td.textContent)
    expect(cells).toEqual(['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'])
    // Each binding is live and independent — a shortened walk that aliased two
    // refs would show up as two cells changing together.
    ;(sigs.c5 as ReturnType<typeof signal<string>>).set('CHANGED')
    expect([...container.querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      'v0', 'v1', 'v2', 'v3', 'v4', 'CHANGED', 'v6', 'v7',
    ])
    cleanup()
  })

  it('a nested subtree chained off its own parent binds the right nodes', () => {
    const a = signal('A')
    const b = signal('B')
    const c = signal('C')
    const src = `export function App() {
      return <div><section><span>{a()}</span><span>{b()}</span></section><footer>{c()}</footer></div>
    }`
    const { container, cleanup } = mountSource(src, { a, b, c })
    expect([...container.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['A', 'B'])
    expect(container.querySelector('footer')?.textContent).toBe('C')
    b.set('B2')
    expect([...container.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['A', 'B2'])
    cleanup()
  })

  it('a ref chained off a placeholder that _mountSlot REMOVES still resolves', () => {
    // `__e0 = __p0.nextSibling` where `__p0` is the slot's `<!>` placeholder.
    // Phase 1 reads it against the pristine clone; phase 2 then removes `__p0`.
    // If the capture ever slipped past the mutation, `__e0` would be the slot's
    // marker comment (or null) and the binding below would throw or write nowhere.
    const show = signal(false)
    const label = signal('tail')
    const src = `export function App() {
      return <div>{show() && <em>x</em>}<b>{label()}</b></div>
    }`
    const { container, cleanup } = mountSource(src, { show, label })
    expect(container.querySelector('b')?.textContent).toBe('tail')
    label.set('tail2')
    expect(container.querySelector('b')?.textContent).toBe('tail2')
    // Flip the slot twice — the double flip is the shape that historically lost
    // the subtree when a sibling ref had resolved to another slot's marker.
    show.set(true)
    expect(container.querySelector('em')?.textContent).toBe('x')
    show.set(false)
    expect(container.querySelector('em')).toBeNull()
    show.set(true)
    expect(container.querySelector('em')?.textContent).toBe('x')
    expect(container.querySelector('b')?.textContent).toBe('tail2')
    cleanup()
  })

  it('mixed-content placeholders chained off each other replace the right nodes', () => {
    const a = signal('1')
    const b = signal('2')
    const src = `export function App() { return <div><span>{a()}{b()}</span></div> }`
    const { container, cleanup } = mountSource(src, { a, b })
    expect(container.querySelector('span')?.textContent).toBe('12')
    b.set('9')
    expect(container.querySelector('span')?.textContent).toBe('19')
    a.set('8')
    expect(container.querySelector('span')?.textContent).toBe('89')
    cleanup()
  })

  it('a far sibling reached by one chained hop binds the right cell', () => {
    // Index 9 — the shape where the `children[]` cutoff used to fire. With
    // index 8 captured it is now ONE hop; the node must be unchanged.
    const sigs = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`c${i}`, signal(String(i))]),
    )
    const src = `export function App() {
      return <ul>${Array.from({ length: 10 }, (_, i) => `<li>{c${i}()}</li>`).join('')}</ul>
    }`
    const { container, cleanup } = mountSource(src, sigs)
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    )
    ;(sigs.c9 as ReturnType<typeof signal<string>>).set('LAST')
    expect(container.querySelectorAll('li')[9]?.textContent).toBe('LAST')
    cleanup()
  })

  it('the SSR emit has no ref walks to chain — this is a client-only change', () => {
    // Chaining lives in `childNodeAccessor`, which only the CLIENT template path
    // calls: SSR lowers the same source to string concatenation, never to a
    // pristine-clone pointer walk. Asserting the SSR emit contains no walk at
    // all is what makes "SSR is unaffected" a checked claim rather than a
    // reassurance. (Byte-level SSR parity across backends is separately locked
    // by the compiler's `compareSsr` + fuzz-equivalence suites.)
    const src = `export function App() {
      return <tr><td>{a()}</td><td>{b()}</td><td>{c()}</td></tr>
    }`
    const ssr = transformJSX(src, 'test.tsx', { ssr: true }).code
    expect(ssr).not.toContain('firstElementChild')
    expect(ssr).not.toContain('nextElementSibling')
    const client = transformJSX(src, 'test.tsx').code
    expect(client).toContain('nextElementSibling')
  })
})
