/**
 * Rx stress section — exercises @pyreon/rx hot paths under load.
 *
 * Same pattern as `StoreStressSection`: minimal UI + window helper at
 * `window.__pyreon_perf_rx` that journeys drive via `page.evaluate()`.
 * Avoids Playwright `.click()` cost so the counter signal is clean.
 *
 * Each journey triggers a fresh allocation cycle so the snapshot
 * captures only that journey's work — counters reset before each run
 * via the record-script harness.
 */
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Accent, GhostButton, Row, Section, SectionTitle } from './atoms'
import { themeSignal } from '../App'

// ── Tracking ─────────────────────────────────────────────────────────────

interface RxArtifact {
  dispose?: () => void
}

const _activeArtifacts: RxArtifact[] = []
const status = signal<string>('idle')

// ── Helpers ──────────────────────────────────────────────────────────────

function makeArr(n: number): { id: number; v: number }[] {
  const arr: { id: number; v: number }[] = []
  for (let i = 0; i < n; i++) arr.push({ id: i, v: ((i * 31) % 9000) + 100 })
  return arr
}

function clearAll(): void {
  for (const a of _activeArtifacts) a.dispose?.()
  _activeArtifacts.length = 0
}

// ── Journey API exposed on window ────────────────────────────────────────

interface PerfRxWindow {
  __pyreon_perf_rx?: {
    /** Allocate a 10k array signal then run rx.filter + rx.map separately (2 transforms). */
    filterMap: (n: number) => void
    /** Same shape as `filterMap` but composed via rx.pipe — proves pipe collapses to 1 computed. */
    pipeChain: (n: number) => void
    /** sortBy on a 10k array signal — single signal write triggers full re-sort. */
    sortBy: (n: number) => void
    /** Allocate a 16ms-debounced signal and write `writes` times rapidly. */
    debounceRapid: (writes: number) => Promise<void>
    /** Aggregate (sum/count/min/max) over a 10k array signal — 4 parallel reactive aggregations. */
    aggregate: (n: number) => void
    /** Drop all artifacts so the next journey runs against a clean slate. */
    clearAll: () => void
    status: () => string
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as PerfRxWindow).__pyreon_perf_rx = {
    filterMap(n: number) {
      clearAll()
      const sig = signal(makeArr(n))
      const filtered = rx.filter(sig, (item) => item.v > 5000)
      const mapped = rx.map(filtered, (item) => item.v * 2)
      // Touch the result so the computed actually runs (cold computeds are
      // lazy until first read).
      void mapped()
      _activeArtifacts.push({}) // signal stays alive until clearAll
      status.set(`filterMap n=${n}`)
    },

    pipeChain(n: number) {
      clearAll()
      const sig = signal(makeArr(n))
      const result = rx.pipe(
        sig,
        (arr: { id: number; v: number }[]) => arr.filter((item) => item.v > 5000),
        (arr: { id: number; v: number }[]) => arr.map((item) => item.v * 2),
      )
      void result()
      _activeArtifacts.push({})
      status.set(`pipeChain n=${n}`)
    },

    sortBy(n: number) {
      clearAll()
      const sig = signal(makeArr(n))
      const sorted = rx.sortBy(sig, 'v')
      void sorted()
      _activeArtifacts.push({})
      status.set(`sortBy n=${n}`)
    },

    async debounceRapid(writes: number) {
      clearAll()
      const sig = signal(0)
      const debounced = rx.debounce(sig, 16)
      _activeArtifacts.push(debounced)
      // Touch the debounced output so the underlying effect runs.
      void debounced()
      // Drive `writes` rapid signal writes in a tight loop. The 16ms
      // debounce means most settle into 1-N output emissions depending
      // on event-loop tick alignment.
      for (let i = 1; i <= writes; i++) sig.set(i)
      // Wait one debounce cycle so the timer fires inside the journey
      // (not after the snapshot).
      await new Promise((r) => setTimeout(r, 32))
      status.set(`debounceRapid writes=${writes}`)
    },

    aggregate(n: number) {
      clearAll()
      const sig = signal(makeArr(n))
      const total = rx.sum(sig, 'v')
      const cnt = rx.count(sig)
      const lo = rx.min(sig, 'v')
      const hi = rx.max(sig, 'v')
      void total()
      void cnt()
      void lo()
      void hi()
      _activeArtifacts.push({})
      status.set(`aggregate n=${n}`)
    },

    clearAll() {
      clearAll()
      status.set('cleared')
    },
    status() {
      return status.peek()
    },
  }
}

// ── UI ────────────────────────────────────────────────────────────────────

export function RxStressSection() {
  const win = (): PerfRxWindow['__pyreon_perf_rx'] =>
    (window as unknown as PerfRxWindow).__pyreon_perf_rx

  return (
    <Section theme={themeSignal()}>
      <SectionTitle theme={themeSignal()}>@pyreon/rx — stress harness</SectionTitle>
      <Row>
        <GhostButton
          theme={themeSignal()}
          data-testid="rx-filter-map"
          onClick={() => win()?.filterMap(10000)}
        >
          filter+map (10k)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="rx-pipe-chain"
          onClick={() => win()?.pipeChain(10000)}
        >
          pipe (10k)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="rx-sort-by"
          onClick={() => win()?.sortBy(10000)}
        >
          sortBy (10k)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="rx-debounce"
          onClick={() => void win()?.debounceRapid(1000)}
        >
          debounce (1000 writes)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="rx-aggregate"
          onClick={() => win()?.aggregate(10000)}
        >
          aggregate (10k)
        </GhostButton>
        <GhostButton theme={themeSignal()} data-testid="rx-clear" onClick={() => win()?.clearAll()}>
          Clear all
        </GhostButton>
      </Row>
      <div data-testid="rx-status" style="font-family: monospace; padding: 8px;">
        status: <Accent theme={themeSignal()}>{() => status()}</Accent>
      </div>
    </Section>
  )
}
