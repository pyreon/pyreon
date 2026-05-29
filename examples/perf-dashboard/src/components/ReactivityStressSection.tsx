/**
 * Reactivity stress section — exercises @pyreon/reactivity primitives in
 * isolation under load. Companion to the app-shaped journeys (form, query,
 * rx, store) which fold reactivity cost into a broader cascade and can't
 * surface per-primitive regressions.
 *
 * Same window-helper pattern as `RxStressSection` / `StoreStressSection`:
 * journeys drive via `window.__pyreon_perf_reactivity` so Playwright's
 * `.click()` cost doesn't contaminate counters.
 *
 * Counter signature per journey (each isolates ONE counter dimension):
 *
 *   signalCreate-100k     → signalCreate: 100_000, others ~0
 *                           pure allocation cost, no subscribers
 *   signalWrite-100k      → signalWrite: 100_000, signalCreate: 1
 *                           write-path overhead, no subscribers (post-Object.is)
 *   effectFanout-1k       → effectRun: 1000 initial + N×1000 cascade
 *                           subscriber fanout cost per write
 *   computedDiamond-1k    → computedRecompute: 2000, effectRun: 2
 *                           diamond dedup + two-tier flush ordering
 *   scopeDispose-10k      → effectRun: 10_000 initial, 0 after dispose
 *                           scope teardown completeness (leaked effects = cascade)
 */
import {
  computed,
  effect,
  effectScope,
  signal,
  type Computed,
  type Signal,
} from '@pyreon/reactivity'
import { Accent, GhostButton, Row, Section, SectionTitle } from './atoms'
import { themeSignal } from '../App'

// ── Tracking ─────────────────────────────────────────────────────────────

interface Artifact {
  dispose?: () => void
}

const _artifacts: Artifact[] = []
// Keep allocated signals reachable so a journey's allocation cost is
// measured against actual heap — not optimised-away by V8 escape analysis.
const _retained: Signal<unknown>[] = []
const status = signal<string>('idle')

function clearAll(): void {
  for (const a of _artifacts) a.dispose?.()
  _artifacts.length = 0
  _retained.length = 0
}

// ── Journey API exposed on window ────────────────────────────────────────

