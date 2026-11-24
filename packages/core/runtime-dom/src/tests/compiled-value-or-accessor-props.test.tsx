/**
 * #4830 class: a control-flow component whose condition/source prop accepts an
 * accessor must ALSO accept the value. The compiler turns `when={hasData}` (a
 * component-local signal/computed) and `when={hasData()}` into
 * `_rp(() => hasData())`, which the renderer exposes as a GETTER — `props.when`
 * is the boolean, not a function. `<Defer when>` called it and threw
 * `props.when is not a function`; `<Transition show>`, `<KeepAlive active>` and
 * `<TransitionGroup items>` had the same shape.
 *
 * Real source through each compiler backend, mounted — not a hand-written
 * getter: the bug only exists in the compiled shape.
 */
import { createRequire } from 'node:module'
import * as core from '@pyreon/core'
import { transformJSX_JS } from '@pyreon/compiler'
import * as reactivity from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import * as template from '../template'

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

/**
 * Compile `source`, resolve its imports against the real packages, lower the
 * remaining JSX to `h`, and return what the module body `return`s. `extra`
 * binds free names the test provides (a lazy chunk, an `expose` hook).
 */
function load(compile: Backend, source: string, extra: Record<string, unknown> = {}) {
  const out = compile(source)
  const scope: Record<string, unknown> = { h: core.h, Fragment: core.Fragment, ...extra }
  const body = out.replace(
    /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?$/gm,
    (_m, names: string, from: string) => {
      const mod = MODULES[from]
      if (!mod) throw new Error(`unexpected import from ${from}\n${out}`)
      for (const spec of names.split(',')) {
        const [name, alias] = spec.trim().split(/\s+as\s+/)
        if (!name) continue
        if (!(name in mod)) throw new Error(`${from} has no export ${name}`)
        scope[(alias ?? name).trim()] = mod[name]
      }

      return ''
    },
  )
  const js = transformSync(body, {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const names = Object.keys(scope)
  const result = new Function(...names, js)(...Object.values(scope)) as () => unknown

  return { App: result, out }
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

const tick = () => new Promise((r) => setTimeout(r, 0))

function Late() {
  return core.h('p', { id: 'late' }, 'loaded')
}

for (const [backend, compile] of backends) {
  describe(`${backend}: value-or-accessor control-flow props (#4830)`, () => {
    // The issue's repro: a component-local computed passed bare.
    for (const [shape, when] of [
      ['when={hasData} (component-local computed)', 'hasData'],
      ['when={hasData()} (called in JSX)', 'hasData()'],
      ['when={() => hasData()} (explicit accessor)', '() => hasData()'],
    ] as const) {
      it(`<Defer ${shape}> loads the chunk when it turns true`, async () => {
        let data: reactivity.Signal<string | null> | undefined
        const { App, out } = load(
          compile,
          `import { Defer } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
function Page() {
  const data = signal(null)
  const hasData = computed(() => data() !== null)
  expose(data)
  return <section><Defer chunk={() => Promise.resolve({ default: Late })} when={${when}}>{(L) => <L />}</Defer></section>
}
return Page`,
          { Late, expose: (d: reactivity.Signal<string | null>) => (data = d) },
        )
        const container = mountApp(App)
        expect(container.querySelector('#late'), out).toBeNull()
        data!.set('x')
        await tick()
        expect(container.querySelector('#late'), out).not.toBeNull()
      })
    }

    it('<Transition show={open}> follows a component-local signal', async () => {
      let open: reactivity.Signal<boolean> | undefined
      const { App, out } = load(
        compile,
        `import { Transition } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
function Page() {
  const open = signal(false)
  expose(open)
  return <div><Transition name="fade" show={open}><p id="t">hi</p></Transition></div>
}
return Page`,
        { expose: (s: reactivity.Signal<boolean>) => (open = s) },
      )
      const container = mountApp(App)
      expect(container.querySelector('#t'), out).toBeNull()
      open!.set(true)
      await tick()
      expect(container.querySelector('#t'), out).not.toBeNull()
    })

    it('<KeepAlive active={isA}> hides and shows with a component-local computed', async () => {
      let route: reactivity.Signal<string> | undefined
      const { App, out } = load(
        compile,
        `import { KeepAlive } from '@pyreon/runtime-dom'
import { computed, signal } from '@pyreon/reactivity'
function Page() {
  const route = signal('a')
  const isA = computed(() => route() === 'a')
  expose(route)
  return <div><KeepAlive active={isA}><p id="k">a</p></KeepAlive></div>
}
return Page`,
        { expose: (s: reactivity.Signal<string>) => (route = s) },
      )
      const container = mountApp(App)
      await tick()
      const host = container.querySelector('#k')?.parentElement as HTMLElement | null
      expect(host, out).not.toBeNull()
      expect(host!.style.display, out).not.toBe('none')
      route!.set('b')
      expect(host!.style.display).toBe('none')
      route!.set('a')
      expect(host!.style.display).not.toBe('none')
    })

    it('<TransitionGroup items={list}> renders and follows a component-local signal', async () => {
      let list: reactivity.Signal<{ id: number }[]> | undefined
      const { App, out } = load(
        compile,
        `import { TransitionGroup } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'
function Page() {
  const list = signal([{ id: 1 }])
  expose(list)
  return <TransitionGroup tag="ul" items={list} keyFn={(r) => r.id} render={(r) => h('li', { class: 'row' }, String(r.id))} />
}
return Page`,
        { expose: (s: reactivity.Signal<{ id: number }[]>) => (list = s) },
      )
      const container = mountApp(App)
      await tick()
      expect(container.querySelectorAll('li.row').length, out).toBe(1)
      list!.set([{ id: 1 }, { id: 2 }])
      await tick()
      expect(container.querySelectorAll('li.row').length, out).toBe(2)
    })
  })

  describe(`${backend}: a component declared inside a callback compiles like one at module level`, () => {
    // Triage note on #4830: `function Page` inside a `test()` callback did not
    // get the signal auto-call, so the same component behaved differently in a
    // test than in the app. Every `const` inside ANY call-argument callback was
    // excluded from tracking, including the body of a component nested in one.
    const page = `function Page() {
    const open = signal(false)
    return <Comp when={open} />
  }`
    const emitOf = (src: string) =>
      compile(`import { signal } from '@pyreon/reactivity'\n${src}`)
        .split('\n')
        .find((l) => l.includes('<Comp'))
        ?.trim()

    it.each([
      ['a test() callback', `test('x', () => {\n  ${page}\n})`],
      ['an async callback', `run(async () => {\n  ${page}\n})`],
      ['a const arrow component in a callback', `run(() => {\n  const Page = () => {\n    const open = signal(false)\n    return <Comp when={open} />\n  }\n})`],
    ])('%s', (_label, src) => {
      expect(emitOf(src)).toBe(emitOf(page))
      expect(emitOf(src)).toContain('_rp(() => open())')
    })

    it('a non-component callback keeps its consts untracked (unchanged)', () => {
      // `.map` rows and other lowercase callbacks are NOT component bodies.
      const out = compile(
        `import { signal } from '@pyreon/reactivity'\nconst rows = items.map((it) => {\n  const open = signal(false)\n  return <Comp when={open} />\n})`,
      )
      expect(out).toContain('when={open}')
    })
  })
}
