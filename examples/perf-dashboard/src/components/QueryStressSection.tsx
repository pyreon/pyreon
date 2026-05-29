/**
 * Query stress section — exercises @pyreon/query hot paths under load.
 *
 * Five journey shapes, each driven from `journeys.ts` via `page.evaluate`:
 *   - mount      — N components each calling useQuery once (mount-N baseline)
 *   - notify     — N components subscribing to the SAME key, then K cache
 *                  updates → fan-out is N × K observerNotify calls
 *   - reactive   — N components reading a shared reactive key signal,
 *                  then K signal flips → re-runs setOptions effect N × K
 *   - invalidate — N queries cached + 1 mutation with 5 invalidates,
 *                  fire K mutations → K × 5 invalidate counter
 *   - scan       — N queries cached + 1 useIsFetching, then K cache events
 *                  (each triggers the cache walk → K isFetchingScan)
 *
 * Mirrors FormStressSection's `<For>`-keyed-by-scale-tuple pattern: each
 * mode/count combo forces an unmount+mount cycle so `query.useQuery`
 * emits land in the journey's snapshot window cleanly.
 */
import type { VNodeChild } from '@pyreon/core'
import { For, h, Show } from '@pyreon/core'
import {
  QueryClient,
  QueryClientProvider,
  useIsFetching,
  useMutation,
  useQuery,
} from '@pyreon/query'
import type { Signal } from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import { Accent, GhostButton, Row, Section, SectionTitle } from './atoms'
import { themeSignal } from '../App'

// ── Tracking ─────────────────────────────────────────────────────────────

type StressMode = 'idle' | 'mount' | 'notify' | 'reactive' | 'invalidate' | 'scan'

const activeReactiveKey = { current: null as Signal<number> | null }

// Mode + count drive the For key. A mode change OR count change forces an
// unmount+mount of QueryAtScale. The reactive-key flip signal is separate
// so flipping it doesn't tear down the children.
export const queryStressMode = signal<StressMode>('idle')
export const queryStressCount = signal<number>(0)

// Reactive-key journey was deferred from this PR — see the README in
// `perf-results/` and the journey-section comment in `journeys.ts`. The
// `query.setOptions` counter is still exercised by `queryMount-1000`
// (one setOptions per useQuery call, fires N=1000 at mount).

const status = signal<string>('idle')

// ── Per-mode QueryClient ─────────────────────────────────────────────────
//
// One client per mounted QueryAtScale instance. Held in a module-level box
// so the imperative driver functions (notifyDrive / invalidateDrive /
// scanDrive) can reach into the mounted client without prop-drilling
// through Pyreon's render frame. Cleared by clearAll().

const activeClient = { current: null as QueryClient | null }

// Active mutation + active fields from the most recent QueryAtScale mount,
// exposed via window for journey driver calls. Same pattern as form's
// __pyreon_perf_forms_active.
interface ActiveMutation {
  mutate: (vars: void) => void
}
const activeMutation = { current: null as ActiveMutation | null }

// ── QueryAtScale — the actual hook-running component ─────────────────────

function QueryAtScale(props: { mode: StressMode; count: number }) {
  // Allocate N useQuery calls based on the mode. useQuery uses
  // onUnmount() internally so each call MUST run inside a Pyreon setup
  // frame (this component body). Pyreon's EffectScope cleanup unsubscribes
  // every observer when QueryAtScale unmounts.
  if (props.mode === 'mount') {
    // Distinct keys — pure mount-N baseline.
    for (let i = 0; i < props.count; i++) {
      useQuery(() => ({
        queryKey: ['perf-mount', i],
        queryFn: () => Promise.resolve({ id: i }),
      }))
    }
  } else if (props.mode === 'notify') {
    // SAME key for all N — they all subscribe to the same QueryObserver
    // upstream. setQueryData on this key fires all N subscribe callbacks.
    for (let i = 0; i < props.count; i++) {
      useQuery(() => ({
        queryKey: ['perf-notify-shared'],
        queryFn: () => Promise.resolve({ id: 0 }),
      }))
    }
  } else if (props.mode === 'reactive') {
    // N queries reading a shared reactive `reactKey` signal in their queryKey.
    // External flips of reactKey should re-run every useQuery's setOptions
    // effect → setOptions count grows by N per flip.
    const reactKey = signal<number>(0)
    activeReactiveKey.current = reactKey
    for (let i = 0; i < props.count; i++) {
      useQuery(() => ({
        queryKey: ['perf-reactive', reactKey(), i],
        queryFn: () => Promise.resolve({ id: i }),
      }))
    }
  } else if (props.mode === 'invalidate') {
    // 5 distinct keys distributed across N queries. The mutation will
    // invalidate all 5 keys per call → 5 cache-walk hits per mutation.
    for (let i = 0; i < props.count; i++) {
      useQuery(() => ({
        queryKey: ['perf-invalidate', i % 5],
        queryFn: () => Promise.resolve({ id: i }),
      }))
    }
    const m = useMutation({
      mutationFn: () => Promise.resolve({ ok: true }),
      invalidates: [
        ['perf-invalidate', 0],
        ['perf-invalidate', 1],
        ['perf-invalidate', 2],
        ['perf-invalidate', 3],
        ['perf-invalidate', 4],
      ],
    })
    activeMutation.current = { mutate: m.mutate }
  } else if (props.mode === 'scan') {
    // N queries + 1 useIsFetching. The journey then triggers K cache
    // events to drive `query.isFetchingScan` × K.
    for (let i = 0; i < props.count; i++) {
      useQuery(() => ({
        queryKey: ['perf-scan', i],
        queryFn: () => Promise.resolve({ id: i }),
      }))
    }
    useIsFetching()
  }

  return (
    <div data-testid="query-stress-ready" data-mode={props.mode} data-count={String(props.count)}>
      Mounted {props.count} queries (mode={props.mode})
    </div>
  )
}

