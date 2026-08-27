/**
 * A reactive accessor mounted as a `<Show>` CHILD must keep re-tracking.
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
import { Fragment, h, Show, _lc, _rp, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, test } from 'vitest'
import { _applyProps, _setAttr, _setStyle, bindPolymorphicText, mountChild } from '../index'
import { _bindDirect, _bindText, _mountSlot, _setChild, _setChildAt, _tpl } from '../template'

const RUNTIME_DEPS = {
  _tpl, _bind, _bindText, _bindDirect, _applyProps, _setStyle, _setAttr,
  _mountSlot, _setChild, _setChildAt, bindPolymorphicText, _rp, _cx: cx,
  h, Fragment, Show, _lc, signal, document,
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

describe('Show child accessor re-tracking', () => {
  test('the compiler emits a templated child inside Show (premise guard)', () => {
    // If a compiler change stops producing this shape, the spec below would
    // pass while no longer reproducing anything.
    const { code } = transformJSX(
      `function App() {
         return <div><Show when={() => g()}><p>{() => v()}</p></Show></div>
       }`,
      'test.tsx',
    )
    expect(code).toContain('_tpl(')
  })

  test('survives a `when` re-run that produces the SAME boolean', async () => {
    // The real shape. `when={() => selected() !== undefined}` re-runs whenever
    // `selected` changes, but the BOOLEAN is unchanged — so the children must
    // stay put. If Show re-mounts on an unchanged verdict, the child's binding
    // is replaced and whichever copy is left in the DOM stops updating.
    const sel = signal<string | undefined>(undefined)
    const value = signal('a')
    const { container, cleanup } = compileAndMount(
      `function App() {
         return (
           <div>
             <Show when={() => sel() !== undefined} fallback={<p id="f">empty</p>}>
               <p id="t">{() => value()}</p>
             </Show>
           </div>
         )
       }`,
      { sel, value },
    )
    mounted.push(cleanup)

    sel.set('one')
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('a')

    value.set('b')
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('b')

    // `when` re-runs here and yields `true` again — nothing structural changed.
    sel.set('two')
    await Promise.resolve()
    expect(container.querySelectorAll('#t')).toHaveLength(1)

    value.set('c')
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('c')
  })

  test('keeps re-tracking when the signal is created LAZILY on first access', async () => {
    // The real shape: `@pyreon/query`'s result fields are slots created on
    // FIRST GETTER ACCESS — and inside a `<Show>` that first access happens
    // during the deferred mount, i.e. inside a tracking frame that is not the
    // component's own.
    const gate = signal(false)
    const slots: Record<string, ReturnType<typeof signal>> = {}
    const result = {
      get data() {
        return (slots.data ??= signal('a'))
      },
    }
    const { container, cleanup } = compileAndMount(
      `function App() {
         return (
           <div>
             <Show when={() => gate()} fallback={<p id="f">empty</p>}>
               <p id="t">{() => result.data()}</p>
             </Show>
           </div>
         )
       }`,
      { gate, result },
    )
    mounted.push(cleanup)

    gate.set(true)
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('a')

    slots.data!.set('b')
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('b')

    slots.data!.set('c')
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('c')
  })

  test('keeps re-tracking with a FALLBACK present', async () => {
    const gate = signal(false)
    const value = signal('a')
    const { container, cleanup } = compileAndMount(
      `function App() {
         return (
           <div>
             <Show when={() => gate()} fallback={<p id="f">empty</p>}>
               <p id="t">{() => value()}</p>
             </Show>
           </div>
         )
       }`,
      { gate, value },
    )
    mounted.push(cleanup)

    expect(container.querySelector('#f')).not.toBeNull()
    gate.set(true)
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('a')

    value.set('b')
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('b')

    value.set('c')
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('c')
  })

  test('keeps re-tracking across MULTIPLE updates', async () => {
    const gate = signal(false)
    const value = signal('a')
    const { container, cleanup } = compileAndMount(
      `function App() {
         return (
           <div>
             <Show when={() => gate()}>
               <p id="t">{() => value()}</p>
             </Show>
           </div>
         )
       }`,
      { gate, value },
    )
    mounted.push(cleanup)

    gate.set(true)
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('a')

    value.set('b')
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('b')

    // The SECOND update is the one that regressed.
    value.set('c')
    await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('c')
  })
})
