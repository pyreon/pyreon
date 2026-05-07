/**
 * Store stress section — exercises @pyreon/store hot paths under load.
 *
 * Doesn't render anything visually meaningful (a few buttons + a status
 * line); the real entry point is the window helper at
 * `window.__pyreon_perf_stores`, which `examples/perf-dashboard/src/main.tsx`
 * exposes and `examples/perf-dashboard/src/journeys.ts` drives via
 * `page.evaluate()`. Mirroring the form journey's pattern: avoid Playwright
 * `.click()` cost and `Object.is` short-circuits by going straight at the
 * primitive surface.
 *
 * The journey tasks are deliberately deterministic across runs:
 * - `seedStores(N)` creates N unique stores (uniquely-id'd per run)
 * - `clearAll()` disposes every store and resets the id counter so the next
 *   `seedStores` call starts fresh
 * - Each helper resets `_seq` so a journey re-running on the same page
 *   doesn't accumulate work from prior runs.
 */
import { addStorePlugin, defineStore, signal } from '@pyreon/store'
import type { StoreApi } from '@pyreon/store'
import { Accent, GhostButton, Row, Section, SectionTitle } from './atoms'
import { themeSignal } from '../App'

// ── Tracking ─────────────────────────────────────────────────────────────

type AnyApi = StoreApi<Record<string, unknown>>
const _activeStores: AnyApi[] = []
let _seq = 0
let _pluginsRegistered = 0
const status = signal<string>('idle')

// ── Helpers ──────────────────────────────────────────────────────────────

function makeStore(): AnyApi {
  _seq++
  const useS = defineStore(`perf-store-${_seq}`, () => {
    const a = signal(0)
    const b = signal(1)
    const c = signal(2)
    const inc = () => a.set(a.peek() + 1)
    const dec = () => a.set(a.peek() - 1)
    return { a, b, c, inc, dec }
  })
  const api = useS()
  _activeStores.push(api)
  return api
}

function clearAll(): void {
  for (const api of _activeStores) api.dispose()
  _activeStores.length = 0
  _seq = 0
}

// ── Journey API exposed on window ────────────────────────────────────────

