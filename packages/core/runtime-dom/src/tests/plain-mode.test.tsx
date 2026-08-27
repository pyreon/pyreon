/**
 * Plain Mode — BEHAVIORAL specs.
 *
 * Every spec compiles Plain-Mode source through the REAL `transformJSX`
 * (plain pre-pass + full JSX transform), executes the output, mounts it, and
 * asserts DOM behavior — clicks, signal flips, derived chains, effect
 * re-runs, props liveness, early-return flips, and classic↔plain twin
 * equivalence. The transform-SHAPE specs live in `@pyreon/compiler`
 * `src/tests/plain.test.ts`; this file proves the shapes actually behave.
 */
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { transformJSX } from '@pyreon/compiler'
import * as JsxRuntime from '@pyreon/core/jsx-runtime'
import { Fragment, h, _rp, cx } from '@pyreon/core'
import { _bind, computed, effect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { _tpl, _bindText, _bindDirect, _setChild, _setChildAt } from '../template'
import {
  _applyProps,
  _setAttr,
  _setClass,
  _setStyle,
  _setValue,
  bindPolymorphicText,
  hydrateRoot,
  mountChild,
} from '../index'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _setChild,
  _setChildAt,
  bindPolymorphicText,
  _applyProps,
  _setStyle,
  _setClass,
  _setAttr,
  _setValue,
  _rp,
  _cx: cx,
  h,
  Fragment,
  signal,
  computed,
  effect,
  document,
} as const

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

/**
 * Lower the transform's RESIDUAL JSX the way a real build does — esbuild's
 * automatic runtime with `jsxImportSource: "@pyreon/core"` (the production
 * setting). Alias names are read back off the emitted import statement.
 */
function lowerResidualJsx(code: string): { js: string; extra: Record<string, unknown> } {
  const out = transformSync(code, {
    loader: 'tsx',
    jsx: 'automatic',
    jsxImportSource: '@pyreon/core',
  }).code
  const jsxRuntime = JsxRuntime as unknown as Record<string, unknown>
  const extra: Record<string, unknown> = {}
  const importRe = /import\s*\{([^}]*)\}\s*from\s*"[^"]*jsx-runtime"/g
  for (const m of out.matchAll(importRe)) {
    for (const part of (m[1] as string).split(',')) {
      const [orig, alias] = part.split(' as ').map((s) => s.trim())
      if (!orig) continue
      extra[alias ?? orig] = jsxRuntime[orig]
    }
  }
  return { js: stripImports(out), extra }
}

/**
 * Compile a Plain-Mode MODULE (plain pre-pass + JSX transform + residual-JSX
 * lowering), execute it with runtime deps injected, and return its named
 * exports. `globals` are extra bindings the source mentions.
 */
function compilePlainModule<T extends Record<string, unknown>>(
  source: string,
  exportNames: string[],
  globals: Record<string, unknown> = {},
  transformOptions: { ssr?: boolean } = {},
): { exports: T; code: string } {
  const result = transformJSX(source, 'plain-test.tsx', transformOptions)
  const { js, extra } = lowerResidualJsx(stripImports(result.code))
  const body = js.replace(/^export\s+(?=(const|function|let|var))/gm, '')
  const deps = { ...RUNTIME_DEPS, ...extra, ...globals }
  const fn = new Function(...Object.keys(deps), `${body}\nreturn { ${exportNames.join(', ')} }`)
  return { exports: fn(...Object.values(deps)) as T, code: result.code }
}

function mountComponent(
  Component: unknown,
  props: Record<string, unknown> = {},
): { container: HTMLDivElement; cleanup: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(h(Component as never, props), container) as () => void
  return { container, cleanup }
}

/** Fire a delegated click on an element carrying the compiled `__ev_click`. */
function click(el: Element | null): void {
  const target = el as (Element & { __ev_click?: (e: unknown) => void }) | null
  expect(target?.__ev_click, 'element has a compiled click handler').toBeTypeOf('function')
  target!.__ev_click!({ target })
}

afterEach(() => {
  document.body.innerHTML = ''
})

// ─── State + writes ─────────────────────────────────────────────────────────

