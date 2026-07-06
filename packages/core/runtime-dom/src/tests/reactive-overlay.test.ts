/**
 * Reactive dev overlay (`__PYREON_DEVTOOLS__.reactive.showOverlay()` /
 * Ctrl+Shift+R) — the zero-install in-app dev panel. Two tabs:
 *   • Health   — `describeReactiveGraph` insights (orphan signals, high-fanout
 *                hubs, deep chains).
 *   • Activity — recent reactive fires + the "why did X update?" causal chain
 *                (`getReactiveFires` + `getUpdateCause`/`formatUpdateCause`).
 *
 * Graph nodes are held by `WeakRef` in the always-on registry, so every test
 * keeps its signals/effects alive in a `keepAlive` bag for the duration of the
 * assertion — otherwise a GC pass could prune them out of the snapshot.
 */
import {
  __resetReactiveDevtoolsForTesting,
  computed,
  effect,
  signal,
} from '@pyreon/reactivity'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installDevTools } from '../devtools'

interface RxBridge {
  showOverlay(): void
  hideOverlay(): void
}

function reactive(): RxBridge {
  const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
    reactive: RxBridge
  }
  return devtools.reactive
}

const PANEL_ID = '__pyreon-reactive-overlay'
const BODY_ID = '__pyreon-rx-body'

function ctrlShiftR(): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: 'R',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
  })
}

describe('reactive health overlay', () => {
  let keepAlive: unknown[] = []

  beforeAll(() => {
    installDevTools()
  })

  beforeEach(() => {
    __resetReactiveDevtoolsForTesting()
    keepAlive = []
  })

  afterEach(() => {
    reactive().hideOverlay()
    __resetReactiveDevtoolsForTesting()
    keepAlive = []
  })

  it('showOverlay mounts the panel and renders the graph summary header', () => {
    const count = signal(0)
    const doubled = computed(() => count() * 2)
    const dispose = effect(() => void doubled())
    keepAlive.push(count, doubled, dispose)

    reactive().showOverlay()

    expect(document.getElementById(PANEL_ID)).not.toBeNull()
    const body = document.getElementById(BODY_ID)
    // header shape: "N signals · M derived · K effects · E edges"
    expect(body?.textContent).toMatch(/\d+ signal.*·.*derived.*·.*effect.*·.*edges/)
  })

  it('surfaces an orphan-signal insight for a signal nothing reads', () => {
    const orphan = signal('unused')
    keepAlive.push(orphan)

    reactive().showOverlay()

    expect(document.getElementById(BODY_ID)?.textContent).toContain('[orphan-signal]')
  })

  it('reports no health issues for a fully-wired graph', () => {
    const a = signal(1)
    const b = computed(() => a() + 1)
    const dispose = effect(() => void b())
    keepAlive.push(a, b, dispose)

    reactive().showOverlay()

    expect(document.getElementById(BODY_ID)?.textContent).toContain('No health issues detected')
  })

  it('hideOverlay removes the panel from the DOM', () => {
    reactive().showOverlay()
    expect(document.getElementById(PANEL_ID)).not.toBeNull()

    reactive().hideOverlay()
    expect(document.getElementById(PANEL_ID)).toBeNull()
  })

  it('Ctrl+Shift+R toggles the panel open then closed', () => {
    const s = signal(0)
    keepAlive.push(s)

    window.dispatchEvent(ctrlShiftR())
    expect(document.getElementById(PANEL_ID)).not.toBeNull()

    window.dispatchEvent(ctrlShiftR())
    expect(document.getElementById(PANEL_ID)).toBeNull()
  })

  it('the refresh button re-reads the live graph', () => {
    const s = signal(0)
    keepAlive.push(s)
    reactive().showOverlay()
    const before = document.getElementById(BODY_ID)?.textContent

    // A newly-created signal only appears after an explicit refresh.
    const s2 = signal(1)
    keepAlive.push(s2)
    const refresh = document.querySelector(`#${PANEL_ID} button`) as HTMLButtonElement
    refresh.click()

    expect(document.getElementById(BODY_ID)?.textContent).not.toBe(before)
  })
})

const HEALTH_TAB = '__pyreon-rx-tab-health'
const ACTIVITY_TAB = '__pyreon-rx-tab-activity'

function clickTab(id: string): void {
  ;(document.getElementById(id) as HTMLButtonElement).click()
}

function bodyText(): string {
  return document.getElementById(BODY_ID)?.textContent ?? ''
}

describe('reactive overlay — Activity view ("why did X update?")', () => {
  let keepAlive: unknown[] = []

  beforeAll(() => {
    installDevTools()
  })

  beforeEach(() => {
    __resetReactiveDevtoolsForTesting()
    keepAlive = []
  })

  afterEach(() => {
    reactive().hideOverlay()
    __resetReactiveDevtoolsForTesting()
    keepAlive = []
  })

  it('opens on the Health tab; the Activity tab switches the body', () => {
    const s = signal(0)
    keepAlive.push(s)
    reactive().showOverlay()

    // Health is the default view — the graph summary header is present.
    expect(bodyText()).toMatch(/signal.*·.*edges/)

    clickTab(ACTIVITY_TAB)
    // Activity view no longer shows the health header.
    expect(bodyText()).not.toMatch(/·.*derived.*·/)
  })

  it('Activity with no fires shows the interact-then-refresh hint', () => {
    reactive().showOverlay()
    clickTab(ACTIVITY_TAB)
    expect(bodyText()).toContain('No reactive updates recorded yet')
  })

  it('after a signal write, Activity lists the fire + a "why did X update?" chain', () => {
    // A real signal → computed → effect chain, then fire it.
    const count = signal(0, { name: 'count' })
    const doubled = computed(() => count() * 2)
    const dispose = effect(() => void doubled())
    keepAlive.push(count, doubled, dispose)

    count.set(1) // fires count → doubled → effect (all recorded in the ring buffer)

    reactive().showOverlay()
    clickTab(ACTIVITY_TAB)

    const text = bodyText()
    expect(text).toContain('Recent updates (newest first):')
    // The named signal shows up in the recent-fires list.
    expect(text).toContain('count')
    // The causal-chain explainer (formatUpdateCause) is rendered.
    expect(text).toContain('Why did')
  })

  it('switching back to the Health tab restores the health view', () => {
    const s = signal(0)
    keepAlive.push(s)
    reactive().showOverlay()

    clickTab(ACTIVITY_TAB)
    expect(bodyText()).not.toMatch(/·.*derived.*·/)

    clickTab(HEALTH_TAB)
    expect(bodyText()).toMatch(/signal.*·.*edges/)
  })

  it('reopening the overlay resets to the Health tab', () => {
    const s = signal(0)
    keepAlive.push(s)
    reactive().showOverlay()
    clickTab(ACTIVITY_TAB)
    expect(bodyText()).not.toMatch(/·.*derived.*·/)

    reactive().hideOverlay()
    reactive().showOverlay()
    // Fresh open is back on Health.
    expect(bodyText()).toMatch(/signal.*·.*edges/)
  })
})
