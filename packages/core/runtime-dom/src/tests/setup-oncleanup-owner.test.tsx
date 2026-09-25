/**
 * `onCleanup()` called synchronously during COMPONENT SETUP belongs to the
 * component: it runs once, when that component unmounts.
 *
 * Before the fix `onCleanup` only registered while an EFFECT run had its
 * collector window open, and component setup opened no window of its own. So
 * setup-time cleanups either (a) vanished — a root-mounted component never ran
 * them — or (b) latched onto whichever reactive boundary happened to be mounting
 * the component (`<For>`, `<Show>`, a routed page), firing on every re-run of
 * THAT effect while the component was still mounted.
 *
 * Specs compile through the REAL `transformJSX` (vitest's own JSX transform
 * never emits `_tpl`/`_mountSlot`) and also mount plain `h()` trees.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h, Show, _rp, _rpd, cx } from '@pyreon/core'
import { _bind, effect, onCleanup, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, test } from 'vitest'
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

describe('setup-time onCleanup is owned by the component', () => {
  test('root-mounted component: cleanup runs exactly once on unmount (h path)', () => {
    const log: string[] = []
    const Comp = () => {
      onCleanup(() => log.push('cleanup'))
      return h('span', null, 'x')
    }
    const container = document.createElement('div')
    const dispose = mountChild(h(Comp, null), container)
    expect(log).toEqual([])
    dispose()
    expect(log).toEqual(['cleanup'])
  })

  test('root-mounted component: cleanup runs once on unmount (compiled)', () => {
    const log: string[] = []
    const { cleanup } = compileAndMount(
      `function App() {
        onCleanup(() => log.push('cleanup'))
        return <div class="a"><b>hi</b></div>
      }`,
      { onCleanup, log },
    )
    expect(log).toEqual([])
    cleanup()
    expect(log).toEqual(['cleanup'])
  })

  test('<For> row add does not run surviving rows’ cleanups (compiled)', () => {
    const log: string[] = []
    const items = signal([1, 2])
    const { container, cleanup } = compileAndMount(
      `function Row(props) {
        const id = props.id
        onCleanup(() => log.push('cleanup ' + id))
        return <li>{id}</li>
      }
      function App() {
        return <ul><For each={items} by={(n) => n}>{(n) => <Row id={n} />}</For></ul>
      }`,
      { onCleanup, log, items, For },
    )
    expect(container.querySelectorAll('li').length).toBe(2)
    items.set([1, 2, 3])
    expect(container.querySelectorAll('li').length).toBe(3)
    expect(log).toEqual([])
    items.set([1, 3])
    expect(log).toEqual(['cleanup 2'])
    cleanup()
    expect(log.sort()).toEqual(['cleanup 1', 'cleanup 2', 'cleanup 3'])
  })

  test('<Show> flip runs only the removed branch’s cleanups, once (compiled)', () => {
    const log: string[] = []
    const on = signal(true)
    const { cleanup } = compileAndMount(
      `function A() { onCleanup(() => log.push('A')); return <p>a</p> }
      function B() { onCleanup(() => log.push('B')); return <p>b</p> }
      function App() {
        return <div><Show when={() => on()} fallback={<B />}><A /></Show></div>
      }`,
      { onCleanup, log, on, Show },
    )
    expect(log).toEqual([])
    on.set(false)
    expect(log).toEqual(['A'])
    on.set(true)
    expect(log).toEqual(['A', 'B'])
    cleanup()
    expect(log).toEqual(['A', 'B', 'A'])
  })

  test('effect() inside setup keeps its own per-run onCleanup semantics', () => {
    const log: string[] = []
    const s = signal(0)
    const Comp = () => {
      effect(() => {
        const v = s()
        onCleanup(() => log.push('run ' + v))
      })
      onCleanup(() => log.push('setup'))
      return h('i', null)
    }
    const dispose = mountChild(h(Comp, null), document.createElement('div'))
    s.set(1)
    expect(log).toEqual(['run 0'])
    dispose()
    expect(log).toContain('setup')
    expect(log).toContain('run 1')
    expect(log.filter((l) => l === 'setup').length).toBe(1)
  })
})

describe('onCleanup inside onMount', () => {
  test('runs once when the component unmounts', async () => {
    const { onMount } = await import('@pyreon/core')
    const log: string[] = []
    const Comp = () => {
      onMount(() => {
        onCleanup(() => log.push('mount-cleanup'))
      })
      return h('i', null)
    }
    const dispose = mountChild(h(Comp, null), document.createElement('div'))
    expect(log).toEqual([])
    dispose()
    expect(log).toEqual(['mount-cleanup'])
  })
})
