/**
 * Reactive-health overlay (`__PYREON_DEVTOOLS__.reactive.showOverlay()` /
 * Ctrl+Shift+R) — the zero-install in-app dev panel that surfaces
 * `describeReactiveGraph` health insights (orphan signals, high-fanout hubs,
 * deep chains).
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