// ── Driver implementations ───────────────────────────────────────────────
//
// Imperative actions on the mounted QueryClient. Called from window
// helpers AFTER QueryAtScale is mounted (so the cache + observers are
// already in place).

function reactiveFlip(flips: number): void {
  const sig = activeReactiveKey.current
  if (!sig) return
  // Tight-loop external writes — each .set propagates to every useQuery's
  // setOptions effect (N per flip → N × K total). The For-effect untrack
  // fix (mountFor / mountKeyedList runUntracked the render work) is what
  // makes this work end-to-end; before the fix, the For effect tracked
  // every signal read during child setup, re-ran on the first flip,
  // disposed all inner setOptions effects, then handleIncrementalUpdate
  // saw unchanged keys and skipped re-mount → 0 setOptions runs across
  // K flips. Reference: PR #490 deferred journey + the regression test
  // at packages/core/runtime-dom/src/tests/fanout-repro.test.tsx.
  for (let i = 1; i <= flips; i++) {
    sig.set(i)
  }
}

function notifyDrive(events: number): void {
  const client = activeClient.current
  if (!client) return
  // setQueryData fires the QueryCache subscribe channel → all observers
  // for this key invoke their subscribe callbacks → each emits one
  // `query.observerNotify`. With N subscribers and K events, total is N × K.
  for (let i = 0; i < events; i++) {
    client.setQueryData(['perf-notify-shared'], { id: i })
  }
}

function invalidateDrive(mutations: number): void {
  const m = activeMutation.current
  if (!m) return
  // Each mutate() resolves immediately (Promise.resolve), then onSuccess
  // fires the `invalidates` array — 5 entries → 5 invalidate emissions
  // per mutation.
  for (let i = 0; i < mutations; i++) {
    m.mutate()
  }
}

function scanDrive(events: number): void {
  const client = activeClient.current
  if (!client) return
  // setQueryData triggers a queryCache.subscribe event → useIsFetching's
  // listener runs → `client.isFetching(filters)` walks the entire cache.
  // Distribute writes across the cached keys so the cache size scaling
  // is real.
  for (let i = 0; i < events; i++) {
    client.setQueryData(['perf-scan', i % 100], { id: i })
  }
}

// ── Window helper API ────────────────────────────────────────────────────

