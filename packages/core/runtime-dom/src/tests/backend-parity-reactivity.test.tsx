/**
 * Behavioral lock for the two compiler-backend parity fixes that LOST
 * REACTIVITY (not just emitted different text).
 *
 * The source is compiled through the REAL `transformJSX` (the native binary
 * when it loads), then mounted and driven by a signal change. Output-string
 * assertions live in `native-equivalence.test.ts`; these prove the value
 * actually updates in the DOM.
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, _rp, _rpd, cx } from '@pyreon/core'
import { jsx, jsxs } from '@pyreon/core/jsx-runtime'
import { transformSync } from 'esbuild'
import { _bind, signal, renderEffect } from '@pyreon/reactivity'
import { _tpl, _bindText, _bindDirect, _setChild, _setChildAt } from '../template'
import {
  _applyProps,
  _setAttr,
  _setClass,
  _setStyle,
  _setStyleOnce,
  _setValue,
  _setHtml,
  bindPolymorphicText,
  mountChild,
  _bindProp,
} from '../index'

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  renderEffect,
  _bindText,
  _bindProp,
  _bindDirect,
  _setChild,
  _setChildAt,
  bindPolymorphicText,
  _applyProps,
  _setStyle,
  _setStyleOnce,
  _setClass,
  _setAttr,
  _setValue,
  _setHtml,
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

/**
 * Compile `source` through the REAL `transformJSX`, then lower whatever JSX the
 * compiler deliberately leaves raw (object-literal methods, HOF returns, array
 * elements, default exports) with the automatic runtime, exactly as the Vite
 * pipeline does. Returns the value of `exportName` (a const in the module).
 */
function compileNamed(source: string, exportName: string) {
  const lowered = transformJSX(source, 'test.tsx').code
  const { code } = transformSync(lowered, {
    loader: 'tsx',
    jsx: 'automatic',
    jsxImportSource: '@pyreon/core',
    format: 'esm',
  })
  const body = stripImports(code)
  // esbuild's automatic runtime names the factories `jsx` / `jsxs` (unaliased);
  // `Fragment` is already provided by DEP_NAMES from @pyreon/core.
  const fn = new Function(...DEP_NAMES, 'jsx', 'jsxs', `${body}\nreturn ${exportName}`)
  return fn(...DEP_VALUES, jsx, jsxs) as unknown
}

function mountWith(component: unknown, props: Record<string, unknown>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  mountChild(h(component as never, props as never), container)
  return container
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('backend parity #1 — prop-derived chain inside an object-literal method stays reactive', () => {
  it('a → props.s → b feeds a child component prop; a signal change updates the DOM', () => {
    const source = `
const Foo = (props) => <span>{props.x}</span>
const O = {
  r: (props) => {
    const a = props.s
    const b = a + 1
    return <Foo x={b} />
  },
}
const Comp = O.r
`
    const Comp = compileNamed(source, 'Comp')
    const s = signal(1)
    const container = mountWith(Comp, { s: _rp(() => s()) })

    expect(container.querySelector('span')!.textContent).toBe('2')
    s.set(5)
    expect(container.querySelector('span')!.textContent).toBe('6')
  })
})

describe('backend parity #2 — defaulted props param is reactive', () => {
  it('`const C = (props = {}) => <div>{props.x}</div>` updates when props.x changes', () => {
    const Comp = compileNamed(
      'const Comp = (props = {}) => <div>{props.x}</div>',
      'Comp',
    )
    const x = signal('first')
    const container = mountWith(Comp, { x: _rp(() => x()) })

    expect(container.querySelector('div')!.textContent).toBe('first')
    x.set('second')
    expect(container.querySelector('div')!.textContent).toBe('second')
  })
})