describe('plain state end to end', () => {
  it('a counter written as plain JavaScript increments the DOM', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let count = state(0)
export function Counter() {
  return <button onClick={() => { count = count + 1 }}>{count}</button>
}`
    const { exports } = compilePlainModule<{ Counter: unknown }>(src, ['Counter'])
    const { container, cleanup } = mountComponent(exports.Counter)
    const btn = container.querySelector('button')!
    expect(btn.textContent).toBe('0')
    click(btn)
    expect(btn.textContent).toBe('1')
    click(btn)
    click(btn)
    expect(btn.textContent).toBe('3')
    cleanup()
  })

  it('compound and update writes are reactive: += and ++', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let n = state(10)
export const bump = () => { n += 5 }
export const inc = () => { n++ }
export function View() { return <span>{n}</span> }`
    const { exports } = compilePlainModule<{
      View: unknown
      bump: () => void
      inc: () => void
    }>(src, ['View', 'bump', 'inc'])
    const { container, cleanup } = mountComponent(exports.View)
    expect(container.textContent).toBe('10')
    exports.bump()
    expect(container.textContent).toBe('15')
    exports.inc()
    expect(container.textContent).toBe('16')
    cleanup()
  })

  it('postfix in expression position yields the OLD value and still updates', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let n = state(7)
export const take = () => n++
export const read = () => n`
    const { exports } = compilePlainModule<{ take: () => number; read: () => number }>(src, [
      'take',
      'read',
    ])
    expect(exports.take()).toBe(7)
    expect(exports.read()).toBe(8)
  })

  it('logical assignment only writes when the base operator says so', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let a = state('kept')
let b = state('')
export const run = () => { a ||= 'replaced'; b ||= 'filled' }
export const read = () => [a, b]`
    const { exports } = compilePlainModule<{ run: () => void; read: () => string[] }>(src, [
      'run',
      'read',
    ])
    exports.run()
    expect(exports.read()).toEqual(['kept', 'filled'])
  })
})

// ─── Derived ────────────────────────────────────────────────────────────────

describe('derived end to end', () => {
  it('a derived chain updates the DOM through plain reads', () => {
    const src = `'use plain'
import { state, derived } from '@pyreon/core/plain'
let count = state(2)
const double = derived(count * 2)
const label = derived(\`value: \${double}\`)
export const set = (v) => { count = v }
export function View() { return <p>{label}</p> }`
    const { exports } = compilePlainModule<{ View: unknown; set: (v: number) => void }>(src, [
      'View',
      'set',
    ])
    const { container, cleanup } = mountComponent(exports.View)
    expect(container.textContent).toBe('value: 4')
    exports.set(10)
    expect(container.textContent).toBe('value: 20')
    cleanup()
  })

  it('conditional derived stays live on BOTH branches (total tracking)', () => {
    const src = `'use plain'
import { state, derived } from '@pyreon/core/plain'
let useA = state(true)
let a = state(1)
let b = state(100)
const pick = derived(useA ? a : b)
export const setup = { flip: () => { useA = !useA }, setB: (v) => { b = v } }
export const read = () => pick`
    const { exports } = compilePlainModule<{
      setup: { flip: () => void; setB: (v: number) => void }
      read: () => number
    }>(src, ['setup', 'read'])
    expect(exports.read()).toBe(1)
    // While useA is true, classic fine-grained tracking would NOT be
    // subscribed to b — total tracking is. Flip after changing b:
    exports.setup.setB(555)
    exports.setup.flip()
    expect(exports.read()).toBe(555)
  })
})

// ─── Effects ────────────────────────────────────────────────────────────────

describe('effect end to end', () => {
  it('re-runs on state change; a conditional read cannot lose its subscription', () => {
    const src = `'use plain'
import { state, effect } from '@pyreon/core/plain'
let gate = state(false)
let dep = state(1)
export const log = []
export const api = { openGate: () => { gate = true }, setDep: (v) => { dep = v } }
effect(() => {
  if (gate) log.push(dep)
  else log.push('closed')
})`
    const { exports } = compilePlainModule<{
      log: unknown[]
      api: { openGate: () => void; setDep: (v: number) => void }
    }>(src, ['log', 'api'])
    expect(exports.log).toEqual(['closed'])
    // Classic tracking: first run never read `dep`, so setDep would be lost.
    // Total tracking hoists the subscription — this re-run MUST happen:
    exports.api.setDep(42)
    expect(exports.log).toEqual(['closed', 'closed'])
    exports.api.openGate()
    expect(exports.log).toEqual(['closed', 'closed', 42])
    exports.api.setDep(43)
    expect(exports.log).toEqual(['closed', 'closed', 42, 43])
  })

  it('a write-only binding does not retrigger its own effect', () => {
    const src = `'use plain'
import { state, effect } from '@pyreon/core/plain'
let trigger = state(0)
let out = state(0)
export const runs = { count: 0 }
export const fire = () => { trigger++ }
export const readOut = () => out
effect(() => {
  runs.count++
  if (trigger >= 0) out = trigger * 10
})`
    const { exports } = compilePlainModule<{
      runs: { count: number }
      fire: () => void
      readOut: () => number
    }>(src, ['runs', 'fire', 'readOut'])
    expect(exports.runs.count).toBe(1)
    exports.fire()
    expect(exports.runs.count).toBe(2)
    expect(exports.readOut()).toBe(10)
    // Writing `out` inside the effect must not have subscribed to `out`.
    expect(exports.runs.count).toBe(2)
  })
})

// ─── Props ──────────────────────────────────────────────────────────────────

