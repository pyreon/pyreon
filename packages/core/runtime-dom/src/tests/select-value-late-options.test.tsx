/**
 * #4820: a `<select value>` whose matching option arrives AFTER mount selects
 * it when it arrives.
 *
 * `select.value = 'b'` selects an option only if one with that value EXISTS at
 * that moment; on an empty select it is a no-op, and appending options later
 * selects the first. The value was applied once, after the children's first
 * mount (PZ-09), and its binding tracked only the value — so the select showed
 * the first option while the signal held a valid value.
 *
 * Fix: a select whose value matches no option yet watches its own children
 * (`select-wait.ts`, turned on by the `_selectWait()` call the compiler emits
 * for modules with `<select value>`), applies the value once its option exists
 * and stops. After that the selection is the user's: a pick, a declining
 * `onChange`, a removed option and an unmatched value
 * behave exactly as before (the maintainer decision: never fight the user).
 * A `multiple` select is left alone. Locked on the compiled path (both
 * compiler backends), the h() path and hydration; the real-Chromium cells are
 * in select-value-late-options.browser.test.tsx.
 */
import { createRequire } from 'node:module'
import * as core from '@pyreon/core'
import { transformJSX_JS } from '@pyreon/compiler'
import * as reactivity from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import * as dom from '../index'
import * as template from '../template'

const { For, h, Show } = core
const { signal } = reactivity

type Backend = (source: string) => string

const backends: [string, Backend][] = [
  ['JavaScript', (source) => transformJSX_JS(source, 'app.tsx', {}).code],
]

try {
  const native = createRequire(import.meta.url)('../../../compiler/native/pyreon-compiler.node') as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source) => native.transformJsx(source, 'app.tsx', false, null).code])
} catch {
  // The JavaScript backend runs without the optional addon; Rust runs when built.
}

const MODULES: Record<string, Record<string, unknown>> = {
  '@pyreon/core': core,
  '@pyreon/reactivity': reactivity,
  '@pyreon/runtime-dom': { ...dom, ...template },
}

