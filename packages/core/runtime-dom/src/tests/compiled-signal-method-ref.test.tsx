/**
 * A signal method passed by reference in JSX works once compiled (#4356).
 *
 * `ref={el.set}` is the natural way to capture an element into a signal, and
 * `onInput={value.set}` / `onClick={count.update}` / a `cb={sig.set}` prop are
 * the same shape. Signal methods read `this`, so the detached reference threw
 * when the runtime called it. The compiler now binds every reference it can
 * prove belongs to a signal (`el.set.bind(el)`). These specs compile real
 * source through each backend, mount it and drive it: template path, h() path
 * (spread-carrying element), component props, nested functions, optional
 * chains and type layers.
 */
import * as compiler from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { h } from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, test } from 'vitest'
import * as runtimeDom from '../index'
import { mountChild } from '../index'
import { setupDelegation } from '../delegate'

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
    /^\s*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?\s*$/gm,
    (_m, list: string, src: string) => {
      const mod = MODULES[src]
      if (!mod) throw new Error(`unexpected import from ${src}`)
      for (const raw of list.split(',')) {
        const name = raw.trim()
        if (!name || names.includes(name)) continue
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

/** Compile `body` (statements ending in `return <jsx>`), mount it, return its exposed signals. */
function mountApp(
  compile: (src: string) => string,
  body: string,
  scope: Record<string, unknown> = {},
): { root: HTMLDivElement; exposed: Record<string, () => unknown> } {
  const source = `import { signal, computed } from '@pyreon/reactivity'
export function App(props) {
${body}
}`
  const linked = linkImports(compile(source))
  const js = transformSync(linked.body.replace(/^(\s*)export\s+/gm, '$1'), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const exposed: Record<string, () => unknown> = {}
  const scopeNames = Object.keys(scope)
  const make = new Function(
    'h',
    'Fragment',
    'expose',
    ...linked.names,
    ...scopeNames,
    `${js}\nreturn App`,
  )
  const App = make(h, core.Fragment, exposed, ...linked.values, ...Object.values(scope)) as (
    p: unknown,
  ) => unknown
  const root = document.createElement('div')
  document.body.appendChild(root)
  // `mount()` installs this; the bare `mountChild` used here does not.
  setupDelegation(root)
  cleanups.push(mountChild(h(App as never, {}), root) ?? (() => {}))

  return { root, exposed }
}

/** A component that hands values to its callback props during setup. */
function Picker(props: {
  onPick: (v: unknown) => void
  onBump?: (f: (n: number) => number) => void
}) {
  props.onPick('picked')
  props.onBump?.((n) => n + 10)

  return h('span', null, 'picker')
}

for (const [name, compile] of BACKENDS) {
  describe(`signal method references are bound (${name} backend)`, () => {
    test('ref={el.set} captures the element on the template path', () => {
      const { root, exposed } = mountApp(
        compile,
        `const el = signal(null); expose.el = el
  return <section><div id="t" ref={el.set}>x</div></section>`,
      )
      expect(exposed.el!()).toBe(root.querySelector('#t'))
      expect(exposed.el!()).toBeInstanceOf(HTMLElement)
    })

    test('ref={el.set} captures the element on the h() path (spread-carrying element)', () => {
      const { root, exposed } = mountApp(
        compile,
        `const el = signal(null); expose.el = el; const extra = { title: 't' }
  return <div {...extra} id="h" ref={el.set}>x</div>`,
      )
      expect(exposed.el!()).toBe(root.querySelector('#h'))
      expect(exposed.el!()).toBeInstanceOf(HTMLElement)
    })

    test('optional chain, type layer and a parenthesised receiver bind too', () => {
      const { root, exposed } = mountApp(
        compile,
        `const a = signal(null); const b = signal(null); const c = signal(null)
  expose.a = a; expose.b = b; expose.c = c
  return <p><i id="a" ref={a?.set} /><i id="b" ref={(b.set as any)} /><i id="c" ref={(c).set} /></p>`,
      )
      expect(exposed.a!()).toBe(root.querySelector('#a'))
      expect(exposed.a!()).toBeInstanceOf(HTMLElement)
      expect(exposed.b!()).toBe(root.querySelector('#b'))
      expect(exposed.b!()).toBeInstanceOf(HTMLElement)
      expect(exposed.c!()).toBe(root.querySelector('#c'))
      expect(exposed.c!()).toBeInstanceOf(HTMLElement)
    })

    test('onClick={count.update} / onClick={count.trigger} run with their signal', () => {
      const { root, exposed } = mountApp(
        compile,
        `const count = signal(1); expose.count = count
  const fired = signal(0); expose.fired = fired
  return <div><button id="u" onClick={() => count.update((n) => n * 2)}>u</button><button id="t" onClick={count.trigger}>t</button>{() => { fired.set(fired.peek() + 1); return count() }}</div>`,
      )
      const before = exposed.fired!() as number
      root.querySelector<HTMLButtonElement>('#t')!.click()
      expect(exposed.fired!()).toBe(before + 1)
      root.querySelector<HTMLButtonElement>('#u')!.click()
      expect(exposed.count!()).toBe(2)
    })

    test('a callback prop on a component receives a bound method', () => {
      const { exposed } = mountApp(
        compile,
        `const choice = signal(''); const n = signal(1); expose.choice = choice; expose.n = n
  return <Picker onPick={choice.set} onBump={n.update} />`,
        { Picker },
      )
      expect(exposed.choice!()).toBe('picked')
      expect(exposed.n!()).toBe(11)
    })

    test('inside a nested function and a map callback', () => {
      const { root, exposed } = mountApp(
        compile,
        `const last = signal(0); const items = signal([1, 2, 3]); expose.last = last
  return <ul onClick={() => [7, 8].forEach(last.set)}>{items().map((i) => <li ref={last.set}>{i}</li>)}</ul>`,
      )
      // each <li> ref wrote the element, the last one wins
      expect(root.querySelectorAll('li')).toHaveLength(3)
      expect(exposed.last!()).toBe(root.querySelectorAll('li')[2])
      root.querySelector<HTMLUListElement>('ul')!.click()
      expect(exposed.last!()).toBe(8)
    })
  })
}
