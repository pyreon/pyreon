/**
 * A component referenced through a MEMBER tag (`<m.X a={props.b}/>`) gets the
 * same reactive props as an identifier-bound one (#4368).
 *
 * Before the fix both compiler backends treated a member tag as a DOM element:
 * the prop compiled to an UNBRANDED `() => props.b`, so the component received
 * a function where it expected the value (pyreon.dev/benchmarks:
 * `props.scaling.sizes` was `undefined` and the effect threw), and a spread
 * `{...rest}` read every getter once. These specs compile REAL source through
 * each backend (vitest's own JSX transform never runs the Pyreon compiler),
 * mount it, flip the prop and read the DOM.
 */
import * as compiler from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { h, _rp } from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, test } from 'vitest'
import * as runtimeDom from '../index'
import { mountChild } from '../index'

const MODULES: Record<string, Record<string, unknown>> = {
  '@pyreon/core': core as unknown as Record<string, unknown>,
  '@pyreon/reactivity': reactivity as unknown as Record<string, unknown>,
  '@pyreon/runtime-dom': runtimeDom as unknown as Record<string, unknown>,
}

/** Bind every name the emit imports from a `@pyreon/*` module. */
function linkImports(code: string): { names: string[]; values: unknown[]; body: string } {
  const names: string[] = []
  const values: unknown[] = []
  const body = code.replace(
    /^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?\s*$/gm,
    (_m, list: string, src: string) => {
      const mod = MODULES[src]
      if (!mod) throw new Error(`unexpected import from ${src}`)
      for (const raw of list.split(',')) {
        const name = raw.trim()
        if (!name) continue
        if (!(name in mod)) throw new Error(`${src} has no export ${name}`)
        names.push(name)
        values.push(mod[name])
      }

      return ''
    },
  )

  return { names, values, body }
}

const BACKENDS = [
  ['js', (src: string) => compiler.transformJSX_JS(src, 'm.tsx').code],
  ['shipped', (src: string) => compiler.transformJSX(src, 'm.tsx').code],
] as const

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  document.body.innerHTML = ''
})

function mountApp(
  compile: (src: string) => string,
  source: string,
  scope: Record<string, unknown>,
  props: Record<string, unknown>,
): HTMLDivElement {
  const { names, values, body } = linkImports(compile(source))
  const js = transformSync(body.replace(/^(\s*)export\s+/gm, '$1'), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const scopeNames = Object.keys(scope)
  const make = new Function('h', 'Fragment', ...names, ...scopeNames, `${js}\nreturn App`)
  const App = make(h, core.Fragment, ...values, ...Object.values(scope)) as (p: unknown) => unknown
  const container = document.createElement('div')
  document.body.appendChild(container)
  cleanups.push(mountChild(h(App as never, props), container) ?? (() => {}))

  return container
}

/** A leaf component reporting what it received for `a`. */
function Leaf(props: { a: unknown }) {
  return h('i', null, () => (typeof props.a === 'function' ? 'FUNCTION' : String(props.a)))
}

/** A component that spreads its rest props into a leaf. */
function Pass(props: Record<string, unknown>) {
  return h('b', null, () => `${String(props.a)}|${String(props.c)}`)
}

for (const [name, compile] of BACKENDS) {
  describe(`member-tag component props stay live (${name} backend)`, () => {
    test('<m.X a={props.b}/> receives the value and follows the prop', () => {
      const b = signal(1)
      const m = { X: Leaf }
      const UI = { Deep: { Leaf } }
      const el = mountApp(
        compile,
        `export function App(props) {
          const Alias = m.X
          return <div><m.X a={props.b} /><UI.Deep.Leaf a={props.b + 1} /><Alias a={props.b} /></div>
        }`,
        { m, UI },
        { b: _rp(() => b()) },
      )
      expect(el.textContent).toBe('121')
      b.set(5)
      expect(el.textContent).toBe('565')
    })

    test('a spread onto a member tag keeps the props getters', () => {
      const a = signal('x')
      const ns = { Pass }
      const el = mountApp(
        compile,
        `import { splitProps } from '@pyreon/core'
        export function App(props) {
          const [, rest] = splitProps(props, ['z'])
          return <ns.Pass {...rest} />
        }`,
        { ns },
        { a: _rp(() => a()), c: 'k', z: 0 },
      )
      expect(el.textContent).toBe('x|k')
      a.set('y')
      expect(el.textContent).toBe('y|k')
    })

    test('an underscore-named component (<_Leaf>) is a component, not a <_leaf> element', () => {
      const b = signal(2)
      const el = mountApp(
        compile,
        `export function App(props) { return <section><_Leaf a={props.b} /></section> }`,
        { _Leaf: Leaf },
        { b: _rp(() => b()) },
      )
      expect(el.querySelector('i')?.textContent).toBe('2')
      b.set(3)
      expect(el.querySelector('i')?.textContent).toBe('3')
    })
  })
}
