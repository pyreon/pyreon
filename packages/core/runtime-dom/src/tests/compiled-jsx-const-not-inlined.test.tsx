/**
 * A prop-derived `const` holding JSX is never inlined (#4300), on any path.
 *
 * `const imgEl = <img alt={props.alt} />` used as `{imgEl}` was inlined as
 * `_mountSlot((<img alt={props.alt} />), …)`: the copy is the ORIGINAL source,
 * so its JSX is never lowered by the compiler and becomes a plain `h()` that
 * reads `props.alt` ONCE, while the const's own JSX compiles to the live
 * `alt={() => props.alt}`. Inside an accessor (a component prop) the copy is
 * re-created on every read, so a component in it loses its state whenever the
 * prop changes. Keeping the const fixes both: one element, live bindings.
 *
 * Real source goes through each backend, is lowered to `h()` and mounted.
 */
import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import * as template from '../template'

type Backend = (source: string) => string

const backends: [string, Backend][] = [
  ['JavaScript', (source) => transformJSX_JS(source, 'jsxconst.tsx').code],
]

try {
  const native = createRequire(import.meta.url)(
    '../../../compiler/native/pyreon-compiler.node',
  ) as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source) => native.transformJsx(source, 'jsxconst.tsx', false, null).code])
} catch {
  // The JavaScript backend runs without the optional addon; Rust runs when built.
}

const IDENT = /^[A-Za-z_$][\w$]*$/
const RUNTIME: Record<string, unknown> = {}

for (const ns of [reactivity, core, template, dom] as Record<string, unknown>[]) {
  for (const [k, v] of Object.entries(ns)) if (IDENT.test(k)) RUNTIME[k] = v
}

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
  ) as (p: unknown) => unknown

  return { App, out }
}

const mounted: (() => void)[] = []

afterEach(() => {
  for (const c of mounted.splice(0)) c()
  document.body.innerHTML = ''
})

function mountApp(App: (p: unknown) => unknown, props: Record<string, unknown>): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = dom.mount(core.h(App as never, props), container)
  mounted.push(() => {
    unmount()
    container.remove()
  })

  return container
}

/** Renders whatever element it is handed. */
function Frame(props: { image: unknown }) {
  return core.h('figure', null, () => props.image)
}

/** Holds its own state; reports how many times it was set up. */
let setups = 0

function Counter(props: { label: string }) {
  setups++
  const n = signal(0)

  return core.h('button', { onClick: () => n.update((v) => v + 1) }, () => `${props.label}:${n()}`)
}

for (const [name, compile] of backends) {
  describe(`a JSX-valued prop-derived const keeps its one live element (${name})`, () => {
    it('the issue shape: an element const nested in another const and passed as a component prop', () => {
      const { App, out } = load(
        compile,
        `function App(props) {
          const img = { src: 'a.png', hasFormats: true }
          const imgEl = <img src={img.src} alt={props.alt} />
          const imageEl = img.hasFormats ? <picture>{imgEl}</picture> : imgEl
          return <div><Frame image={imageEl} /></div>
        }`,
        { Frame },
      )
      expect(out).toContain('_mountSlot(imgEl')
      expect(out).toContain('image={imageEl}')
      const alt = signal('first')
      const root = mountApp(App, { alt: core._rp(() => alt()) })
      const img = root.querySelector('img')!
      expect(img.getAttribute('alt')).toBe('first')
      alt.set('second')
      // the SAME element, updated in place
      expect(root.querySelector('img')).toBe(img)
      expect(img.getAttribute('alt')).toBe('second')
    })

    it('an element const used as a child follows the prop (was frozen by the inlined copy)', () => {
      const { App } = load(
        compile,
        `function App(props) {
          const cls = props.c + '-b'
          const el = <i class={cls}>e</i>
          return <div>{el}<span class={cls}>s</span></div>
        }`,
      )
      const c = signal('x')
      const root = mountApp(App, { c: core._rp(() => c()) })
      expect(root.querySelector('i')!.className).toBe('x-b')
      c.set('y')
      expect(root.querySelector('i')!.className).toBe('y-b')
      expect(root.querySelector('span')!.className).toBe('y-b')
    })

    it('a component inside the const keeps its state when the prop changes', () => {
      setups = 0
      const { App } = load(
        compile,
        `function App(props) {
          const counter = <Counter label={props.label} />
          return <div><Frame image={counter} /></div>
        }`,
        { Frame, Counter },
      )
      const label = signal('a')
      const root = mountApp(App, { label: core._rp(() => label()) })
      root.querySelector('button')!.click()
      expect(root.querySelector('button')!.textContent).toBe('a:1')
      label.set('b')
      expect(root.querySelector('button')!.textContent).toBe('b:1')
      expect(setups).toBe(1)
    })

    it('a function const holding JSX keeps its own live bindings', () => {
      const { App, out } = load(
        compile,
        `function App(props) {
          const row = () => <b>{props.x}</b>
          return <div>{row()}</div>
        }`,
      )
      expect(out).toContain('row()')
      const x = signal('1')
      const root = mountApp(App, { x: core._rp(() => x()) })
      expect(root.querySelector('b')!.textContent).toBe('1')
      x.set('2')
      expect(root.querySelector('b')!.textContent).toBe('2')
    })
  })
}