interface PerfStoresWindow {
  __pyreon_perf_stores?: {
    seedStores: (n: number) => void
    clearAll: () => void
    /** Call action `calls` times across `_activeStores`, with `listenersPerStore` listeners attached. */
    actionLoop: (calls: number, listenersPerStore: number) => void
    /** Call patch on each active store, `patchesPerStore` times each, touching `keysPerPatch` keys per call. */
    patchLoop: (patchesPerStore: number, keysPerPatch: number) => void
    /** Subscribe `subscribersPerStore` callbacks to each active store, then write 1 signal per store. */
    subscribeFan: (subscribersPerStore: number) => void
    /** Register `n` global store plugins (additive — does not unregister; call `clearAll` between runs). */
    registerPlugins: (n: number) => void
    /** Reset journey state for a fresh measurement: clear stores AND drop registered plugins. */
    fullReset: () => void
    /** Status string (debug only) */
    status: () => string
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as PerfStoresWindow).__pyreon_perf_stores = {
    seedStores(n: number) {
      for (let i = 0; i < n; i++) makeStore()
      status.set(`seeded ${_activeStores.length} stores`)
    },
    clearAll() {
      clearAll()
      status.set('cleared')
    },
    actionLoop(calls: number, listenersPerStore: number) {
      // Attach `listenersPerStore` onAction listeners to each store. Each
      // listener is a freshly-allocated function so the underlying
      // `Set<callback>` keeps them distinct (registering the same function
      // reference twice would dedupe and silently halve the fan-out).
      for (const api of _activeStores) {
        for (let i = 0; i < listenersPerStore; i++) api.onAction(() => {})
      }
      // Round-robin action calls across active stores.
      const len = _activeStores.length
      if (len === 0) return
      for (let i = 0; i < calls; i++) {
        const api = _activeStores[i % len]!
        ;(api.store as { inc: () => void }).inc()
      }
      status.set(`${calls} actions × ${listenersPerStore} listeners across ${len} stores`)
    },
    patchLoop(patchesPerStore: number, keysPerPatch: number) {
      // keysPerPatch is capped at 3 (a/b/c) — the stress shape is
      // batch-flush distribution under N patches, not patch-shape variation.
      const k = Math.min(keysPerPatch, 3)
      const keys: ('a' | 'b' | 'c')[] = ['a', 'b', 'c']
      for (const api of _activeStores) {
        for (let i = 0; i < patchesPerStore; i++) {
          const p: Record<string, unknown> = {}
          for (let j = 0; j < k; j++) p[keys[j]!] = i + j
          api.patch(p)
        }
      }
      status.set(`${patchesPerStore} patches × ${k} keys across ${_activeStores.length} stores`)
    },
    subscribeFan(subscribersPerStore: number) {
      // Same Set-dedup gotcha as actionLoop — fresh callback per iteration.
      for (const api of _activeStores) {
        for (let i = 0; i < subscribersPerStore; i++) api.subscribe(() => {})
      }
      // Single write per store fans out across all subscribers.
      for (const api of _activeStores) {
        ;(api.store as { inc: () => void }).inc()
      }
      status.set(
        `${subscribersPerStore} subs/store × ${_activeStores.length} stores → 1 write each`,
      )
    },
    registerPlugins(n: number) {
      // Idempotent: ensures AT LEAST `n` plugins are registered.
      // The record script reuses the same page across N cycles without
      // reloading, so naive "always add n" would accumulate plugins
      // run-over-run and the median across cycles would be meaningless.
      // Top-up semantics give every cycle the same shape (run 1 registers,
      // runs 2..N no-op).
      const noopPlugin = (_api: AnyApi): void => {}
      const toAdd = Math.max(0, n - _pluginsRegistered)
      for (let i = 0; i < toAdd; i++) addStorePlugin(noopPlugin)
      _pluginsRegistered += toAdd
      status.set(`+${toAdd} plugins (total: ${_pluginsRegistered})`)
    },
    fullReset() {
      // Drops all stores. Plugin chain persists across this — the
      // `registerPlugins` top-up semantics handle the cycle-stability
      // case (each cycle ends up with the same plugin count regardless
      // of how many times it's been called).
      clearAll()
      status.set('cleared (plugins persist by design)')
    },
    status() {
      return status.peek()
    },
  }
}

// ── UI ────────────────────────────────────────────────────────────────────

export function StoreStressSection() {
  const win = (): PerfStoresWindow['__pyreon_perf_stores'] =>
    (window as unknown as PerfStoresWindow).__pyreon_perf_stores

  return (
    <Section theme={themeSignal()}>
      <SectionTitle theme={themeSignal()}>@pyreon/store — stress harness</SectionTitle>
      <Row>
        <GhostButton
          theme={themeSignal()}
          data-testid="store-seed-1000"
          onClick={() => win()?.seedStores(1000)}
        >
          Seed 1000 stores
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="store-clear"
          onClick={() => win()?.clearAll()}
        >
          Clear all
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="store-action-loop"
          onClick={() => win()?.actionLoop(10000, 5)}
        >
          10k actions × 5 listeners
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="store-patch-loop"
          onClick={() => win()?.patchLoop(1000, 3)}
        >
          1k patches × 3 keys
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="store-subscribe-fan"
          onClick={() => win()?.subscribeFan(10)}
        >
          Subscribe fan (10/store)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="store-plugins"
          onClick={() => win()?.registerPlugins(5)}
        >
          +5 plugins
        </GhostButton>
      </Row>
      <div data-testid="store-status" style="font-family: monospace; padding: 8px;">
        status: <Accent theme={themeSignal()}>{() => status()}</Accent>
      </div>
    </Section>
  )
}