describe('destructured props stay live', () => {
  it('a parent state change flows through a DESTRUCTURED child prop into the DOM', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let name = state('Ada')
export const rename = (v) => { name = v }
function Child({ label, suffix = '!' }) {
  return <em>{label + suffix}</em>
}
export function Parent() {
  return <div><Child label={name} /></div>
}`
    const { exports } = compilePlainModule<{ Parent: unknown; rename: (v: string) => void }>(src, [
      'Parent',
      'rename',
    ])
    const { container, cleanup } = mountComponent(exports.Parent)
    expect(container.querySelector('em')!.textContent).toBe('Ada!')
    // The classic destructure footgun: captured once, frozen forever.
    // Plain Mode rewrites to live props.* reads — this MUST update:
    exports.rename('Grace')
    expect(container.querySelector('em')!.textContent).toBe('Grace!')
    cleanup()
  })

  it('body destructure const { x } = props is live too', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let v = state(1)
export const set = (n) => { v = n }
function Inner(props) {
  const { value } = props
  return <b>{value}</b>
}
export function Outer() { return <Inner value={v} /> }`
    const { exports } = compilePlainModule<{ Outer: unknown; set: (n: number) => void }>(src, [
      'Outer',
      'set',
    ])
    const { container, cleanup } = mountComponent(exports.Outer)
    expect(container.querySelector('b')!.textContent).toBe('1')
    exports.set(9)
    expect(container.querySelector('b')!.textContent).toBe('9')
    cleanup()
  })
})

// ─── Early returns ──────────────────────────────────────────────────────────

describe('reactive early returns', () => {
  it('an if/return over state re-evaluates when the state flips', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let loading = state(true)
export const finish = () => { loading = false }
export function Page() {
  if (loading) return <p class="spin">loading…</p>
  return <main>ready</main>
}`
    const { exports } = compilePlainModule<{ Page: unknown; finish: () => void }>(src, [
      'Page',
      'finish',
    ])
    const { container, cleanup } = mountComponent(exports.Page)
    expect(container.querySelector('p.spin')).not.toBeNull()
    expect(container.querySelector('main')).toBeNull()
    exports.finish()
    expect(container.querySelector('p.spin')).toBeNull()
    expect(container.querySelector('main')!.textContent).toBe('ready')
    cleanup()
  })

  it('component-LOCAL state drives the early return', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
export function Toggle() {
  let open = state(false)
  if (!open) return <button onClick={() => { open = true }}>show</button>
  return <div class="content">content</div>
}`
    const { exports } = compilePlainModule<{ Toggle: unknown }>(src, ['Toggle'])
    const { container, cleanup } = mountComponent(exports.Toggle)
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    click(btn)
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('div.content')!.textContent).toBe('content')
    cleanup()
  })
})

// ─── Twin equivalence ───────────────────────────────────────────────────────

describe('classic ↔ plain twin equivalence', () => {
  const classicSrc = `
import { signal, computed } from '@pyreon/reactivity'
const count = signal(3)
const double = computed(() => count() * 2)
export const set = (v) => count.set(v)
export function App() {
  return <section title={double()}>
    <button onClick={() => count.set(count() + 1)}>{count()}</button>
    <p>{double()}</p>
  </section>
}`
  const plainSrc = `'use plain'
import { state, derived } from '@pyreon/core/plain'
let count = state(3)
const double = derived(count * 2)
export const set = (v) => { count = v }
export function App() {
  return <section title={double}>
    <button onClick={() => { count = count + 1 }}>{count}</button>
    <p>{double}</p>
  </section>
}`

  it('renders identical DOM and stays identical through updates', () => {
    const classic = compilePlainModule<{ App: unknown; set: (v: number) => void }>(classicSrc, [
      'App',
      'set',
    ])
    const plain = compilePlainModule<{ App: unknown; set: (v: number) => void }>(plainSrc, [
      'App',
      'set',
    ])
    const a = mountComponent(classic.exports.App)
    const b = mountComponent(plain.exports.App)
    expect(b.container.innerHTML).toBe(a.container.innerHTML)
    classic.exports.set(10)
    plain.exports.set(10)
    expect(b.container.innerHTML).toBe(a.container.innerHTML)
    expect(b.container.querySelector('p')!.textContent).toBe('20')
    a.cleanup()
    b.cleanup()
  })
})

// ─── SSR + hydration ────────────────────────────────────────────────────────

describe('SSR + hydration', () => {
  it('a plain component server-renders and hydrates with live interactivity', async () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let n = state(5)
export const set = (v) => { n = v }
export function App() { return <div><span>{n}</span></div> }`
    // SSR pass (VNode path — h() output) …
    const ssrExports = compilePlainModule<{ App: unknown; set: (v: number) => void }>(
      src,
      ['App', 'set'],
      {},
      { ssr: true },
    ).exports
    const html = await renderToString(h(ssrExports.App as never, {}))
    expect(html).toContain('5')

    // … then hydrate the CLIENT build over it.
    const client = compilePlainModule<{ App: unknown; set: (v: number) => void }>(src, [
      'App',
      'set',
    ])
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    hydrateRoot(container, h(client.exports.App as never, {}))
    expect(container.textContent).toBe('5')
    client.exports.set(6)
    expect(container.textContent).toBe('6')
  })
})