interface PerfReactivityWindow {
  __pyreon_perf_reactivity?: {
    /** Allocate N fresh signals — pure allocation cost, no subscribers. */
    signalCreate: (n: number) => void
    /** 1 signal, N writes with unique values (bypass Object.is short-circuit). */
    signalWrite: (n: number) => void
    /** 1 signal, K subscribers, N writes. effectRun = K + K×N. */
    effectFanout: (subscribers: number, writes: number) => void
    /** 1 source → K computeds → 1 effect reading all. 1 write triggers diamond. */
    computedDiamond: (k: number) => void
    /** K effects under 1 scope, dispose scope, then 1 write — should fire 0 cascades. */
    scopeDispose: (k: number) => void
    /** Drop all artifacts so the next journey runs against a clean slate. */
    clearAll: () => void
    status: () => string
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as PerfReactivityWindow).__pyreon_perf_reactivity = {
    signalCreate(n: number) {
      clearAll()
      // Allocate fresh signals, retain them so the optimiser can't elide.
      for (let i = 0; i < n; i++) _retained.push(signal(i) as Signal<unknown>)
      status.set(`signalCreate n=${n}`)
    },

    signalWrite(n: number) {
      clearAll()
      const sig = signal(0)
      _retained.push(sig as Signal<unknown>)
      // Unique values per write — avoids `Object.is` short-circuit that
      // would zero the `signalWrite` counter on runs 2..N if the value
      // happened to match the prior state. Math.random() would also work
      // but `i` is deterministic across runs.
      for (let i = 1; i <= n; i++) sig.set(i)
      status.set(`signalWrite n=${n}`)
    },

    effectFanout(subscribers: number, writes: number) {
      clearAll()
      const sig = signal(0)
      _retained.push(sig as Signal<unknown>)
      // Use an EffectScope to batch-dispose the subscribers cleanly when
      // the next journey calls clearAll(). The scope.stop() path is
      // exercised in scopeDispose-10k separately.
      const scope = effectScope()
      _artifacts.push({ dispose: () => scope.stop() })
      let sink = 0
      scope.runInScope(() => {
        for (let i = 0; i < subscribers; i++) {
          // Read the signal so the effect tracks it. The `sink` write is
          // a real side-effect so V8 can't elide the effect body.
          effect(() => {
            sink = sink + sig()
          })
        }
      })
      // Drive `writes` cascades. Each write fires `subscribers` effects.
      for (let i = 1; i <= writes; i++)
        sig.set(i)
        // Force `sink` to escape — prevents dead-code elimination of the
        // entire effect body if V8 proves `sink` is never read.
      ;(globalThis as { __pyreon_perf_sink__?: number }).__pyreon_perf_sink__ = sink
      status.set(`effectFanout subs=${subscribers} writes=${writes}`)
    },

    computedDiamond(k: number) {
      clearAll()
      const source = signal(0)
      _retained.push(source as Signal<unknown>)
      // K computeds each read `source` — diamond fan-in at the consumer
      // effect. With proper dedup, ONE source write should trigger K
      // computed recomputes + ONE effect re-run (not K).
      const computeds: Computed<number>[] = []
      for (let i = 0; i < k; i++) {
        const c = computed(() => source() + i)
        computeds.push(c)
      }
      // The reading effect aggregates all K computeds. Without dedup,
      // a naive impl could schedule the effect K times per write.
      const scope = effectScope()
      _artifacts.push({ dispose: () => scope.stop() })
      let sink = 0
      scope.runInScope(() => {
        effect(() => {
          let sum = 0
          for (const c of computeds) sum += c()
          sink = sum
        })
      })
      // Single write — diamond cascade.
      source.set(1)
      ;(globalThis as { __pyreon_perf_sink__?: number }).__pyreon_perf_sink__ = sink
      status.set(`computedDiamond k=${k}`)
    },

    scopeDispose(k: number) {
      clearAll()
      const sig = signal(0)
      _retained.push(sig as Signal<unknown>)
      const scope = effectScope()
      let sink = 0
      scope.runInScope(() => {
        for (let i = 0; i < k; i++) {
          effect(() => {
            sink = sink + sig()
          })
        }
      })
      // Critical part of this journey: stop() must dispose ALL k effects.
      // If any leak, the post-dispose write fires cascades and effectRun
      // climbs above k. Counter signature post-fix: exactly k.
      scope.stop()
      sig.set(1)
      ;(globalThis as { __pyreon_perf_sink__?: number }).__pyreon_perf_sink__ = sink
      status.set(`scopeDispose k=${k}`)
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

export function ReactivityStressSection() {
  const win = (): PerfReactivityWindow['__pyreon_perf_reactivity'] =>
    (window as unknown as PerfReactivityWindow).__pyreon_perf_reactivity

  return (
    <Section theme={themeSignal()}>
      <SectionTitle theme={themeSignal()}>@pyreon/reactivity — isolated stress</SectionTitle>
      <Row>
        <GhostButton
          theme={themeSignal()}
          data-testid="reactivity-signal-create"
          onClick={() => win()?.signalCreate(100_000)}
        >
          signalCreate (100k)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="reactivity-signal-write"
          onClick={() => win()?.signalWrite(100_000)}
        >
          signalWrite (100k)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="reactivity-effect-fanout"
          onClick={() => win()?.effectFanout(1000, 10)}
        >
          effectFanout (1k × 10)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="reactivity-computed-diamond"
          onClick={() => win()?.computedDiamond(1000)}
        >
          computedDiamond (1k)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="reactivity-scope-dispose"
          onClick={() => win()?.scopeDispose(10_000)}
        >
          scopeDispose (10k)
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="reactivity-clear"
          onClick={() => win()?.clearAll()}
        >
          Clear all
        </GhostButton>
      </Row>
      <div data-testid="reactivity-status" style="font-family: monospace; padding: 8px;">
        status: <Accent theme={themeSignal()}>{() => status()}</Accent>
      </div>
    </Section>
  )
}
