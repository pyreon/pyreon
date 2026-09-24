/**
 * An accessor whose RESULT is itself an accessor must still resolve to a value.
 *
 * The compiler inlines a prop-derived function-valued const at its use site, so
 *
 *     const tabIndexFor = () => (props.active ? 0 : -1)
 *     return <div {...rest} tabIndex={tabIndexFor} />
 *
 * lowers to `h('div', { ...rest, tabIndex: () => (() => …) })` on the spread
 * path. `applyProp` resolved only one level and handed the inner closure to
 * `applyStaticProp`, where `el.tabIndex = fn` coerced to 0 — every item of a
 * roving-tabindex group became a tab stop (Radio, Tabs, SegmentedControl), with
 * a dev warning per item as the only signal.
 *
 * Compiled through the REAL `transformJSX`: vitest's own JSX transform never
 * inlines the const, so it cannot produce the double accessor.
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, _rp, _rpd, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { _applyProps, _setAttr, _setStyle, bindPolymorphicText, mountChild, _bindProp} from '../index'
import { _bindDirect, _bindText, _mountSlot, _textSlot, _setChild, _setChildAt, _tpl } from '../template'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindProp,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  bindPolymorphicText,
  _rp,
  _rpd,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const stripImports = (code: string) => code.replace(/^import\s+.*$/gm, '').trim()
const lower = (code: string) =>
  transformSync(code, { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' })
    .code

/** Compile SOURCE (must define `App`) with the real transform and mount it. */
function compileAndMount(
  source: string,
  globals: Record<string, unknown>,
): { container: HTMLDivElement; cleanup: () => void; code: string } {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lower(stripImports(code).replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  const App = fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(h(App as never, null), container) ?? (() => {})
  return { container, cleanup, code }
}

const mounted: (() => void)[] = []
afterEach(() => {
  for (const c of mounted.splice(0)) c()
  document.body.innerHTML = ''
})


describe('applyProp — accessor returning an accessor', () => {
  const SOURCE = `
    function App() {
      const items = [1, 2, 3]
      return <div>{items.map((n) => <Item n={n} rest={{ 'data-n': String(n) }} />)}</div>
    }
    function Item(props) {
      const tabIndexFor = () => (active() === props.n ? 0 : -1)
      return <span {...props.rest} tabIndex={tabIndexFor}>x</span>
    }`

  test('the compiler really emits the double accessor on the spread path', () => {
    // Premise guard: if the inliner stops producing this shape the specs below
    // stop reproducing the bug while still passing.
    const { code } = transformJSX(SOURCE, 'test.tsx')
    expect(code).toContain('tabIndex={() => (() =>')
  })

  test('resolves to a number, and only the active item is a tab stop', () => {
    const active = signal(2)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container, cleanup } = compileAndMount(SOURCE, { active })
    mounted.push(cleanup)
    const spans = [...container.querySelectorAll('span')]
    expect(spans.map((s) => s.tabIndex)).toEqual([-1, 0, -1])
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('received a function'))).toEqual([])
    warn.mockRestore()
  })

  test('stays reactive through both levels', () => {
    const active = signal(1)
    const { container, cleanup } = compileAndMount(SOURCE, { active })
    mounted.push(cleanup)
    active.set(3)
    expect([...container.querySelectorAll('span')].map((s) => s.tabIndex)).toEqual([-1, -1, 0])
  })
})
