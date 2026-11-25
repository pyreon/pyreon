/**
 * Mounted proof: a DOM element's spread argument behaves the same on the
 * template path and the h() path, in both compiler backends.
 *
 * The h() path (a self-closing element, an element with a component child)
 * left the argument verbatim, so `{...{ onClick: () => count.set(count + 1) }}`
 * set the signal to its own source text plus "1" there while the template
 * element counted. Compiles REAL source through each backend, mounts it,
 * clicks and writes the signal.
 */
import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as runtime from '../index'
import * as template from '../template'

type Backend = (source: string) => string

const backends: [string, Backend][] = [['JavaScript', (source) => transformJSX_JS(source, 'spread.tsx').code]]

try {
  const native = createRequire(import.meta.url)('../../../compiler/native/pyreon-compiler.node') as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source) => native.transformJsx(source, 'spread.tsx', false, null).code])
} catch {
  // The JavaScript backend runs without the optional addon; Rust runs when built.
}

const RUNTIME: Record<string, unknown> = { ...core, ...reactivity, ...template, ...runtime }
const NAMES = Object.keys(RUNTIME).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n))

function load(compile: Backend, jsx: string, count: reactivity.Signal<number>, calls: string[] = []) {
  const src =
    `import { computed, signal } from '@pyreon/reactivity'\nconst count = signal(0)\n` +
    `const pick = computed(() => (count() > 0 ? () => calls.push('save') : () => calls.push('edit')))\n` +
    `function Comp() { return <b>c</b> }\n` +
    `function App() { return ${jsx} }`
  const out = compile(src)
  const body = transformSync(out.replace(/^\s*import\s.*$/gm, '').replace('const count = signal(0)', ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const fn = new Function(...NAMES, 'count', 'calls', `${body}\nreturn App`)

  return { App: fn(...NAMES.map((n) => RUNTIME[n]), count, calls) as () => unknown, out }
}

const mounted: (() => void)[] = []

afterEach(() => {
  for (const u of mounted.splice(0)) u()
  document.body.innerHTML = ''
})

const SPREAD = '{...{ onClick: () => count.set(count + 1), title: count, "data-n": count + 1 }}'

const PATHS: Record<string, string> = {
  template: `<div class="t" ${SPREAD}>t</div>`,
  'h(): self-closing': `<div class="t" ${SPREAD} />`,
  'h(): with a component child': `<div class="t" ${SPREAD}><Comp /></div>`,
}

for (const [name, compile] of backends) {
  describe(`${name}: a DOM spread behaves the same on every element path`, () => {
    for (const [path, jsx] of Object.entries(PATHS)) {
      it(path, () => {
        const count = reactivity.signal(0)
        const { App, out } = load(compile, jsx, count)
        const container = document.createElement('div')
        document.body.appendChild(container)
        mounted.push(runtime.mount(core.h(App as never, null), container))
        const el = container.querySelector<HTMLElement>('.t')!
        expect(el.getAttribute('data-n'), out).toBe('1')
        el.click()
        el.click()
        // The handler wrote a number, not the signal's source text.
        expect(typeof count(), out).toBe('number')
        expect(count()).toBe(2)
        // A bare signal property is a live accessor on every path.
        expect(el.getAttribute('title'), out).toBe('2')
      })
    }

    // A computed that RETURNS the handler, as an `on*` spread value: it is
    // read, so its result is the listener (kept bare, the computed itself was
    // the listener and a click ran nothing).
    for (const [path, build] of [
      ['template', (sp: string) => `<div class="t" ${sp}>t</div>`],
      ['h(): self-closing', (sp: string) => `<div class="t" ${sp} />`],
    ] as const) {
      it(`a computed handler in a spread is read, not used as the listener: ${path}`, () => {
        const count = reactivity.signal(0)
        const calls: string[] = []
        const { App, out } = load(compile, build('{...{ onClick: pick }}'), count, calls)
        const container = document.createElement('div')
        document.body.appendChild(container)
        mounted.push(runtime.mount(core.h(App as never, null), container))
        container.querySelector<HTMLElement>('.t')!.click()
        expect(calls, out).toEqual(['edit'])
      })
    }
  })
}