/** Compile a module body that `return`s a component; `scope` binds its free names. */
function load(compile: Backend, source: string, scope: Record<string, unknown>) {
  const out = compile(source)
  const names: Record<string, unknown> = { h, Fragment: core.Fragment, ...scope }
  const body = out.replace(
    /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?$/gm,
    (_m, list: string, from: string) => {
      const mod = MODULES[from]
      if (!mod) throw new Error(`unexpected import from ${from}\n${out}`)
      for (const spec of list.split(',')) {
        const [name, alias] = spec.trim().split(/\s+as\s+/)
        if (!name) continue
        if (!(name in mod)) throw new Error(`${from} has no export ${name}`)
        names[(alias ?? name).trim()] = mod[name]
      }

      return ''
    },
  )
  const js = transformSync(body, { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code
  const App = new Function(...Object.keys(names), js)(...Object.values(names)) as () => unknown

  return { App, out }
}

const mounted: (() => void)[] = []

afterEach(() => {
  for (const c of mounted.splice(0)) c()
  document.body.innerHTML = ''
})

function mountApp(vnode: core.VNodeChild): HTMLSelectElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = dom.mount(vnode, container)
  mounted.push(unmount)

  return container.querySelector('select')!
}

const tick = () => new Promise((r) => setTimeout(r, 0))

function compiledSuite(backend: string, compile: Backend): void {
  describe(`${backend}: compiled <select value> re-applies when options change`, () => {
    it('the issue repro: <For> options that load after mount', async () => {
      const value = signal('b')
      const options = signal<string[]>([])
      const { App, out } = load(
        compile,
        `import { For } from '@pyreon/core'
function Picker() {
  return (
    <select value={value()} onChange={(e) => value.set(e.target.value)}>
      <For each={options()} by={(o) => o}>{(o) => <option value={o}>{o}</option>}</For>
    </select>
  )
}
return Picker`,
        { value, options },
      )
      const select = mountApp(h(App as core.ComponentFn, null))
      options.set(['a', 'b', 'c'])
      await tick()
      expect(select.options.length, out).toBe(3)
      expect([value(), select.value], out).toEqual(['b', 'b'])
    })

    it('an unkeyed .map inside a template select', async () => {
      const value = signal('c')
      const options = signal<string[]>([])
      const { App, out } = load(
        compile,
        `function Picker() {
  return <div><select value={value()}>{options().map((o) => <option value={o}>{o}</option>)}</select></div>
}
return Picker`,
        { value, options },
      )
      const select = mountApp(h(App as core.ComponentFn, null))
      options.set(['a', 'b', 'c'])
      await tick()
      expect(select.value, out).toBe('c')
    })

    it('a static value="b" waits for its option too', async () => {
      const options = signal<string[]>([])
      const { App, out } = load(
        compile,
        `function Picker() {
  return <div><select value="b">{options().map((o) => <option value={o}>{o}</option>)}</select></div>
}
return Picker`,
        { options },
      )
      const select = mountApp(h(App as core.ComponentFn, null))
      options.set(['a', 'b'])
      await tick()
      expect(select.value, out).toBe('b')
    })

    it('a spread carrying value (`<select {...p}>`), set before the options arrive', async () => {
      const value = signal('b')
      const options = signal<string[]>([])
      const p = { name: 'pick' } as Record<string, unknown>
      Object.defineProperty(p, 'value', { get: () => value(), enumerable: true, configurable: true })
      const { App, out } = load(
        compile,
        `function Picker() {
  return <div><select {...p}>{options().map((o) => <option value={o}>{o}</option>)}</select></div>
}
return Picker`,
        { options, p },
      )
      expect(out).toContain('_selectWait()')
      const select = mountApp(h(App as core.ComponentFn, null))
      options.set(['a', 'b', 'c'])
      await tick()
      expect(select.value, out).toBe('b')
    })

    it('a spread with <For> children (h() path)', async () => {
      const options = signal<string[]>([])
      const p = { value: 'c' }
      const { App, out } = load(
        compile,
        `import { For } from '@pyreon/core'
function Picker() {
  return <select {...p}><For each={options()} by={(o) => o}>{(o) => <option value={o}>{o}</option>}</For></select>
}
return Picker`,
        { options, p },
      )
      expect(out).toContain('_selectWait()')
      const select = mountApp(h(App as core.ComponentFn, null))
      options.set(['a', 'b', 'c'])
      await tick()
      expect(select.value, out).toBe('c')
    })

    it('options in an <optgroup>', async () => {
      const value = signal('y')
      const options = signal<string[]>([])
      const { App, out } = load(
        compile,
        `import { For } from '@pyreon/core'
function Picker() {
  return (
    <select value={value()}>
      <option value="none">none</option>
      <optgroup label="g">
        <For each={options()} by={(o) => o}>{(o) => <option value={o}>{o}</option>}</For>
      </optgroup>
    </select>
  )
}
return Picker`,
        { value, options },
      )
      const select = mountApp(h(App as core.ComponentFn, null))
      expect(select.value, out).toBe('none')
      options.set(['x', 'y'])
      await tick()
      expect(select.value, out).toBe('y')
    })
  })
}

for (const [backend, compile] of backends) compiledSuite(backend, compile)

describe('h() path', () => {
  // Without the compiler, an app turns the handling on itself (the compiler
  // emits this call for every module that renders `<select value>`).
  beforeAll(() => dom._selectWait())

  it('<For> options added after mount', async () => {
    const value = signal('b')
    const options = signal<string[]>([])
    const select = mountApp(
      h(
        'select',
        { value: () => value() },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    expect(select.options.length).toBe(0)
    options.set(['a', 'b', 'c'])
    await tick()
    expect(select.value).toBe('b')
    // A value change still applies, and a later options change keeps it.
    value.set('c')
    expect(select.value).toBe('c')
    options.set(['c', 'd'])
    await tick()
    expect(select.value).toBe('c')
  })

  it('options swapped in by <Show>', async () => {
    const loaded = signal(false)
    const select = mountApp(
      h(
        'select',
        { value: 'b' },
        h(Show, {
          when: () => loaded(),
          children: [h('option', { value: 'a' }, 'a'), h('option', { value: 'b' }, 'b')],
        }),
      ),
    )
    loaded.set(true)
    await tick()
    expect(select.value).toBe('b')
  })

  it('the user changing the selection through onChange is not reverted by an options update', async () => {
    const value = signal('a')
    const options = signal(['a', 'b'])
    const select = mountApp(
      h(
        'select',
        { value: () => value(), onChange: (e: Event) => value.set((e.target as HTMLSelectElement).value) },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    select.value = 'b'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(value()).toBe('b')
    options.set(['a', 'b', 'c'])
    await tick()
    expect(select.value).toBe('b')
  })

  it('value={undefined} does not control the select: an options update keeps the user\'s pick', async () => {
    const options = signal<string[]>(['a', 'b'])
    const select = mountApp(
      h(
        'select',
        { value: undefined },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    select.value = 'b'
    options.set(['a', 'b', 'c'])
    await tick()
    expect(select.value).toBe('b')
  })

  it('a value with no matching option is selected once that option arrives', async () => {
    const options = signal(['a'])
    const select = mountApp(
      h(
        'select',
        { value: 'z' },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    options.set(['a', 'b'])
    await tick()
    expect(select.value).not.toBe('z')
    options.set(['a', 'b', 'z'])
    await tick()
    expect(select.value).toBe('z')
  })
  it('a value applied when its option arrived is not applied again after the user picks', async () => {
    const options = signal<string[]>([])
    const select = mountApp(
      h(
        'select',
        { value: 'b' },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    options.set(['a', 'b'])
    await tick()
    expect(select.value).toBe('b')
    select.value = 'a'
    options.set(['a', 'b', 'c'])
    await tick()
    expect(select.value).toBe('a')
  })

  it('once applied, a pick the app did not mirror into the signal survives option updates', async () => {
    const value = signal('a')
    const options = signal(['a', 'b'])
    const select = mountApp(
      h(
        'select',
        { value: () => value() },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    // No onChange (or one that declines the change): main's behaviour, kept.
    select.value = 'b'
    options.set(['a', 'b', 'c'])
    await tick()
    expect(select.value).toBe('b')
    expect(value()).toBe('a')
  })

  it('an unmatched value leaves the browser default once options change', async () => {
    const options = signal(['a'])
    const select = mountApp(
      h(
        'select',
        { value: 'z' },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    options.set(['a', 'b'])
    await tick()
    // Not forced back to "nothing selected" on every update.
    expect(select.value).not.toBe('')
  })

  it('removing the selected option is not undone', async () => {
    const options = signal(['a', 'b'])
    const select = mountApp(
      h(
        'select',
        { value: 'b' },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    expect(select.value).toBe('b')
    options.set(['a', 'c'])
    await tick()
    options.set(['a', 'c', 'b'])
    await tick()
    expect(select.value).not.toBe('b')
  })

  it('a multiple select is left to the browser', async () => {
    const options = signal(['a', 'b'])
    const select = mountApp(
      h(
        'select',
        { multiple: true, value: 'a' },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      ),
    )
    select.options[1]!.selected = true
    options.set(['a', 'b', 'c'])
    await tick()
    expect(select.options[0]!.selected).toBe(true)
    expect(select.options[1]!.selected).toBe(true)
  })
})

describe('hydration', () => {
  beforeAll(() => dom._selectWait())

  it('a hydrated select applies its value when its option loads later', async () => {
    const value = signal('b')
    const options = signal<string[]>([])
    const app = () =>
      h(
        'select',
        { value: () => value() },
        h(For, { each: () => options(), by: (o: string) => o, children: (o: string) => h('option', { value: o }, o) }),
      )
    const html = await renderToString(app())
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html
    mounted.push(dom.hydrateRoot(container, app()))
    const select = container.querySelector('select')!
    options.set(['a', 'b', 'c'])
    await tick()
    expect(select.value).toBe('b')
  })
})
