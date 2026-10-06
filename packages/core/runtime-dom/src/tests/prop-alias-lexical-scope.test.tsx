/**
 * Mounted proof for #3815: a prop-derived alias must not leak out of the
 * function that declared it. Before the fix `Second` (which has no `props`)
 * compiled to `bindPolymorphicText(() => props.label)` and threw
 * `ReferenceError: props is not defined` at mount.
 *
 * Compiles REAL source through `transformJSX` (vitest's own JSX transform
 * never emits the inlined `props.*` reads, so it cannot reproduce this).
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, Show, _fuse, _lc, _rp, _rpd, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, test } from 'vitest'
import { _applyProps, _setAttr, _setStyle, bindPolymorphicText, mountChild } from '../index'
import { _bindDirect, _bindText, _bindProp, _mountSlot, _setChild, _setChildAt, _textSlot, _tpl } from '../template'

const RUNTIME_DEPS = {
  _tpl, _bind, _bindText, _bindProp, _bindDirect, _applyProps, _setStyle, _setAttr,
  _mountSlot, _setChild, _setChildAt, _textSlot, bindPolymorphicText, _rp, _rpd, _cx: cx,
  h, Fragment, Show, _lc, _fuse, signal, document,
} as const
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const stripImports = (code: string) => code.replace(/^import\s+.*$/gm, '').trim()
const lower = (code: string) =>
  transformSync(code, { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code

function compileAndMount(source: string, globals: Record<string, unknown>) {
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

describe('prop-derived alias is lexically scoped (#3815)', () => {
  test('a sibling component with its own `label` mounts its own value and the aliasing one stays live', () => {
    const text = signal('first-1')
    const { container, cleanup, code } = compileAndMount(
      `function First(props) {
         const label = props.label
         return <span class="first">{label}</span>
       }
       function Second() {
         const label = 'Second'
         return <span class="second">{label}</span>
       }
       function App() {
         return <div><First label={text()} /><Second /></div>
       }`,
      { text },
    )
    mounted.push(cleanup)
    // Premise guard: the aliasing component really was inlined (otherwise the
    // spec would pass with the leak impossible to express).
    expect(code).toContain('props.label')
    expect(container.querySelector('.second')?.textContent).toBe('Second')
    expect(container.querySelector('.first')?.textContent).toBe('first-1')
    text.set('first-2')
    expect(container.querySelector('.first')?.textContent).toBe('first-2')
    expect(container.querySelector('.second')?.textContent).toBe('Second')
  })

  test('a sibling that uses an IMPORTED / module-level name of the same spelling is untouched', () => {
    const { container, cleanup } = compileAndMount(
      `function First(props) {
         const label = props.label
         return <span class="first">{label}</span>
       }
       const label = 'module'
       function Second() {
         return <span class="second">{label}</span>
       }
       function App() {
         return <div><First label="x" /><Second /></div>
       }`,
      {},
    )
    mounted.push(cleanup)
    expect(container.querySelector('.second')?.textContent).toBe('module')
    expect(container.querySelector('.first')?.textContent).toBe('x')
  })

  test('a function-local SIGNAL does not make a sibling same-named value auto-call', () => {
    const { container, cleanup } = compileAndMount(
      `function A() {
         const s = signal('sig')
         return <i class="a">{s}</i>
       }
       const s = 'plain'
       function B() {
         return <b class="b">{s}</b>
       }
       function App() {
         return <div><A /><B /></div>
       }`,
      {},
    )
    mounted.push(cleanup)
    expect(container.querySelector('.a')?.textContent).toBe('sig')
    expect(container.querySelector('.b')?.textContent).toBe('plain')
  })
})