interface PerfQueryWindow {
  __pyreon_perf_query?: {
    /** Mount N queries with distinct keys. */
    setMount: (n: number) => void
    /** Mount N queries on the SAME key (notify fan-out scenario). */
    setNotify: (n: number) => void
    /** Mount N queries reading a shared reactive key signal. */
    setReactive: (n: number) => void
    /** Drive: K reactive-key flips (each fires N setOptions effects). */
    reactiveFlip: (flips: number) => void
    /** Mount N queries + 1 mutation with 5 invalidates. */
    setInvalidate: (n: number) => void
    /** Mount N queries + useIsFetching (scan scenario). */
    setScan: (n: number) => void
    /** Drive: K cache updates on the shared notify key. */
    notifyDrive: (events: number) => void
    /** Drive: K mutations (each invalidates 5 keys). */
    invalidateDrive: (mutations: number) => void
    /** Drive: K cache events (drives the useIsFetching scan). */
    scanDrive: (events: number) => void
    /** Unmount everything. */
    clearAll: () => void
    status: () => string
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as PerfQueryWindow).__pyreon_perf_query = {
    setMount(n) {
      queryStressMode.set('mount')
      queryStressCount.set(n)
      status.set(`mount n=${n}`)
    },
    setNotify(n) {
      queryStressMode.set('notify')
      queryStressCount.set(n)
      status.set(`notify n=${n}`)
    },
    setReactive(n) {
      queryStressMode.set('reactive')
      queryStressCount.set(n)
      status.set(`reactive n=${n}`)
    },
    reactiveFlip(flips) {
      reactiveFlip(flips)
      status.set(`reactive flips=${flips}`)
    },
    setInvalidate(n) {
      queryStressMode.set('invalidate')
      queryStressCount.set(n)
      status.set(`invalidate n=${n}`)
    },
    setScan(n) {
      queryStressMode.set('scan')
      queryStressCount.set(n)
      status.set(`scan n=${n}`)
    },
    notifyDrive(events) {
      notifyDrive(events)
      status.set(`notify drive events=${events}`)
    },
    invalidateDrive(mutations) {
      invalidateDrive(mutations)
      status.set(`invalidate mutations=${mutations}`)
    },
    scanDrive(events) {
      scanDrive(events)
      status.set(`scan events=${events}`)
    },
    clearAll() {
      queryStressMode.set('idle')
      queryStressCount.set(0)
      activeClient.current = null
      activeMutation.current = null
      status.set('cleared')
    },
    status() {
      return status.peek()
    },
  }
}

// ── Outer section ────────────────────────────────────────────────────────
//
// Renders QueryClientProvider + (when mode !== 'idle') a For-keyed
// QueryAtScale. The For key is `${mode}|${count}` so any change forces a
// fresh mount cycle — clean per-journey counter snapshots.

function MountedQueryClient(props: { children: () => VNodeChild }): VNodeChild {
  // Allocate a fresh client per For iteration — captures it into the
  // module-level box so imperative drivers can reach it.
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, retry: false } },
  })
  activeClient.current = client
  return h(QueryClientProvider, { client }, props.children())
}

export function QueryStressSection() {
  return (
    <Section theme={themeSignal()}>
      <SectionTitle theme={themeSignal()}>@pyreon/query — stress harness</SectionTitle>

      <Show when={() => queryStressMode() !== 'idle' && queryStressCount() > 0}>
        <For each={() => [`${queryStressMode()}|${queryStressCount()}`]} by={(k: string) => k}>
          {() => (
            <MountedQueryClient>
              {() => <QueryAtScale mode={queryStressMode()} count={queryStressCount()} />}
            </MountedQueryClient>
          )}
        </For>
      </Show>

      <Row>
        <GhostButton
          theme={themeSignal()}
          data-testid="query-mount-1k"
          onClick={() => {
            const w = (window as unknown as PerfQueryWindow).__pyreon_perf_query
            w?.clearAll()
            w?.setMount(1000)
          }}
        >
          mount 1k
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="query-notify-10k"
          onClick={() => {
            const w = (window as unknown as PerfQueryWindow).__pyreon_perf_query
            w?.clearAll()
            w?.setNotify(10)
            queueMicrotask(() => w?.notifyDrive(1000))
          }}
        >
          notify 10×1k
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="query-invalidate-1k"
          onClick={() => {
            const w = (window as unknown as PerfQueryWindow).__pyreon_perf_query
            w?.clearAll()
            w?.setInvalidate(100)
            queueMicrotask(() => w?.invalidateDrive(1000))
          }}
        >
          invalidate 1k×5
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="query-scan-10k"
          onClick={() => {
            const w = (window as unknown as PerfQueryWindow).__pyreon_perf_query
            w?.clearAll()
            w?.setScan(100)
            queueMicrotask(() => w?.scanDrive(10000))
          }}
        >
          scan 100×10k
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="query-clear"
          onClick={() => {
            const w = (window as unknown as PerfQueryWindow).__pyreon_perf_query
            w?.clearAll()
          }}
        >
          Clear
        </GhostButton>
      </Row>

      <div data-testid="query-status" style="font-family: monospace; padding: 8px;">
        status: <Accent theme={themeSignal()}>{() => status()}</Accent>
      </div>
    </Section>
  )
}
