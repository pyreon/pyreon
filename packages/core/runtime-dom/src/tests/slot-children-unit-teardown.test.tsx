/**
 * A compiled template's STATIC slot (`<div class="list">{children}</div>`,
 * `children` a plain array of component rows) tears down as a UNIT: the rows'
 * effects are disposed, but no row is removed from the DOM one by one — the
 * container leaves with the clone.
 *
 * Before `mountChildAsUnit`, `_mountSlot` mounted the array outside
 * `mountElement`'s depth window, so every row owned a real remover: on the
 * dispose-500 board 500 individual `removeChild` calls on a live tree were 64%
 * of Pyreon's teardown (116µs wall vs 26µs for the same rows through `h()`).
 *
 * Compiled through the REAL `transformJSX`, because vitest's own JSX transform
 * never emits `_tpl`/`_mountSlot`. A reactive slot keeps its removers (its
 * range must be replaceable), which the last spec pins.
 */
import { transformJSX } from '@pyreon/compiler'
import { _lc, _rp, _rpd, _wrapSpread, For, Fragment, h, Show } from '@pyreon/core'
import { _bind, effect, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _applyProps, _bindDirect, _bindText, _bindProp, _mountSlot, _textSlot, _setChild, _setChildAt, _mountChild,
  _setHtml, _setAttr, _setClass, _setStyle, _tpl, mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const RUNTIME_DEPS = {
  _tpl, _bind, _bindText, _bindProp, _bindDirect, _applyProps, _setStyle, _setAttr, _setClass, _mountSlot, _textSlot,
  _setChild, _setChildAt, _mountChild, _setHtml, bindPolymorphicText, h, Fragment, For, Show, _lc, _rp, _rpd,
  _wrapSpread, signal, effect,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)
const lowerResidualJsx = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code
function compileApp(source: string, S: unknown[]): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, 'S', `${body}\nreturn App`)(...DEP_VALUES, S) as () => unknown
}

/** Count `removeChild` calls whose target matches `pred`, over `fn`. */
function countRemovals(pred: (n: Node) => boolean, fn: () => void): number {
  const orig = Node.prototype.removeChild
  let n = 0
  const spy = vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function (this: Node, child: Node) {
    if (pred(child)) n++
    return orig.call(this, child)
  })
  try {
    fn()
  } finally {
    spy.mockRestore()
  }
  return n
}
const isRow = (n: Node) => n.nodeType === 1 && (n as Element).classList.contains('fx-row')

const LIST = `
const Row = (props) => { effect(() => { S[1].push(props.value()) }); return <span class="fx-row">{() => props.value()}</span> }
const List = (props) => {
  const children = []
  for (let i = 0; i < props.rows.length; i++) children.push(<Row value={props.rows[i].value} />)
  return <div class="fx-list">{children}</div>
}
const App = () => <List rows={S[0]} />
`

describe('static slot children tear down as a unit', () => {
  it('disposes every row effect but removes NO row individually', () => {
    const sigs = Array.from({ length: 50 }, (_, i) => signal(i))
    const rows = sigs.map((s) => ({ value: s }))
    const runs: number[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(compileApp(LIST, [rows, runs]) as never, null), host)
    expect(host.querySelectorAll('span.fx-row').length).toBe(50)
    expect(runs.length).toBe(50)
    const removed = countRemovals(isRow, () => dispose())
    expect(removed).toBe(0) // the container leaves with the clone
    expect(host.querySelectorAll('span.fx-row').length).toBe(0)
    // effects are gone: a write reaches nothing
    sigs[0]!.set(999)
    expect(runs.length).toBe(50)
  })

  it('a REACTIVE slot still owns its range — a flip removes the old rows itself', () => {
    const show = signal(true)
    const src = `
const App = () => <div class="fx-list">{() => (S[0]() ? [<span class="fx-row">a</span>, <span class="fx-row">b</span>] : null)}</div>
`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(compileApp(src, [show]) as never, null), host)
    expect(host.querySelectorAll('span.fx-row').length).toBe(2)
    const removed = countRemovals(isRow, () => show.set(false))
    expect(removed).toBe(2)
    expect(host.querySelectorAll('span.fx-row').length).toBe(0)
    show.set(true)
    expect(host.querySelectorAll('span.fx-row').length).toBe(2)
    dispose()
  })

  it('a nested static slot inside the clone is a unit too', () => {
    const src = `
const App = () => { const inner = [<span class="fx-row">x</span>, <span class="fx-row">y</span>]; return <section><div class="fx-list">{inner}</div><p>tail</p></section> }
`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(compileApp(src, []) as never, null), host)
    expect(host.querySelectorAll('span.fx-row').length).toBe(2)
    expect(countRemovals(isRow, () => dispose())).toBe(0)
    expect(host.innerHTML).toBe('')
  })
})
