/**
 * Mounted proof: a bare signal inside a function nested in JSX is READ on
 * every element path, so a counter handler writes a NUMBER.
 *
 * Before the fix `onClick={() => count.set(count + 1)}` was auto-called only
 * on a template element (`<button>x</button>`). On a component, a childless
 * element, or a spread-carrying element the emit kept `count + 1`, and a click
 * set the signal to the function's source text plus "1". Both compiler
 * backends agreed, so this compiles REAL source through each backend and
 * clicks the result instead of comparing emits.
 */
import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import { Fragment, h, _rp, _rpd } from '@pyreon/core'
import { type Signal, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { _applyProps, _bindSpread, mount } from '../index'
import { _bindText, _mountSlot, _setChild, _tpl } from '../template'

type Backend = (source: string, ssr: boolean) => string

const backends: [string, Backend][] = [
  ['JavaScript', (source, ssr) => transformJSX_JS(source, 'nested.tsx', { ssr }).code],
]

try {
  const native = createRequire(import.meta.url)('../../../compiler/native/pyreon-compiler.node') as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source, ssr) => native.transformJsx(source, 'nested.tsx', ssr, null).code])
} catch {
  // The JavaScript backend runs without the optional addon; Rust runs when built.
}

const RUNTIME = { h, Fragment, _rp, _rpd, _tpl, _bindText, _mountSlot, _setChild, _applyProps, _bindSpread }

/** Compile `App` (closing over the test's `count`), lower JSX to `h`, return the component. */
function load(compile: Backend, src: string, count: Signal<number>, ssr = false) {
  const out = compile(src, ssr)
  const body = transformSync(out.replace(/^import\s.*$/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const names = Object.keys(RUNTIME)
  const App = new Function('count', ...names, `${body}\nreturn App`)(
    count,
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
  // `mount` (not `mountChild`): it installs the delegated-event root the
  // template path's `__ev_click` handlers need.
  const unmount = mount(h(App as never, null), container)
  mounted.push(() => {
    unmount()
    container.remove()
  })

  return container
}

/** Each source declares `count` as a known signal for the compiler; the
 *  runtime binding is the test's own signal (the declaration is stripped). */
const withSignal = (jsx: string) =>
  `const count = signal(0)\nfunction Button(props) { return <button class="target" onClick={props.onClick}>b</button> }\nfunction App() { const rest = { id: 'r' }; return ${jsx} }`

const stripDecl = (b: Backend): Backend => (source, ssr) =>
  b(source, ssr).replace('const count = signal(0)', '')

const CLICK_PATHS: Record<string, string> = {
  'component prop': '<Button onClick={() => count.set(count + 1)} />',
  'childless element': '<div class="target" onClick={() => count.set(count + 1)} />',
  'spread-carrying element': '<button class="target" {...rest} onClick={() => count.set(count + 1)}>x</button>',
  'template element (already called before the fix)':
    '<button class="target" onClick={() => count.set(count + 1)}>x</button>',
}

for (const [name, compile] of backends) {
  describe(`${name}: a handler nested in JSX writes the signal's value`, () => {
    for (const [path, jsx] of Object.entries(CLICK_PATHS)) {
      it(path, () => {
        const count = signal(0)
        const { App, out } = load(stripDecl(compile), withSignal(jsx), count)
        const target = mountApp(App).querySelector<HTMLElement>('.target')
        expect(target, out).not.toBeNull()
        target!.click()
        target!.click()
        expect(typeof count(), out).toBe('number')
        expect(count()).toBe(2)
      })
    }

    it('a function child of a component renders the value, not the source text', () => {
      const count = signal(41)
      const { App, out } = load(
        stripDecl(compile),
        `const count = signal(0)\nfunction Box(props) { return <p class="target">{props.children}</p> }\nfunction App() { return <Box>{() => count + 1}</Box> }`,
        count,
      )
      const container = mountApp(App)
      expect(container.querySelector('.target')?.textContent, out).toBe('42')
      count.set(1)
      expect(container.querySelector('.target')?.textContent).toBe('2')
    })

    it('SSR renders the same function child as the value', async () => {
      const count = signal(41)
      const { App, out } = load(
        stripDecl(compile),
        `const count = signal(0)\nfunction App() { return <div>{() => count + 1}</div> }`,
        count,
        true,
      )
      const html = await renderToString(h(App as never, null))
      expect(html, out).toContain('42')
      expect(html).not.toContain('=>')
    })
  })
}
