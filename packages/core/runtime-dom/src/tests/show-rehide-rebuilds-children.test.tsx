/**
 * Issue #4004: markup written inline as a `<Show>` child must come back WHOLE after `when` goes false then true.
 * The mapped array (`{list.map(...)}`) and the nested `<Show>` used to come back empty on 0.53.0 (fixed by #3975's
 * remountable templates). Compiled through the real `transformJSX`: vitest's own JSX transform never emits `_tpl`.
 *
 * (Original header, kept for the shared harness below:) A reactive accessor mounted as a `<Show>` CHILD must keep re-tracking.
 *
 * Observed building `examples/lathe-bookshelf`: the accessor rendered, updated
 * ONCE when its value first arrived, and then never again — while `Show`'s own
 * condition was unchanged and the child stayed mounted. Moving the identical
 * accessor OUT of the `<Show>` made it fully reactive.
 *
 * These specs compile REAL source through `transformJSX`, because vitest's own
 * JSX transform never emits `_tpl`/`_mountSlot` and the plain `h()` path does
 * not reproduce the bug at all.
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, Show, _fuse, _lc, _rp, cx } from '@pyreon/core'
import { _bind, computed, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, test } from 'vitest'
import { _applyProps, _setAttr, _setStyle, _setStyleOnce, bindPolymorphicText, mountChild} from '../index'
import { _bindDirect, _bindText, _bindProp, _mountSlot, _setChild, _setChildAt, _tpl } from '../template'

const RUNTIME_DEPS = {
  _tpl, _bind, _bindText, _bindProp, _bindDirect, _applyProps, _setStyle, _setStyleOnce, _setAttr,
  _mountSlot, _setChild, _setChildAt, bindPolymorphicText, _rp, _cx: cx,
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

describe('Show re-hide / re-show rebuilds inline children (#4004)', () => {
  test('mapped array and nested Show come back after false -> true', () => {
    const on = signal(true), tab = signal('a')
    const onA = computed(() => tab() === 'a')
    const { container, cleanup } = compileAndMount(
      `function App() {
         return <div><Show when={() => on()}>
           <div>
             <nav>{[1, 2].map((n) => <button>{'b' + n}</button>)}</nav>
             <Show when={onA}><i>A</i></Show>
           </div>
         </Show></div>
       }`,
      { on, onA },
    )
    mounted.push(cleanup)
    expect(container.querySelectorAll('button').length).toBe(2)
    expect(container.querySelectorAll('i').length).toBe(1)
    on.set(false)
    on.set(true)
    expect(container.querySelectorAll('button').length).toBe(2)
    expect(container.querySelectorAll('i').length).toBe(1)
  })
})
