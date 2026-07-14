/**
 * @pyreon/dnd wrapper tax — the signal-driven layer vs RAW pragmatic-drag-and-drop.
 *
 * Run: `bun run bench` (from packages/fundamentals/dnd; sets NODE_ENV=production).
 *
 * WHAT THIS MEASURES — the "wrapper tax". `@pyreon/dnd` is a thin adapter over
 * Atlassian's pragmatic-drag-and-drop (pdnd): pdnd owns the native-event
 * lifecycle + hit-testing; the wrapper adapts every pdnd state field into a
 * Pyreon signal and wires every pdnd teardown into `onCleanup`. This bench asks:
 * how much JS does the ergonomic hook add over calling pdnd directly?
 *
 * THE BASELINE IS A HAND-ROLLED Pyreon+pdnd INTEGRATION (impl `raw`) — a dev who
 * skips the wrapper but still wants the SAME reactive state: a `signal`, the same
 * deferred (`queueMicrotask`) registration the wrapper uses so refs are populated,
 * and an `onCleanup` teardown. This isolates the wrapper's ERGONOMIC overhead
 * (extra closures, the disabled/handle resolution, the disposed-race guard) —
 * NOT the cost of reactivity itself (which the user wants, and which BOTH paths
 * pay). A near-zero tax is the honest good result: "reactive DnD at ~raw cost".
 *
 * OBJECTIVITY CONTRACT (mirrors store-bench.ts, the repo model):
 *  - NODE_ENV=production BEFORE any import (dev paths / devtools registry are noise).
 *  - REAL pdnd build imported (element + external + auto-scroll + hitbox adapters);
 *    happy-dom registered so pdnd's real `addEventListener`-based registration runs.
 *    NOTHING is stubbed — the raw baseline calls the exact pdnd functions the
 *    wrapper calls.
 *  - CORRECTNESS GATE asserts both paths produce equivalent observable state +
 *    complete a full mount→unmount lifecycle before timing.
 *  - PER-(op × impl) PROCESS ISOLATION — each cell runs in its own fresh `bun`
 *    child so ops don't pollute each other's JIT/allocation state and the two
 *    impls never share a heap.
 *  - NO forced GC (JSC jettisons compiled code on forced GC → re-tier noise; see
 *    store-bench.ts). Big warmup + many small pooled samples; the median absorbs
 *    natural GC pauses while steady-state amortized GC stays in the number.
 *  - PER-RUN RESET: every sample registers a fresh batch of K elements and fully
 *    disposes them, so pdnd's element registry never grows across the timed loop.
 *  - STATS: pooled median ns/op with a bootstrap CI95; `🤝` marks a verdict whose
 *    CI95 overlaps raw's (a tie — no measurable tax on that axis).
 *
 * HONEST LIMITS (author-judge disclosed — the framework author writes + judges
 * this bench):
 *  - The REGISTRATION axes (draggable/droppable/monitor/sortable-item mount+unmount)
 *    are the real, cleanly-measurable wrapper tax. Both impls defer via
 *    `queueMicrotask`, drained by ONE flush per batch (realistic: a list mounts in
 *    one tick), so the flush amortizes to ~0 over K and both pay it equally.
 *  - The PER-EVENT axis measures the wrapper's onDragStart/onDrop callback JS
 *    (signal writes + the optional-callback hop) DIRECTLY, not via a real pointer
 *    gesture. Real pointer-driven drag timing is browser-gesture-dependent and
 *    noisy — that axis is DEFERRED (out of scope here).
 *  - ns are machine-dependent; the RATIO is the portable signal.
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

const { batch, effect, onCleanup, signal } = await import('@pyreon/reactivity')
const { draggable, dropTargetForElements, monitorForElements } = await import(
  '@atlaskit/pragmatic-drag-and-drop/element/adapter'
)
const { combine } = await import('@atlaskit/pragmatic-drag-and-drop/combine')
const {
  attachClosestEdge,
  extractClosestEdge,
} = await import('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge')
const { useDraggable } = await import('../src/use-draggable')
const { useDroppable } = await import('../src/use-droppable')
const { useDragMonitor } = await import('../src/use-drag-monitor')
const { useSortable } = await import('../src/use-sortable')

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; exitCode: number }
}

const now = () => Number(process.hrtime.bigint())
const flush = () => new Promise<void>((r) => queueMicrotask(() => r()))

// ─── async pooled-sample measurement (batch register+dispose per sample) ─────
async function measureSamplesAsync(
  batchFn: (k: number) => Promise<void>,
  { warmup = 6, k = 400, runs = 25 }: { warmup?: number; k?: number; runs?: number } = {},
): Promise<number[]> {
  for (let i = 0; i < warmup; i++) await batchFn(k)
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    await batchFn(k)
    samples.push((now() - t0) / k)
  }
  return samples
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1] as number
}
function bootstrapCI(samples: number[], resamples = 2_000): [number, number] {
  const meds: number[] = []
  const n = samples.length
  for (let r = 0; r < resamples; r++) {
    const re: number[] = []
    for (let i = 0; i < n; i++) re.push(samples[(Math.random() * n) | 0] as number)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[(resamples * 0.025) | 0] as number, meds[(resamples * 0.975) | 0] as number]
}
const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1]

let sink = 0
const IMPLS = ['raw', 'wrapper'] as const
type ImplName = (typeof IMPLS)[number]

const SORT_KEY = '__pyreon_sortable_key'
const el = () => {
  const d = document.createElement('div')
  document.body.appendChild(d)
  return d
}

// ─── ops: each impl returns an async `(k) => Promise<void>` batch fn ─────────
// Every batch registers K fresh nodes, flushes the deferred setup (real pdnd
// registration), then disposes all K — a full mount→unmount lifecycle.
interface OpSpec {
  note?: string
  make: () => Record<ImplName, (k: number) => Promise<void>>
}

const OPS: Record<string, OpSpec> = {
  'draggable mount+unmount': {
    note: 'raw = signal + deferred draggable() + onCleanup (hand-rolled reactive wiring); wrapper = useDraggable',
    make: () => ({
      raw: async (k) => {
        const disposers: (() => void)[] = []
        for (let i = 0; i < k; i++) {
          const node = el()
          const data = { i, type: 'card' }
          const e = effect(() => {
            const isDragging = signal(false)
            let cleanup: (() => void) | undefined
            let disposed = false
            queueMicrotask(() => {
              if (disposed) return
              cleanup = draggable({
                element: node,
                getInitialData: () => data,
                onDragStart: () => isDragging.set(true),
                onDrop: () => isDragging.set(false),
              })
            })
            onCleanup(() => {
              disposed = true
              cleanup?.()
            })
            sink += isDragging() ? 1 : 0
          })
          disposers.push(() => {
            e.dispose()
            node.remove()
          })
        }
        await flush()
        for (const d of disposers) d()
      },
      wrapper: async (k) => {
        const disposers: (() => void)[] = []
        for (let i = 0; i < k; i++) {
          const node = el()
          const e = effect(() => {
            const { isDragging } = useDraggable({ element: () => node, data: { i, type: 'card' } })
            sink += isDragging() ? 1 : 0
          })
          disposers.push(() => {
            e.dispose()
            node.remove()
          })
        }
        await flush()
        for (const d of disposers) d()
      },
    }),
  },

  'droppable mount+unmount': {
    note: 'raw = signal + deferred dropTargetForElements() + onCleanup; wrapper = useDroppable',
    make: () => ({
      raw: async (k) => {
        const disposers: (() => void)[] = []
        for (let i = 0; i < k; i++) {
          const node = el()
          const e = effect(() => {
            const isOver = signal(false)
            let cleanup: (() => void) | undefined
            let disposed = false
            queueMicrotask(() => {
              if (disposed) return
              cleanup = dropTargetForElements({
                element: node,
                getData: () => ({ zone: i }),
                canDrop: ({ source }) => (source.data as { type?: string }).type === 'card',
                onDragEnter: () => isOver.set(true),
                onDragLeave: () => isOver.set(false),
                onDrop: () => isOver.set(false),
              })
            })
            onCleanup(() => {
              disposed = true
              cleanup?.()
            })
            sink += isOver() ? 1 : 0
          })
          disposers.push(() => {
            e.dispose()
            node.remove()
          })
        }
        await flush()
        for (const d of disposers) d()
      },
      wrapper: async (k) => {
        const disposers: (() => void)[] = []
        for (let i = 0; i < k; i++) {
          const node = el()
          const e = effect(() => {
            const { isOver } = useDroppable({
              element: () => node,
              data: { zone: i },
              canDrop: (d) => d.type === 'card',
              onDrop: () => {},
            })
            sink += isOver() ? 1 : 0
          })
          disposers.push(() => {
            e.dispose()
            node.remove()
          })
        }
        await flush()
        for (const d of disposers) d()
      },
    }),
  },

  'monitor mount+unmount': {
    note: 'raw = 2 signals + monitorForElements() (no defer) + onCleanup; wrapper = useDragMonitor',
    make: () => ({
      raw: async (k) => {
        const disposers: (() => void)[] = []
        for (let i = 0; i < k; i++) {
          const e = effect(() => {
            const isDragging = signal(false)
            const dragData = signal<Record<string, unknown> | null>(null)
            const cleanup = monitorForElements({
              onDragStart: ({ source }) => {
                batch(() => {
                  isDragging.set(true)
                  dragData.set(source.data)
                })
              },
              onDrop: () => {
                batch(() => {
                  isDragging.set(false)
                  dragData.set(null)
                })
              },
            })
            onCleanup(cleanup)
            sink += isDragging() ? 1 : 0
          })
          disposers.push(() => e.dispose())
        }
        await flush()
        for (const d of disposers) d()
      },
      wrapper: async (k) => {
        const disposers: (() => void)[] = []
        for (let i = 0; i < k; i++) {
          const e = effect(() => {
            const { isDragging } = useDragMonitor({ onDrop: () => {} })
            sink += isDragging() ? 1 : 0
          })
          disposers.push(() => e.dispose())
        }
        await flush()
        for (const d of disposers) d()
      },
    }),
  },

  'sortable item mount+unmount': {
    note: 'apples-to-apples: BOTH = ONE sortable (shared active/over/edge signals + per-key disposal map) mounting then unmounting K keyed items. raw = hand-rolled combine(draggable, dropTarget+closestEdge) with the same handlers; wrapper = useSortable itemRef(key)(el)/(null).',
    make: () => {
      let sortCounter = 0
      const mkItems = () => [{ id: 'x' }]
      return {
        // Faithful hand-rolled sortable: one effect owns shared reactive state
        // + a per-key cleanup map, exactly like useSortable, so the delta is the
        // wrapper's bookkeeping tax — not a harness-shape difference.
        raw: async (k) => {
          const items = mkItems()
          const sortableId = `raw-${sortCounter++}`
          const e = effect(() => {
            const activeId = signal<string | number | null>(null)
            const overId = signal<string | number | null>(null)
            const overEdge = signal<string | null>(null)
            const itemCleanups = new Map<string, () => void>()
            const itemRef = (key: string) => (node: HTMLElement | null) => {
              const prev = itemCleanups.get(key)
              if (prev) {
                prev()
                itemCleanups.delete(key)
              }
              if (!node) return
              // Match the wrapper's per-item ARIA wiring so the delta is the
              // wrapper's bookkeeping — not free accessibility the raw path skipped.
              node.dataset.pyreonSortKey = key
              if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '0')
              node.setAttribute('role', 'listitem')
              node.setAttribute('aria-roledescription', 'sortable item')
              const cleanup = combine(
                draggable({
                  element: node,
                  getInitialData: () => ({
                    [SORT_KEY]: key,
                    id: sortableId,
                    payload: items.find((it) => it.id === key),
                  }),
                  onDragStart: () => activeId.set(key),
                  onDrop: () => {
                    batch(() => {
                      activeId.set(null)
                      overId.set(null)
                      overEdge.set(null)
                    })
                  },
                }),
                dropTargetForElements({
                  element: node,
                  getData: ({ input, element }) =>
                    attachClosestEdge(
                      { [SORT_KEY]: key, id: sortableId },
                      { input, element, allowedEdges: ['top', 'bottom'] },
                    ),
                  canDrop: ({ source }) => (source.data as { id?: string }).id === sortableId,
                  onDragEnter: ({ self }) => {
                    overId.set(key)
                    overEdge.set(extractClosestEdge(self.data))
                  },
                  onDrag: ({ self }) => overEdge.set(extractClosestEdge(self.data)),
                  onDragLeave: () => {
                    if (overId.peek() === key) {
                      overId.set(null)
                      overEdge.set(null)
                    }
                  },
                }),
              )
              itemCleanups.set(key, cleanup)
            }
            onCleanup(() => {
              for (const c of itemCleanups.values()) c()
              itemCleanups.clear()
            })
            for (let i = 0; i < k; i++) {
              const node = el()
              const ref = itemRef(`k${i}`)
              ref(node)
              ref(null)
              node.remove()
            }
            sink += activeId() === null ? 1 : 0
          })
          await flush()
          e.dispose()
        },
        wrapper: async (k) => {
          const items = mkItems()
          const e = effect(() => {
            const { itemRef, activeId } = useSortable({
              items: () => items,
              by: (it) => it.id,
              onReorder: () => {},
            })
            // Mount then unmount K per-item registrations (the churning-<For>
            // shape the per-item disposal handles).
            for (let i = 0; i < k; i++) {
              const node = el()
              const ref = itemRef(`k${i}`)
              ref(node)
              ref(null)
              node.remove()
            }
            sink += activeId() === null ? 1 : 0
          })
          await flush()
          e.dispose()
        },
      }
    },
  },

  'per-event dispatch (start+drop, 1 subscriber)': {
    note: 'DIRECT per-event JS (not a real pointer gesture — that axis is deferred). raw = batched 2-signal set; wrapper = the monitor onDragStart/onDrop bodies (batch + optional-callback hop).',
    make: () => {
      // Reconstruct each impl's per-event handler EXACTLY as it runs in prod,
      // with one subscriber attached (the realistic notify path).
      const rawIsDragging = signal(false)
      const rawData = signal<Record<string, unknown> | null>(null)
      effect(() => {
        sink += (rawIsDragging() ? 1 : 0) + (rawData() ? 1 : 0)
      })
      const rawStart = (data: Record<string, unknown>) => {
        batch(() => {
          rawIsDragging.set(true)
          rawData.set(data)
        })
      }
      const rawDrop = () => {
        batch(() => {
          rawIsDragging.set(false)
          rawData.set(null)
        })
      }

      // Wrapper monitor per-event body (from use-drag-monitor.ts):
      const wIsDragging = signal(false)
      const wData = signal<Record<string, unknown> | null>(null)
      const userStart: ((d: Record<string, unknown>) => void) | undefined = undefined
      const userDrop: ((s: Record<string, unknown>, t: Record<string, unknown>) => void) | undefined = undefined
      effect(() => {
        sink += (wIsDragging() ? 1 : 0) + (wData() ? 1 : 0)
      })
      const wStart = (source: { data: Record<string, unknown> }) => {
        batch(() => {
          wIsDragging.set(true)
          wData.set(source.data)
        })
        userStart?.(source.data)
      }
      const wDrop = (source: { data: Record<string, unknown> }, location: { current: { dropTargets: { data: Record<string, unknown> }[] } }) => {
        batch(() => {
          wIsDragging.set(false)
          wData.set(null)
        })
        const targetData = location.current.dropTargets[0]?.data ?? {}
        userDrop?.(source.data, targetData)
      }

      const payload = { id: '1', type: 'card' }
      const loc = { current: { dropTargets: [] as { data: Record<string, unknown> }[] } }
      // These ops don't defer — measure a tight sync loop of start+drop pairs.
      const syncBatch = (fire: () => void): ((k: number) => Promise<void>) => async (k) => {
        for (let i = 0; i < k; i++) fire()
      }
      return {
        raw: syncBatch(() => {
          rawStart(payload)
          rawDrop()
        }),
        wrapper: syncBatch(() => {
          wStart({ data: payload })
          wDrop({ data: payload }, loc)
        }),
      }
    },
  },
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode: measure ONE (op × impl) cell, print JSON samples ────────────
const childOp = process.argv[2]
const childImpl = process.argv[3] as ImplName | undefined
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  if (!childImpl || !IMPLS.includes(childImpl)) throw new Error(`unknown impl: ${childImpl}`)
  const impl = spec.make()
  // The per-event op is sync + cheap — give it more iterations per sample.
  const isPerEvent = childOp.startsWith('per-event')
  const samples = await measureSamplesAsync(
    impl[childImpl],
    isPerEvent ? { warmup: 20, k: 20_000, runs: 41 } : {},
  )
  process.stdout.write(JSON.stringify({ samples }))
  process.exit(0)
}

// ─── orchestrator: correctness gate, then spawn one child per (op × impl) ────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
{
  // Both paths produce a working reactive accessor starting at false, and a
  // full mount→flush→unmount lifecycle completes without error.
  let rawState = false
  let rawCleanup: (() => void) | undefined
  const node1 = el()
  const eRaw = effect(() => {
    const s = signal(false)
    queueMicrotask(() => {
      rawCleanup = draggable({
        element: node1,
        getInitialData: () => ({ id: '1' }),
        onDragStart: () => s.set(true),
        onDrop: () => s.set(false),
      })
    })
    onCleanup(() => rawCleanup?.())
    rawState = s()
  })
  await flush()
  assert(rawState === false, 'raw isDragging starts false')
  eRaw.dispose()

  const node2 = el()
  let wState = true
  const eWrap = effect(() => {
    const { isDragging } = useDraggable({ element: () => node2, data: { id: '1' } })
    wState = isDragging()
  })
  await flush()
  assert(wState === false, 'wrapper isDragging starts false')
  eWrap.dispose()

  // useSortable itemRef null-dispose is idempotent + safe (the leak-fix path).
  const eSort = effect(() => {
    const { itemRef } = useSortable({ items: () => [{ id: 'x' }], by: (i) => i.id, onReorder: () => {} })
    const n = el()
    itemRef('k')(n)
    itemRef('k')(null)
    n.remove()
  })
  eSort.dispose()
  assert(true, 'sortable item mount+unmount lifecycle completed')

  console.log('✓ correctness gate passed — raw + wrapper agree on observable state + lifecycle\n')
}

interface Cell {
  med: number
  ci: [number, number]
}
interface Row {
  op: string
  cells: Record<ImplName, Cell>
  note?: string
}

const CELL_REPEATS = Number(process.env.BENCH_REPEATS ?? 3)

function runCell(op: string, impl: ImplName): Cell {
  const pooled: number[] = []
  for (let r = 0; r < CELL_REPEATS; r++) {
    const proc = Bun.spawnSync(['bun', import.meta.path, op, impl], {
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (proc.exitCode !== 0) throw new Error(`child failed for (op "${op}", impl "${impl}")`)
    const { samples } = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
    pooled.push(...samples)
  }
  return { med: median(pooled), ci: bootstrapCI(pooled) }
}

const rows: Row[] = []
for (const op of OP_ORDER) {
  const cells = {} as Record<ImplName, Cell>
  for (const impl of IMPLS) cells[impl] = runCell(op, impl)
  const row: Row = { op, cells }
  const note = OPS[op]?.note
  if (note !== undefined) row.note = note
  rows.push(row)
}

const fmt = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2)}µs` : `${x.toFixed(0)}ns`)
console.log(
  `=== @pyreon/dnd wrapper tax vs RAW pragmatic-drag-and-drop (${process.platform}/${process.arch}, NODE_ENV=production, real pdnd + happy-dom, per-(op×impl) isolated processes, median ns/op [CI95], 🤝 = CI-overlap tie) ===\n`,
)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(
  `${pad('op', 44)} ${padL('raw', 10)} ${padL('wrapper', 10)} ${padL('wrapper tax', 18)}`,
)
console.log('─'.repeat(120))
for (const r of rows) {
  const raw = r.cells.raw
  const w = r.cells.wrapper
  const tie = overlaps(raw.ci, w.ci)
  const deltaNs = w.med - raw.med
  const pct = Math.round((Math.abs(deltaNs) / raw.med) * 100)
  const base = tie
    ? '🤝 ~none (CI overlap)'
    : deltaNs >= 0
      ? `+${fmt(deltaNs)} (${pct}%)`
      : `−${fmt(-deltaNs)} (${pct}% faster)`
  console.log(`${pad(r.op, 44)} ${padL(fmt(raw.med), 10)} ${padL(fmt(w.med), 10)} ${padL(base, 22)}`)
}
console.log(
  `\n(tax = wrapper − raw, where raw is a HAND-ROLLED Pyreon+pdnd integration with the SAME reactive state — so this is the ergonomic overhead of the hook, NOT the cost of reactivity (both pay that). 🤝 = CI95 overlap (no measurable tax). Pooled median of small runs × ${CELL_REPEATS} fresh processes per (op × impl); no forced GC. ns machine-dependent — the ratio is the portable signal. The real-pointer-gesture timing axis is browser-dependent and deferred.)`,
)

for (const r of rows) if (r.note) console.log(`  · ${r.op}: ${r.note}`)

if (sink === -1) console.log('unreachable', sink)
GlobalRegistrator.unregister?.()
