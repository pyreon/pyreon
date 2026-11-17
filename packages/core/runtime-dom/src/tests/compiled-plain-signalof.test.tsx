/**
 * Mounted proof: Plain Mode `signalOf(x)` passes the SIGNAL through JSX, so
 * the receiver can `.set()` it — on a component prop, a handler on a template
 * element, a component or a childless element, and a component's function
 * child. Before the fix the JSX pass auto-called the lowered bare reference
 * and the receiver got the number (`props.s.set is not a function`).
 *
 * Real Plain Mode source goes through each backend (JS pre-pass + JS JSX pass,
 * native pre-pass + native JSX pass), is lowered to `h()` and mounted.
 */
import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import * as template from '../template'

type Backend = (source: string) => string

const backends: [string, Backend][] = [['JavaScript', (source) => transformJSX_JS(source, 'plain.tsx').code]]

try {
  const native = createRequire(import.meta.url)('../../../compiler/native/pyreon-compiler.node') as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
    transformPlain?: (source: string, filename: string, known: null) => { code: string } | null
  }
  const plain = native.transformPlain
  if (plain) {
    backends.push([
      'Rust',
      (source) => native.transformJsx(plain(source, 'plain.tsx', null)!.code, 'plain.tsx', false, null).code,
    ])
  }
} catch {
  // The JavaScript backend runs without the optional addon; Rust runs when built.
}

const IDENT = /^[A-Za-z_$][\w$]*$/
const RUNTIME: Record<string, unknown> = {}

for (const ns of [reactivity, core, template, dom] as Record<string, unknown>[]) {
  for (const [k, v] of Object.entries(ns)) if (IDENT.test(k)) RUNTIME[k] = v
}

function load(compile: Backend, src: string, ext: Record<string, unknown>) {
  const out = compile(src)
  const body = transformSync(out.replace(/^import\s.*$/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const scope = { ...RUNTIME, ...ext }
  const App = new Function(...Object.keys(scope), `${body}\nreturn App`)(...Object.values(scope)) as () => unknown

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
  const unmount = dom.mount(core.h(App as never, null), container)
  mounted.push(() => {
    unmount()
    container.remove()
  })

  return container
}

const SRC = `'use plain'
import { state, signalOf } from '@pyreon/core/plain'

function Setter(props) {
  return <button class="setter" onClick={() => props.s.set(10)}>set</button>
}
function Btn(props) {
  return <button class={props.class} onClick={props.onClick}>b</button>
}
function Box(props) {
  return <p class="box">{props.children}</p>
}

function App() {
  let count = state(0)
  return (
    <div>
      <Setter s={signalOf(count)} />
      <button class="tpl" onClick={() => sink(signalOf(count), 20)}>t</button>
      <Btn class="cmp" onClick={() => sink(signalOf(count), 30)} />
      <i class="bare" onClick={() => sink(signalOf(count), 40)} />
      <Box>{() => grab(signalOf(count))}</Box>
      <output class="value">{count}</output>
    </div>
  )
}`

for (const [name, compile] of backends) {
  describe(`${name}: Plain Mode signalOf(x) passes the signal itself`, () => {
    it('the receiver can .set() it on every element path', () => {
      const grabbed: unknown[] = []
      const sink = (s: { set: (v: number) => void }, v: number) => s.set(v)
      const grab = (s: unknown) => {
        grabbed.push(s)
        return 'grabbed'
      }
      const { App, out } = load(compile, SRC, { sink, grab })
      const root = mountApp(App)
      const value = () => root.querySelector('.value')?.textContent
      expect(value(), out).toBe('0')
      for (const [sel, expected] of [
        ['.setter', '10'],
        ['.tpl', '20'],
        ['.cmp', '30'],
        ['.bare', '40'],
      ] as const) {
        root.querySelector<HTMLElement>(sel)!.click()
        expect(value(), `${sel}\n${out}`).toBe(expected)
      }
      expect(root.querySelector('.box')?.textContent, out).toBe('grabbed')
      expect(grabbed.length, out).toBeGreaterThan(0)
      expect(typeof grabbed[0], out).toBe('function')
      expect(typeof (grabbed[0] as { set?: unknown }).set, out).toBe('function')
    })
  })
}
