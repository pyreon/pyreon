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
import { afterEach, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { hydrateRoot } from '../index'
import { compilePlainModule, mountComponent } from './plain-harness'

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

describe('deep state (behavioral)', () => {
  it('todos.push(t) updates the DOM — array mutation notifies through the store proxy', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let todos = state([{ text: 'ship' }])
export const add = (t) => { todos.push({ text: t }) }
export function List() {
  return <div><span>{todos.length}</span><b>{todos.map((t) => t.text).join(',')}</b></div>
}`
    const { exports } = compilePlainModule<{ List: unknown; add: (t: string) => void }>(src, [
      'List',
      'add',
    ])
    const { container, cleanup } = mountComponent(exports.List)
    expect(container.querySelector('span')!.textContent).toBe('1')
    exports.add('test')
    expect(container.querySelector('span')!.textContent).toBe('2')
    expect(container.querySelector('b')!.textContent).toBe('ship,test')
    cleanup()
  })

  it('member writes update text AND attr bindings; component props stay live', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let user = state({ name: 'Ada' })
export const rename = (n) => { user.name = n }
function Badge(props) {
  return <em>{props.v}</em>
}
export function Card() {
  return <div title={user.name}><span>{user.name}</span><Badge v={user.name} /></div>
}`
    const { exports } = compilePlainModule<{ Card: unknown; rename: (n: string) => void }>(src, [
      'Card',
      'rename',
    ])
    const { container, cleanup } = mountComponent(exports.Card)
    const root = container.querySelector('div')!
    expect(root.getAttribute('title')).toBe('Ada')
    expect(container.querySelector('span')!.textContent).toBe('Ada')
    expect(container.querySelector('em')!.textContent).toBe('Ada')
    exports.rename('Grace')
    expect(root.getAttribute('title')).toBe('Grace')
    expect(container.querySelector('span')!.textContent).toBe('Grace')
    expect(container.querySelector('em')!.textContent).toBe('Grace')
    cleanup()
  })

  it('per-key granularity: an effect on one key does NOT re-run when a sibling key changes', () => {
    const src = `'use plain'
import { state, effect } from '@pyreon/core/plain'
let user = state({ name: 'Ada', age: 36 })
export const log = []
effect(() => { log.push(user.name) })
export const setAge = (a) => { user.age = a }
export const setName = (n) => { user.name = n }`
    const { exports } = compilePlainModule<{
      log: string[]
      setAge: (a: number) => void
      setName: (n: string) => void
    }>(src, ['log', 'setAge', 'setName'])
    expect(exports.log).toEqual(['Ada'])
    exports.setAge(37)
    expect(exports.log).toEqual(['Ada']) // sibling key — no re-run
    exports.setName('Grace')
    expect(exports.log).toEqual(['Ada', 'Grace'])
  })

  it('whole reassignment replaces the store and re-renders; later mutations on the NEW value track', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let user = state({ name: 'Ada' })
export const replace = () => { user = { name: 'Bo' } }
export const rename = (n) => { user.name = n }
export function View() { return <span>{user.name}</span> }`
    const { exports } = compilePlainModule<{
      View: unknown
      replace: () => void
      rename: (n: string) => void
    }>(src, ['View', 'replace', 'rename'])
    const { container, cleanup } = mountComponent(exports.View)
    expect(container.textContent).toBe('Ada')
    exports.replace()
    expect(container.textContent).toBe('Bo')
    exports.rename('Grace') // the REPLACED value must still be a live store
    expect(container.textContent).toBe('Grace')
    cleanup()
  })

  it('state.raw opts out: member mutation is silent, replacement notifies', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let cfg = state.raw({ label: 'a' })
export const mutate = () => { cfg.label = 'MUTATED' }
export const replace = () => { cfg = { label: 'replaced' } }
export function View() { return <span>{cfg.label}</span> }`
    const { exports } = compilePlainModule<{
      View: unknown
      mutate: () => void
      replace: () => void
    }>(src, ['View', 'mutate', 'replace'])
    const { container, cleanup } = mountComponent(exports.View)
    expect(container.textContent).toBe('a')
    exports.mutate()
    expect(container.textContent).toBe('a') // shallow — silent by contract (compiler warned)
    exports.replace()
    expect(container.textContent).toBe('replaced')
    cleanup()
  })

  it('total tracking: a branch-gated key read is subscribed from the first run', () => {
    const src = `'use plain'
import { state, effect } from '@pyreon/core/plain'
let user = state({ name: 'Ada' })
let gate = state(false)
export let runs = 0
effect(() => { runs++; if (gate) console.debug(user.name) })
export const rename = (n) => { user.name = n }
export const readRuns = () => runs`
    const { exports } = compilePlainModule<{
      readRuns: () => number
      rename: (n: string) => void
    }>(src, ['readRuns', 'rename'])
    expect(exports.readRuns()).toBe(1)
    // gate is FALSE — the branch never ran, but the prologue subscribed the key
    exports.rename('Grace')
    expect(exports.readRuns()).toBe(2)
  })
})

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
