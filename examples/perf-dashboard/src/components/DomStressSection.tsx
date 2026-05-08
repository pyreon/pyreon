/**
 * DOM rendering stress section — exercises @pyreon/runtime-dom hot paths.
 *
 * Five journey shapes, each driven from `journeys.ts` via `page.evaluate`:
 *   - mount    — N elements with mixed props (class, style, data-*, reactive
 *                text). Counter signature: mountChild ≈ N+, applyProp linear
 *                in N×K (K props per element), bindText / bindDirect propor-
 *                tional to reactive expressions.
 *   - shuffle  — N items keyed by id, then ONE arr.reverse() set on the
 *                items signal. Worst-case LIS — full reversal degenerates LIS
 *                length to 1 → ~N×log2(N) probes. Pure mountFor.lisOps probe.
 *   - append   — start at 0, then push K batches of M items monotonically.
 *                Three-tier fast path's "extend" tier; lisOps must stay 0.
 *   - toggle   — N <Show when={signal}> items, toggleDrive(K) flips all
 *                signals true→false→true→false (2K total transitions ×
 *                directions). Counter signature: mountReactive ≈ N at mount,
 *                cleanup proportional to off-cycles.
 *   - events   — N buttons each with onClick. Counter signature: applyEvent
 *                ≈ N (subset of applyProp ≈ N + class + data-id).
 *
 * Mirrors QueryStressSection's `<For>`-keyed-by-mode-count pattern: every
 * setMode call forces unmount+mount of DomAtScale so each journey's snapshot
 * window starts clean.
 */
import { For, h, Show } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import { themeSignal } from '../App'
import { GhostButton, Row, Section, SectionTitle } from './atoms'

// ── Tracking ─────────────────────────────────────────────────────────────

type DomStressMode = 'idle' | 'mount' | 'shuffle' | 'append' | 'toggle' | 'events'

interface ShuffleItem {
  id: number
  label: string
}

// Mode + count drive the For key. A mode change OR count change forces an
// unmount+mount of DomAtScale. The shuffle/append items + toggle flags signals
// are separate so flipping them doesn't tear down the children.
export const domStressMode = signal<DomStressMode>('idle')
export const domStressCount = signal<number>(0)

// Module-level boxes for the imperative driver functions to reach into the
// mounted DomAtScale's allocation signals without prop-drilling through
// Pyreon's render frame. Cleared by clearAll().
const activeShuffleItems = { current: null as Signal<ShuffleItem[]> | null }
const activeAppendItems = { current: null as Signal<ShuffleItem[]> | null }
const activeToggleFlags = { current: null as Signal<boolean>[] | null }

const status = signal<string>('idle')

// ── DomAtScale — the actual hook-running component ───────────────────────

