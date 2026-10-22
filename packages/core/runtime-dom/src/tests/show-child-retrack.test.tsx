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
import { Fragment, h, Show, _fuse, _lc, _rp, _rpd, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
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

  test('MULTI-child Show keeps updating after `when` re-runs truthy (#3955)', async () => {
    // The issue's exact shape: more than one child, and a signal read by
    // `when` changes while the verdict stays true. With a sole child the
    // memoized `_lc` value hid this; with several, `props.children` is an
    // ARRAY, and a fresh array per read defeats an identity comparison, so the
    // boundary tore the existing nodes down and re-mounted them without
    // re-binding.
    const page = signal(1)
    const count = signal(0)
    const { container, cleanup } = compileAndMount(
      `function App() {
         return (
           <Show when={() => page() > 0}>
             <p>header</p>
             <p id="count">{() => 'count: ' + count()}</p>
           </Show>
         )
       }`,
      { page, count },
    )
    mounted.push(cleanup)

    count.set(1)
    await Promise.resolve()
    expect(container.querySelector('#count')?.textContent).toBe('count: 1')

    page.set(2) // `when` re-runs; the verdict is still true
    await Promise.resolve()
    count.set(2)
    await Promise.resolve()
    expect(container.querySelector('#count')?.textContent).toBe('count: 2')
    count.set(3)
    await Promise.resolve()
    expect(container.querySelector('#count')?.textContent).toBe('count: 3')
    expect(container.querySelectorAll('#count')).toHaveLength(1)
  })

  test('MULTI-child Show inside a wrapping element (the same bug, nested)', async () => {
    const page = signal(1)
    const count = signal(0)
    const { container, cleanup } = compileAndMount(
      `function App() {
         return (
           <div>
             <Show when={() => page() > 0}>
               <p>header</p>
               <p id="count">{() => 'count: ' + count()}</p>
             </Show>
           </div>
         )
       }`,
      { page, count },
    )
    mounted.push(cleanup)
    page.set(2)
    await Promise.resolve()
    count.set(2)
    await Promise.resolve()
    expect(container.querySelector('#count')?.textContent).toBe('count: 2')
    expect(container.querySelectorAll('#count')).toHaveLength(1)
  })

  test('hide then show again keeps updating — sole child', async () => {
    const gate = signal(true)
    const value = signal('a')
    const { container, cleanup } = compileAndMount(
      `function App() { return <div><Show when={() => gate()}><p id="t">{() => value()}</p></Show></div> }`,
      { gate, value },
    )
    mounted.push(cleanup)
    gate.set(false); await Promise.resolve()
    gate.set(true); await Promise.resolve()
    value.set('b'); await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('b')
  })

  test('hide then show again keeps updating — multiple children', async () => {
    const gate = signal(true)
    const value = signal('a')
    const { container, cleanup } = compileAndMount(
      `function App() { return <div><Show when={() => gate()}><p>h</p><p id="t">{() => value()}</p></Show></div> }`,
      { gate, value },
    )
    mounted.push(cleanup)
    gate.set(false); await Promise.resolve()
    gate.set(true); await Promise.resolve()
    value.set('b'); await Promise.resolve()
    expect(container.querySelector('#t')?.textContent).toBe('b')
  })

  test('an UNCHANGED `when` keeps the same DOM nodes for several children', async () => {
    // Rebuilding on every re-run would also work now that items are
    // re-mountable, but it would drop focus, selection and typed input. The
    // verdict did not change, so nothing may be touched.
    const page = signal(1)
    const count = signal(0)
    const { container, cleanup } = compileAndMount(
      `function App() {
         return (
           <Show when={() => page() > 0}>
             <p>header</p>
             <p id="count">{() => 'count: ' + count()}</p>
           </Show>
         )
       }`,
      { page, count },
    )
    mounted.push(cleanup)
    const before = container.querySelector('#count')
    page.set(2)
    await Promise.resolve()
    expect(container.querySelector('#count')).toBe(before)
    count.set(5)
    await Promise.resolve()
    expect(before?.textContent).toBe('count: 5')
  })

  test('a re-run with the SAME array mutated in place still re-mounts it', async () => {
    // `signal.trigger()` re-notifies after an in-place mutation; identity alone
    // cannot see it, so the skip must compare the elements too. Mounted
    // directly: a compiled `{() => list()}` inside an element takes a different
    // path and would never reach the boundary under test.
    const list = signal<unknown[]>([])
    const container = document.createElement('div')
    document.body.appendChild(container)
    mounted.push(mountChild((() => list()) as never, container) ?? (() => {}))
    list.set([_tpl('<p id="n">n</p>', () => null, 1), h('p', { id: 'a' }, 'a')])
    await Promise.resolve()
    expect(container.querySelectorAll('p')).toHaveLength(2)
    ;(list.peek() as unknown[]).push(h('p', { id: 'c' }, 'c'))
    list.trigger()
    await Promise.resolve()
    expect(container.querySelectorAll('p')).toHaveLength(3)
  })
})
