/**
 * The page side of the bridge (`createHook`) against the REAL framework
 * hook: `mount()` from @pyreon/runtime-dom installs
 * `window.__PYREON_DEVTOOLS__`, signals come from @pyreon/reactivity, and
 * text bindings go through the real `_bindText`. Only the transport is a
 * plain array.
 */
import { h } from '@pyreon/core'
import { __resetReactiveDevtoolsForTesting, computed, signal } from '@pyreon/reactivity'
import { _bindText, mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSOLE_CAP, createHook, type Hook, MOUNTED_IDS_CAP } from './hook'
import type { HookMessage, PyreonDevtools } from './types'

type TextSource = Parameters<typeof _bindText>[0]

function devtools(): PyreonDevtools {
  return window.__PYREON_DEVTOOLS__ as PyreonDevtools
}

let disposeApp: (() => void) | null = null
let hook: Hook | null = null
let sent: HookMessage[] = []
const keepAlive: unknown[] = []

function start(extra: Partial<Parameters<typeof createHook>[1]> = {}): Hook {
  sent = []
  hook = createHook(devtools(), {
    emit: (m) => sent.push(structuredClone(m)),
    host: 'localhost:5173',
    ...extra,
  })
  return hook
}

function last<T extends HookMessage['type']>(type: T): Extract<HookMessage, { type: T }> {
  const m = [...sent].reverse().find((x) => x.type === type)
  if (!m) throw new Error(`no ${type} message`)
  return m as Extract<HookMessage, { type: T }>
}

beforeEach(() => {
  __resetReactiveDevtoolsForTesting()
  keepAlive.length = 0
})

afterEach(() => {
  hook?.dispose()
  hook = null
  disposeApp?.()
  disposeApp = null
  document.body.innerHTML = ''
  vi.useRealTimers()
})

function App() {
  return h('main', null, h(Header, null), h(Composer, null))
}
function Header() {
  return h('header', null, 'Inbox')
}
function Composer() {
  return h('p', { class: 'composer' })
}

function mountApp(): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  disposeApp = mount(h(App, null), container)
  return container
}