function DomAtScale(props: { mode: DomStressMode; count: number }) {
  if (props.mode === 'mount') {
    // N elements with mixed props (class, style, data-*, reactive text)
    // — exercises mountChild + applyProp + bindText proportionally.
    const items = Array.from({ length: props.count }, (_, i) => i)
    return (
      <div data-testid="dom-stress-ready" data-mode="mount" data-count={String(props.count)}>
        <For each={items} by={(i: number) => i}>
          {(i: number) => {
            const value = signal(i)
            return (
              <div
                class={`dom-mount-row dom-row-${i % 10}`}
                data-id={i}
                data-value={String(i)}
                style={`opacity: 1; padding: 2px;`}
              >
                Item {() => value()}
              </div>
            )
          }}
        </For>
      </div>
    )
  }

  if (props.mode === 'shuffle') {
    // N items keyed by id; driver flips items.set([...].reverse()).
    // Pure mountFor.lisOps probe.
    const items = signal<ShuffleItem[]>(
      Array.from({ length: props.count }, (_, i) => ({
        id: i,
        label: `Item ${i}`,
      })),
    )
    activeShuffleItems.current = items
    return (
      <div data-testid="dom-stress-ready" data-mode="shuffle" data-count={String(props.count)}>
        <For each={() => items()} by={(item: ShuffleItem) => item.id}>
          {(item: ShuffleItem) => <div data-id={String(item.id)}>{item.label}</div>}
        </For>
      </div>
    )
  }

  if (props.mode === 'append') {
    // Start at 0; driver pushes K batches monotonically.
    // Three-tier fast path "extend" tier.
    // The leading `<span>append</span>` gives the wrapper non-zero height
    // so Playwright's `waitForSelector` (visible-by-default) resolves —
    // append starts with an empty <For> and the empty div has zero size.
    const items = signal<ShuffleItem[]>([])
    activeAppendItems.current = items
    return (
      <div data-testid="dom-stress-ready" data-mode="append" data-count={String(props.count)}>
        <span>append</span>
        <For each={() => items()} by={(item: ShuffleItem) => item.id}>
          {(item: ShuffleItem) => <div data-id={String(item.id)}>{item.label}</div>}
        </For>
      </div>
    )
  }

  if (props.mode === 'toggle') {
    // N <Show> items keyed by index. Each item's visibility is driven
    // by its own signal so toggleDrive can flip all in batch.
    const flags = Array.from({ length: props.count }, () => signal<boolean>(true))
    activeToggleFlags.current = flags
    const indices = Array.from({ length: props.count }, (_, i) => i)
    return (
      <div data-testid="dom-stress-ready" data-mode="toggle" data-count={String(props.count)}>
        <For each={indices} by={(i: number) => i}>
          {(i: number) => (
            <Show when={() => (flags[i] as Signal<boolean>)()}>
              {() => <div data-id={String(i)}>Visible {i}</div>}
            </Show>
          )}
        </For>
      </div>
    )
  }

  if (props.mode === 'events') {
    // N buttons with onClick. applyEvent ≈ N, subset of applyProp.
    const indices = Array.from({ length: props.count }, (_, i) => i)
    return (
      <div data-testid="dom-stress-ready" data-mode="events" data-count={String(props.count)}>
        <For each={indices} by={(i: number) => i}>
          {(i: number) => (
            <button
              class="dom-event-btn"
              data-id={String(i)}
              onClick={() => {
                status.set(`click ${i}`)
              }}
            >
              Click {i}
            </button>
          )}
        </For>
      </div>
    )
  }

  return <div data-testid="dom-stress-ready" data-mode="idle" data-count="0" />
}

// ── Driver implementations ───────────────────────────────────────────────

function shuffleDrive(): void {
  const items = activeShuffleItems.current
  if (!items) return
  // ONE reversal — degenerates LIS to length 1 (worst case for n=1000).
  items.set([...items()].reverse())
}

function appendDrive(batches: number, perBatch: number): void {
  const items = activeAppendItems.current
  if (!items) return
  for (let b = 0; b < batches; b++) {
    const current = items()
    const start = current.length
    const next = current.slice()
    for (let i = 0; i < perBatch; i++) {
      const id = start + i
      next.push({ id, label: `Item ${id}` })
    }
    items.set(next)
  }
}

function toggleDrive(cycles: number): void {
  const flags = activeToggleFlags.current
  if (!flags) return
  // Each cycle: flip all to false, then back to true. K cycles → 2K
  // direction changes per item, so ~2K × N mountReactive transitions
  // and ~K × N cleanup invocations.
  for (let c = 0; c < cycles; c++) {
    for (const f of flags) f.set(false)
    for (const f of flags) f.set(true)
  }
}

function clearAll(): void {
  domStressMode.set('idle')
  domStressCount.set(0)
  activeShuffleItems.current = null
  activeAppendItems.current = null
  activeToggleFlags.current = null
  status.set('idle')
}

// ── Window helper API ────────────────────────────────────────────────────

