/**
 * Mounted proof for the prop-derived const inliner (both compiler backends):
 *
 * 1. A const whose initializer mints state ANYWHERE — not only at its root —
 *    is never inlined. `const count = props.shared ?? signal(0)` (the
 *    documented standalone `<Example>` counter) used to be inlined at every
 *    use site, so with no `shared` prop each read created a fresh signal: the
 *    click updated one, the text read another, and the counter never moved.
 * 2. A PURE prop-derived const is still inlined (the reactivity feature), now
 *    on every element path: a handler on a component or a childless element
 *    and a component's function child read the live prop, as a template
 *    element always did, instead of the value captured at setup.
 *
 * Real source goes through each backend, is lowered to `h()` and mounted.
 */
import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { type Signal, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import * as template from '../template'

type Backend = (source: string) => string

const backends: [string, Backend][] = [
  ['JavaScript', (source) => transformJSX_JS(source, 'stateful.tsx').code],
]

try {
  const native = createRequire(import.meta.url)('../../../compiler/native/pyreon-compiler.node') as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source) => native.transformJsx(source, 'stateful.tsx', false, null).code])
} catch {
  // The JavaScript backend runs without the optional addon; Rust runs when built.
}

const IDENT = /^[A-Za-z_$][\w$]*$/
const RUNTIME: Record<string, unknown> = {}

for (const ns of [reactivity, core, template, dom] as Record<string, unknown>[]) {
  for (const [k, v] of Object.entries(ns)) if (IDENT.test(k)) RUNTIME[k] = v
}

/** Compile `src` (its `App` closes over `ext`), lower JSX to `h`, return `App`. */
function load(compile: Backend, src: string, ext: Record<string, unknown> = {}) {
  const out = compile(src)
  const body = transformSync(out.replace(/^import\s.*$/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const scope = { ...RUNTIME, ...ext }
  const App = new Function(...Object.keys(scope), `${body}\nreturn App`)(
    ...Object.values(scope),
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
  // `mount` installs the delegated-event root template handlers need.
  const unmount = dom.mount(core.h(App as never, null), container)
  mounted.push(() => {
    unmount()
    container.remove()
  })

  return container
}

const click = (root: HTMLElement, sel: string) => root.querySelector<HTMLElement>(sel)!.click()
const text = (root: HTMLElement, sel: string) => root.querySelector(sel)?.textContent

/** The two counters from `docs/src/content/docs/{live-examples,zero-content}.md`. */
const COUNTERS: Record<string, string> = {
  'live-examples.md Counter': `
function Counter(props) {
  const count = props.shared ?? signal(0)
  return (
    <div>
      <button onClick={() => count.update((n) => n + 1)}>+</button>
      <span>{count()}</span>
    </div>
  )
}`,
  'zero-content.md CounterButton': `
function Counter(props) {
  const count = props.shared ?? signal(0)
  return (
    <button onClick={() => count.update((n) => n + 1)}>
      bump (now {() => count()})
    </button>
  )
}`,
  // The same const used on the h() paths too: a component handler, a
  // childless element's handler, a component prop.
  'every element path': `
function Btn(props) { return <button class="btn" onClick={props.onClick}>b</button> }
function Shown(props) { return <i class="shown">{() => props.v()}</i> }
function Counter(props) {
  const count = props.shared ?? signal(0)
  return (
    <div>
      <Btn onClick={() => count.update((n) => n + 1)} />
      <em class="bare" onClick={() => count.update((n) => n + 1)} />
      <Shown v={count} />
      <span>{count()}</span>
    </div>
  )
}`,
}

for (const [name, compile] of backends) {
  describe(`${name}: a prop-derived const that mints state is created once`, () => {
    for (const [label, counter] of Object.entries(COUNTERS)) {
      it(`${label} — standalone (no shared prop) counts`, () => {
        const { App, out } = load(compile, `${counter}\nfunction App() { return <Counter /> }`)
        const root = mountApp(App)
        const button = label === 'every element path' ? '.btn' : 'button'
        click(root, button)
        click(root, button)
        if (label === 'every element path') {
          click(root, '.bare')
          expect(text(root, '.shown'), out).toBe('3')
          expect(text(root, 'span'), out).toBe('3')
        } else {
          expect(root.textContent, out).toContain('2')
        }
      })

      it(`${label} — with a shared signal it drives the shared one`, () => {
        const shared = signal(10)
        const { App, out } = load(
          compile,
          `${counter}\nfunction App() { return <Counter shared={ext} /> }`,
          { ext: shared },
        )
        const root = mountApp(App)
        click(root, label === 'every element path' ? '.btn' : 'button')
        expect(shared(), out).toBe(11)
        shared.set(20)
        expect(root.textContent, out).toContain('20')
      })
    }

    it('the inlined form is never emitted for a stateful initializer', () => {
      const out = compile(`${COUNTERS['live-examples.md Counter']}`)
      expect(out).not.toContain('(props.shared ?? signal(0))')
    })
  })

  describe(`${name}: a PURE prop-derived const stays inlined and live on every path`, () => {
    const SRC = `
function Btn(props) { return <button class="btn" onClick={props.onClick}>b</button> }
function Box(props) { return <p class="box">{props.children}</p> }
function Child(props) {
  const label = props.label
  return (
    <div>
      <span class="child" title={label}>{label}</span>
      <Btn onClick={() => seen.push(label)} />
      <em class="bare" onClick={() => seen.push(label)} />
      <button class="tpl" onClick={() => seen.push(label)}>t</button>
      <Box>{() => label + '!'}</Box>
    </div>
  )
}
function App() { return <Child label={src()} /> }`

    it('child, attribute, handlers on every path and a function child follow the prop', () => {
      const src = signal('a') as Signal<string>
      const seen: string[] = []
      const { App, out } = load(compile, SRC, { src, seen })
      const root = mountApp(App)
      expect(text(root, '.child'), out).toBe('a')
      expect(text(root, '.box'), out).toBe('a!')
      src.set('b')
      expect(text(root, '.child'), out).toBe('b')
      expect(root.querySelector('.child')?.getAttribute('title'), out).toBe('b')
      expect(text(root, '.box'), out).toBe('b!')
      click(root, '.btn')
      click(root, '.bare')
      click(root, '.tpl')
      expect(seen, out).toEqual(['b', 'b', 'b'])
    })

    it('an inlined initializer is not captured by a binding at the use site', () => {
      const seen: string[] = []
      const { App, out } = load(
        compile,
        `
function Each(props) { return <i class="each">{() => props.items.map((t) => props.render(t)).join()}</i> }
function Child(props) {
  const tag = '-outer'
  const lbl = props.label + tag
  return (
    <div>
      <Each items={['-inner']} render={(tag) => lbl + tag} />
      <button class="tpl" onClick={(tag) => seen.push(lbl)}>t</button>
    </div>
  )
}
function App() { return <Child label={src()} /> }`,
        { src: signal('a'), seen },
      )
      const root = mountApp(App)
      expect(text(root, '.each'), out).toBe('a-outer-inner')
      click(root, '.tpl')
      expect(seen, out).toEqual(['a-outer'])
    })
  })
}