describe('createHook', () => {
  it('answers hello with version, host and whether the reactive bridge exists', () => {
    mountApp()
    start().handle({ type: 'hello' })
    expect(last('pyreon-detected')).toEqual({
      type: 'pyreon-detected',
      version: devtools().version,
      host: 'localhost:5173',
      reactive: true,
    })
  })

  it('get-all returns plain entries whose parentId rebuilds the tree', () => {
    mountApp()
    start().handle({ type: 'get-all' })
    const { entries } = last('all-result')
    const byName = new Map(entries.map((e) => [e.name, e]))
    expect(byName.get('Header')?.parentId).toBe(byName.get('App')?.id)
    expect(byName.get('Composer')?.parentId).toBe(byName.get('App')?.id)
    // Plain data: no DOM element crosses the bridge.
    expect(JSON.parse(JSON.stringify(entries))).toEqual(entries)
  })

  it('coalesces mounts into one capped message', () => {
    vi.useFakeTimers()
    mountApp()
    start()
    const many = Array.from({ length: MOUNTED_IDS_CAP + 50 }, () => h(Header, null))
    const c = document.createElement('div')
    document.body.appendChild(c)
    const off = mount(h('div', null, ...many), c)
    expect(sent.filter((m) => m.type === 'components-changed')).toHaveLength(0)
    vi.advanceTimersByTime(150)
    const changed = sent.filter((m) => m.type === 'components-changed')
    expect(changed).toHaveLength(1)
    const msg = changed[0] as Extract<HookMessage, { type: 'components-changed' }>
    expect(msg.mountedTotal).toBe(MOUNTED_IDS_CAP + 50)
    expect(msg.mounted).toHaveLength(MOUNTED_IDS_CAP)
    off()
    vi.advanceTimersByTime(150)
    const unmount = last('components-changed')
    expect(unmount.unmounted).toHaveLength(MOUNTED_IDS_CAP + 50)
  })

  it('inspect reports the text bindings inside a component and why the latest one updated', () => {
    const container = mountApp()
    const p = container.querySelector('p.composer') as HTMLElement
    const draft = signal('', { name: 'draft' })
    const length = computed(() => draft().length)
    keepAlive.push(draft, length)
    const t1 = document.createTextNode('')
    const t2 = document.createTextNode('')
    p.append(t1, t2)
    _bindText(draft as unknown as TextSource, t1)
    _bindText(length as unknown as TextSource, t2)
    const h1 = start()
    h1.handle({ type: 'reactive-activate' })
    // Every fire of the cascade lands in the same clock tick, as it does in
    // a browser whose `performance.now()` is coarsened to 100 µs. The
    // inspector must still pick the computed (it fired after the signal).
    // Later than any real timestamp already recorded (activation, mounts): a
    // fixed small value (the old `1000`) is EARLIER than the earlier fires once
    // the test process has been up more than a second, as it has on a loaded
    // CI runner, so the inspector picked an older cascade and the chain was [].
    const clock = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1_000_000)
    draft.set('Ship it')
    clock.mockRestore()
    h1.handle({ type: 'get-all' })
    const composer = last('all-result').entries.find((e) => e.name === 'Composer')!
    h1.handle({ type: 'inspect', id: composer.id })
    const { detail } = last('component-detail')
    expect(detail.hasElement).toBe(true)
    expect(detail.reads.map((r) => r.name)).toEqual(['draft', expect.stringMatching(/^derived/)])
    expect(detail.reads[0]).toMatchObject({ kind: 'signal', value: '"Ship it"', fires: 1 })
    expect(detail.cause).not.toBeNull()
    // The latest read to fire is the computed; its cause is the draft write.
    expect(detail.cause!.target.kind).toBe('derived')
    expect(detail.cause!.chain.map((l) => l.name)).toEqual(['draft'])
  })

  it('inspect of a component with no bindings, or one that is gone', () => {
    mountApp()
    const h1 = start()
    h1.handle({ type: 'get-all' })
    const header = last('all-result').entries.find((e) => e.name === 'Header')!
    h1.handle({ type: 'inspect', id: header.id })
    expect(last('component-detail').detail).toMatchObject({ hasElement: true, reads: [], cause: null })
    const before = sent.length
    h1.handle({ type: 'inspect', id: 'no-such-id' })
    expect(sent).toHaveLength(before)
  })

  it('reactive-poll returns the page clock with the graph, or fires only', () => {
    mountApp()
    const s = signal(1, { name: 'count' })
    keepAlive.push(s)
    const h1 = start()
    h1.handle({ type: 'reactive-activate' })
    s.set(2)
    h1.handle({ type: 'reactive-poll' })
    const snap = last('reactive-snapshot')
    expect(snap.graph?.nodes.some((n) => n.name === 'count')).toBe(true)
    expect(snap.fires.length).toBeGreaterThan(0)
    expect(snap.now).toBeGreaterThanOrEqual(snap.fires[snap.fires.length - 1]!.ts)
    h1.handle({ type: 'reactive-poll', graph: false })
    expect(last('reactive-snapshot').graph).toBeNull()
    h1.handle({ type: 'reactive-deactivate' })
    h1.handle({ type: 'reactive-poll' })
    expect(last('reactive-snapshot').graph?.nodes).toEqual([])
  })

  it('highlight and the picker route to the real hook', () => {
    mountApp()
    const h1 = start()
    const hl = vi.spyOn(devtools(), 'highlight')
    const on = vi.spyOn(devtools(), 'enableOverlay')
    const offSpy = vi.spyOn(devtools(), 'disableOverlay')
    h1.handle({ type: 'highlight', id: 'x' })
    h1.handle({ type: 'highlight', id: '' })
    h1.handle({ type: 'toggle-overlay', enabled: true })
    h1.handle({ type: 'toggle-overlay', enabled: false })
    expect(hl).toHaveBeenCalledTimes(1)
    expect(on).toHaveBeenCalledTimes(1)
    expect(offSpy).toHaveBeenCalledTimes(1)
  })

  it('captures [Pyreon] console lines only after a panel subscribes, capped and restorable', () => {
    vi.useFakeTimers()
    mountApp()
    const fake = { warn: vi.fn(), error: vi.fn() }
    const origWarn = fake.warn
    const target = new EventTarget()
    const h1 = start({ console: fake, errorTarget: target as unknown as Window })
    fake.warn('[Pyreon] before subscribe')
    h1.handle({ type: 'console-subscribe' })
    expect(last('console-entries')).toMatchObject({ entries: [], reset: true })
    fake.warn('[Pyreon] <For> has no by', { n: 1 })
    fake.warn('unrelated library warning')
    fake.error(new Error('[Pyreon] signal(v) only reads'))
    const ev = new Event('error') as Event & { error?: unknown }
    ev.error = new Error('[Pyreon] boom')
    target.dispatchEvent(ev)
    const rej = new Event('unhandledrejection') as Event & { reason?: unknown }
    rej.reason = '[Pyreon] rejected'
    target.dispatchEvent(rej)
    // Original console still called for every line.
    expect(origWarn).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(150)
    const batch = last('console-entries')
    expect(batch.reset).toBe(false)
    expect(batch.entries.map((e) => [e.level, e.text])).toEqual([
      ['warn', '[Pyreon] <For> has no by {"n":1}'],
      ['error', 'Error: [Pyreon] signal(v) only reads'],
      ['error', 'Error: [Pyreon] boom'],
      ['error', '[Pyreon] rejected'],
    ])
    // A second subscriber gets the backlog.
    h1.handle({ type: 'console-subscribe' })
    expect(last('console-entries').entries).toHaveLength(4)
    // Bounded: the ring keeps the newest CONSOLE_CAP lines.
    for (let i = 0; i < CONSOLE_CAP + 10; i++) fake.warn(`[Pyreon] w${i}`)
    h1.handle({ type: 'console-subscribe' })
    const backlog = last('console-entries').entries
    expect(backlog).toHaveLength(CONSOLE_CAP)
    expect(backlog[backlog.length - 1]!.text).toBe(`[Pyreon] w${CONSOLE_CAP + 9}`)
    h1.handle({ type: 'console-clear' })
    expect(last('console-entries')).toMatchObject({ entries: [], reset: true })
    // dispose restores the console.
    h1.dispose()
    hook = null
    expect(fake.warn).toBe(origWarn)
  })

  it('reactive-eval returns the value, or the error, bounded', () => {
    mountApp()
    const h1 = start()
    h1.handle({ type: 'reactive-eval', expr: '1 + 2' })
    expect(last('reactive-eval-result')).toMatchObject({ ok: true, result: '3' })
    h1.handle({ type: 'reactive-eval', expr: '"x".repeat(5000)' })
    expect(last('reactive-eval-result').result).toHaveLength(2001)
    h1.handle({ type: 'reactive-eval', expr: 'throw new TypeError("nope")' })
    expect(last('reactive-eval-result')).toMatchObject({ ok: false, result: 'TypeError: nope' })
    h1.handle({ type: 'reactive-eval', expr: '(() => { const o = {}; o.o = o; return o })()' })
    expect(last('reactive-eval-result')).toMatchObject({ ok: true, result: '[object Object]' })
  })

  it('works against a framework without the reactive bridge', () => {
    mountApp()
    const { reactive: _omit, ...rest } = devtools()
    const bare = { ...rest, version: devtools().version } as PyreonDevtools
    const out: HookMessage[] = []
    const h1 = createHook(bare, { emit: (m) => out.push(m), host: 'h' })
    h1.handle({ type: 'hello' })
    h1.handle({ type: 'reactive-activate' })
    h1.handle({ type: 'reactive-deactivate' })
    h1.handle({ type: 'reactive-poll' })
    h1.handle({ type: 'get-all' })
    const id = (out.find((m) => m.type === 'all-result') as Extract<HookMessage, { type: 'all-result' }>).entries[0]!.id
    h1.handle({ type: 'inspect', id })
    expect(out.map((m) => m.type)).toEqual(['pyreon-detected', 'all-result', 'component-detail'])
    expect((out[0] as Extract<HookMessage, { type: 'pyreon-detected' }>).reactive).toBe(false)
    h1.dispose()
  })
})