interface PerfDomWindow {
  __pyreon_perf_dom?: {
    setMount: (n: number) => void
    setShuffle: (n: number) => void
    setAppend: (start: number) => void
    setToggle: (n: number) => void
    setEvents: (n: number) => void
    shuffleDrive: () => void
    appendDrive: (batches: number, perBatch: number) => void
    toggleDrive: (cycles: number) => void
    clearAll: () => void
    status: () => string
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as PerfDomWindow).__pyreon_perf_dom = {
    setMount(n) {
      domStressMode.set('mount')
      domStressCount.set(n)
      status.set(`mount n=${n}`)
    },
    setShuffle(n) {
      domStressMode.set('shuffle')
      domStressCount.set(n)
      status.set(`shuffle n=${n}`)
    },
    setAppend(_start) {
      // start is unused — append always begins at 0; the driver pushes batches.
      domStressMode.set('append')
      domStressCount.set(0)
      status.set(`append start=0`)
    },
    setToggle(n) {
      domStressMode.set('toggle')
      domStressCount.set(n)
      status.set(`toggle n=${n}`)
    },
    setEvents(n) {
      domStressMode.set('events')
      domStressCount.set(n)
      status.set(`events n=${n}`)
    },
    shuffleDrive() {
      shuffleDrive()
      status.set(`shuffle drove`)
    },
    appendDrive(batches, perBatch) {
      appendDrive(batches, perBatch)
      status.set(`append ${batches}×${perBatch}`)
    },
    toggleDrive(cycles) {
      toggleDrive(cycles)
      status.set(`toggle ${cycles}×`)
    },
    clearAll,
    status: () => status(),
  }
}

// ── Section UI ───────────────────────────────────────────────────────────
//
// For-keyed remount: changing mode|count tears down the previous DomAtScale
// and mounts a fresh one. Drive functions reach into the new mount via
// module-level boxes (mirrors QueryStressSection's pattern).

export function DomStressSection() {
  return (
    <Section theme={themeSignal()}>
      <SectionTitle theme={themeSignal()}>@pyreon/runtime-dom — stress harness</SectionTitle>

      <Show when={() => domStressMode() !== 'idle'}>
        <For each={() => [`${domStressMode()}|${domStressCount()}`]} by={(k: string) => k}>
          {() => <DomAtScale mode={domStressMode()} count={domStressCount()} />}
        </For>
      </Show>

      <Row>
        <GhostButton
          theme={themeSignal()}
          data-testid="dom-stress-mount"
          onClick={() => {
            const w = (window as unknown as PerfDomWindow).__pyreon_perf_dom
            w?.clearAll()
            w?.setMount(1000)
          }}
        >
          mount 1k
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="dom-stress-shuffle"
          onClick={() => {
            const w = (window as unknown as PerfDomWindow).__pyreon_perf_dom
            w?.clearAll()
            w?.setShuffle(1000)
            queueMicrotask(() => w?.shuffleDrive())
          }}
        >
          shuffle 1k
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="dom-stress-append"
          onClick={() => {
            const w = (window as unknown as PerfDomWindow).__pyreon_perf_dom
            w?.clearAll()
            w?.setAppend(0)
            queueMicrotask(() => w?.appendDrive(10, 1000))
          }}
        >
          append 10×1k
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="dom-stress-toggle"
          onClick={() => {
            const w = (window as unknown as PerfDomWindow).__pyreon_perf_dom
            w?.clearAll()
            w?.setToggle(1000)
            queueMicrotask(() => w?.toggleDrive(2))
          }}
        >
          toggle 1k×2
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="dom-stress-events"
          onClick={() => {
            const w = (window as unknown as PerfDomWindow).__pyreon_perf_dom
            w?.clearAll()
            w?.setEvents(1000)
          }}
        >
          events 1k
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="dom-stress-clear"
          onClick={() => (window as unknown as PerfDomWindow).__pyreon_perf_dom?.clearAll()}
        >
          clear
        </GhostButton>
      </Row>
    </Section>
  )
}
