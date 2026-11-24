/**
 * Mounted proof for #4797: a bare signal passed as a COMPONENT PROP in JSX that
 * a function builds (a render prop, a handler) stays reactive.
 *
 * The compiler sliced such a function as raw source and auto-called every bare
 * signal in it, so `render={() => <For each={items}>…</For>}` compiled to
 * `each={items()}` — the `<For>` received the array once and never updated
 * (same for `<Show when={open}>`). This compiles REAL source through each
 * backend, mounts it, writes the signals and reads the DOM.
 *
 * Handlers are the other half of the rule: JSX a handler builds is built at
 * click time, so `show(<Edit row={open()} />); open.set(false)` hands the
 * dialog the click-time value (walking the handler made it `_rpd(open)`,
 * which read `false` after the click), while a bare `each={items}` there
 * passes the signal (main auto-called it to a one-time `items()`).
 */
import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import { For, Fragment, h, Show, _rp, _rpd } from '@pyreon/core'
import { type Signal, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { _applyProps, _bindSpread, bindPolymorphicText, mount } from '../index'
import { _bindText, _mountSlot, _setChild, _tpl } from '../template'

type Backend = (source: string) => string

const backends: [string, Backend][] = [
  ['JavaScript', (source) => transformJSX_JS(source, 'render-prop.tsx').code],
]

try {
  const native = createRequire(import.meta.url)('../../../compiler/native/pyreon-compiler.node') as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source) => native.transformJsx(source, 'render-prop.tsx', false, null).code])
} catch {
  // The JavaScript backend runs without the optional addon; Rust runs when built.
}

const RUNTIME = { h, Fragment, For, Show, _rp, _rpd, bindPolymorphicText, _tpl, _bindText, _mountSlot, _setChild, _applyProps, _bindSpread }

/**
 * Compile `App` with `items` / `open` as known signals (declared in the source
 * so the compiler sees them), bind them to the test's own signals, lower JSX to
 * `h` and return the component.
 */
function load(
  compile: Backend,
  jsx: string,
  items: Signal<string[]>,
  open: Signal<boolean>,
  show: (vnode: unknown) => void = () => {},
) {
  const src =
    `import { signal } from '@pyreon/reactivity'\n` +
    `const items = signal([])\nconst open = signal(false)\n` +
    `function Slot(props) { return props.render() }\n` +
    `function Edit(props) { return <i class="row">{String(props.row)}</i> }\n` +
    `function Btn(props) { return <button class="target" onClick={props.onClick}>b</button> }\n` +
    `function App() { return ${jsx} }`
  const out = compile(src)
  const body = transformSync(
    out
      .replace(/^import\s.*$/gm, '')
      .replace('const items = signal([])', '')
      .replace('const open = signal(false)', ''),
    { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' },
  ).code
  const names = Object.keys(RUNTIME)
  const App = new Function('items', 'open', 'show', ...names, `${body}\nreturn App`)(
    items,
    open,
    show,
    ...Object.values(RUNTIME),
  ) as () => unknown

  return { App, out }
}

const mounted: (() => void)[] = []

afterEach(() => {
  for (const c of mounted.splice(0)) c()
  document.body.innerHTML = ''
})

function mountApp(App: () => unknown): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(h(App as never, null), container)
  mounted.push(() => {
    unmount()
    container.remove()
  })

  return container
}

const count = (root: HTMLElement) => [root.querySelectorAll('li').length, root.querySelectorAll('b').length]

for (const [name, compile] of backends) {
  describe(`${name}: a signal passed as a component prop inside a render prop stays reactive`, () => {
    it('<For each={signal}> and <Show when={signal}> in render props (the issue repro)', () => {
      const items = signal<string[]>([])
      const open = signal(false)
      const { App, out } = load(
        compile,
        `<div>
          <Slot render={() => <ul><For each={items} by={(x) => x}>{(x) => <li>{x}</li>}</For></ul>} />
          <Slot render={() => <Show when={open}><b>open</b></Show>} />
        </div>`,
        items,
        open,
      )
      const root = mountApp(App)
      expect(count(root), out).toEqual([0, 0])
      items.set(['a', 'b'])
      open.set(true)
      expect(count(root), out).toEqual([2, 1])
      items.set(['a'])
      open.set(false)
      expect(count(root), out).toEqual([1, 0])
    })

    it('a derived prop (`when={!open}`) in a render prop', () => {
      const items = signal<string[]>([])
      const open = signal(false)
      const { App, out } = load(compile, `<Slot render={() => <Show when={!open}><b>closed</b></Show>} />`, items, open)
      const root = mountApp(App)
      expect(count(root)[1], out).toBe(1)
      open.set(true)
      expect(count(root)[1], out).toBe(0)
    })

    for (const [where, wrap] of [
      ['a template element', (h: string) => `<button class="target" onClick={${h}}>x</button>`],
      ['a component', (h: string) => `<Btn onClick={${h}} />`],
    ] as const) {
      it(`JSX built in ${where} handler: an explicit read is the click-time value`, () => {
        const items = signal<string[]>([])
        const open = signal(true)
        const host = document.createElement('div')
        document.body.appendChild(host)
        const show = (vnode: unknown) => mounted.push(mount(vnode as never, host))
        const { App, out } = load(
          compile,
          wrap('() => { show(<Edit row={open()} />); open.set(false) }'),
          items,
          open,
          show,
        )
        mountApp(App).querySelector<HTMLElement>('.target')!.click()
        // The handler cleared the signal after building the JSX: the dialog
        // keeps the value it was opened with.
        expect(host.querySelector('.row')?.textContent, out).toBe('true')
      })

      it(`JSX built in ${where} handler: a bare signal prop passes the signal (live)`, () => {
        const items = signal<string[]>(['a'])
        const open = signal(false)
        const host = document.createElement('div')
        document.body.appendChild(host)
        const show = (vnode: unknown) => mounted.push(mount(vnode as never, host))
        const { App, out } = load(
          compile,
          wrap('() => show(<For each={items} by={(x) => x}>{(x) => <li>{x}</li>}</For>)'),
          items,
          open,
          show,
        )
        mountApp(App).querySelector<HTMLElement>('.target')!.click()
        expect(host.querySelectorAll('li').length, out).toBe(1)
        items.set(['a', 'b', 'c'])
        expect(host.querySelectorAll('li').length, out).toBe(3)
      })
    }

  })
}
