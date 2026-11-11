/**
 * @pyreon/dnd vs dnd-kit (`@dnd-kit/dom`, the framework-agnostic core) — ⚠ happy-dom.
 *
 * Run: `bun run bench:rivals` (from packages/fundamentals/dnd). Harness and
 * measurement contract: `scripts/bench/rivals-harness.ts` (one process per
 * op × arm × round, cluster-bootstrap CI95 over processes, gate before timing).
 *
 * WHAT IS MEASURED — registration lifecycle, the cost a list pays when it
 * mounts and unmounts its drag sources / drop targets: register K = 50
 * elements (plus one K = 400 scaling row), let the deferred registration run (both libraries register on a
 * microtask), then tear all K down. Reported per element. Real pointer-driven
 * drags are browser-gesture work and are not measured here.
 *
 * Idiomatic per library:
 *  - Pyreon: `useDraggable` / `useDroppable` / `useDragMonitor` / `useSortable`
 *    inside an effect scope (what a component body is), disposed through
 *    `onCleanup` — the same arms as `dnd-wrapper-tax.ts`'s `wrapper` impl.
 *  - dnd-kit: the vanilla API — one `DragDropManager` per app (built once per
 *    process, like pragmatic-drag-and-drop's global registry Pyreon wraps),
 *    `new Draggable({ id, element, type }, manager)`, `new Droppable({ id,
 *    element, accept }, manager)`, `manager.monitor.addEventListener(...)`,
 *    `new Sortable({ id, index, element }, manager)`, `.destroy()` to tear down.
 *    https://dndkit.com/vanilla/quickstart · https://dndkit.com/concepts/sortable
 *    `@dnd-kit/dom` is pre-1.0 (0.x); its API may still move.
 *  - Both sides read the instance's reactive drag flag once (Pyreon
 *    `isDragging()`, dnd-kit `draggable.isDragging`), so each pays to surface
 *    the state a component would render.
 *
 * Correctness gate: after the flush, each library's registry must hold all K
 * registrations, and after teardown none (dnd-kit: `manager.registry`; Pyreon:
 * pragmatic-drag-and-drop's registration is observable as the
 * `data-drop-target-for-element` / `draggable` attributes it sets).
 *
 * ⚠ happy-dom is a JavaScript DOM, not a browser: relative work is meaningful,
 * absolute times are not.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { runRivalBench, type Arm } from '../../../../scripts/bench/rivals-harness'

GlobalRegistrator.register()

const { effect } = await import('@pyreon/reactivity')
const { DragDropManager, Draggable, Droppable } = await import('@dnd-kit/dom')
const { Sortable } = await import('@dnd-kit/dom/sortable')
const { useDraggable } = await import('../src/use-draggable')
const { useDroppable } = await import('../src/use-droppable')
const { useDragMonitor } = await import('../src/use-drag-monitor')
const { useSortable } = await import('../src/use-sortable')

type Id = 'pyreon' | 'dnd-kit'
const ARMS: readonly Arm<Id>[] = [
  { id: 'pyreon', label: 'Pyreon (@pyreon/dnd)' },
  { id: 'dnd-kit', label: 'dnd-kit (@dnd-kit/dom)', pkg: '@dnd-kit/dom' },
]

let sink = 0
const flush = () => new Promise<void>((r) => queueMicrotask(() => r()))
const el = () => {
  const d = document.createElement('div')
  document.body.appendChild(d)
  return d
}

type Batch = (k: number) => Promise<void>
type Kind = 'draggable' | 'droppable' | 'monitor' | 'sortable'

function pyreonBatch(kind: Kind): Batch {
  if (kind === 'sortable') {
    const items = [{ id: 'x' }]
    return async (k) => {
      const e = effect(() => {
        const { itemRef, activeId } = useSortable({
          items: () => items,
          by: (it) => it.id,
          onReorder: () => {},
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
    }
  }
  return async (k) => {
    const disposers: (() => void)[] = []
    for (let i = 0; i < k; i++) {
      const node = kind === 'monitor' ? null : el()
      const e = effect(() => {
        if (kind === 'draggable') {
          const { isDragging } = useDraggable({ element: () => node, data: { i, type: 'card' } })
          sink += isDragging() ? 1 : 0
        } else if (kind === 'droppable') {
          const { isOver } = useDroppable({
            element: () => node,
            data: { zone: i },
            canDrop: (d) => d.type === 'card',
            onDrop: () => {},
          })
          sink += isOver() ? 1 : 0
        } else {
          const { isDragging } = useDragMonitor({ onDrop: () => {} })
          sink += isDragging() ? 1 : 0
        }
      })
      disposers.push(() => {
        e.dispose()
        node?.remove()
      })
    }
    await flush()
    for (const d of disposers) d()
  }
}

function dndKitBatch(kind: Kind, manager: InstanceType<typeof DragDropManager>): Batch {
  return async (k) => {
    const teardown: (() => void)[] = []
    for (let i = 0; i < k; i++) {
      if (kind === 'monitor') {
        const off = manager.monitor.addEventListener('dragend', () => {})
        sink += manager.dragOperation.status.dragging ? 1 : 0
        teardown.push(off)
        continue
      }
      const node = el()
      if (kind === 'draggable') {
        const d = new Draggable({ id: `d${i}`, element: node, type: 'card', data: { i } }, manager)
        sink += d.isDragging ? 1 : 0
        teardown.push(() => {
          d.destroy()
          node.remove()
        })
      } else if (kind === 'droppable') {
        const d = new Droppable({ id: `z${i}`, element: node, accept: 'card', data: { zone: i } }, manager)
        sink += d.isDropTarget ? 1 : 0
        teardown.push(() => {
          d.destroy()
          node.remove()
        })
      } else {
        const s = new Sortable({ id: `k${i}`, index: i, element: node }, manager)
        sink += s.isDragging ? 1 : 0
        teardown.push(() => {
          s.destroy()
          node.remove()
        })
      }
    }
    await flush()
    for (const t of teardown) t()
  }
}

function makeOp(kind: Kind, k: number) {
  return {
    async: true,
    // ~1,600 elements per timed window at either size.
    iters: Math.max(4, Math.round(1600 / k)),
    runs: 11,
    warmup: 6,
    divide: k,
    make: (id: Id) => {
      const batch = id === 'pyreon' ? pyreonBatch(kind) : dndKitBatch(kind, new DragDropManager())
      return () => batch(k)
    },
  }
}

await runRivalBench<Id>({
  title: '@pyreon/dnd vs dnd-kit (@dnd-kit/dom) — ⚠ happy-dom',
  file: import.meta.path,
  pyreon: 'pyreon',
  arms: ARMS,
  sink: () => sink,
  unit: 'ns per element',
  ops: {
    'draggable mount+unmount (K=50)': makeOp('draggable', 50),
    'droppable mount+unmount (K=50)': makeOp('droppable', 50),
    'monitor mount+unmount (K=50)': makeOp('monitor', 50),
    'sortable item mount+unmount (K=50)': {
      ...makeOp('sortable', 50),
      note: 'Pyreon: one useSortable, K item refs attached then detached; dnd-kit: K Sortable instances registered (after the microtask) then destroyed',
    },
    'sortable item mount+unmount (K=400)': {
      ...makeOp('sortable', 400),
      note: 'scaling row: dnd-kit per-element registration cost grows with K under happy-dom (25 → 400 elements ≈ 50× per element in a probe); not yet checked in a browser',
    },
  },
  gate: async () => {
    const n = 8
    // dnd-kit: K registrations land after the microtask, none remain after teardown.
    const manager = new DragDropManager()
    const count = () => [[...manager.registry.draggables].length, [...manager.registry.droppables].length]
    for (const kind of ['draggable', 'droppable', 'sortable'] as const) {
      const nodes: HTMLElement[] = []
      const made: { destroy(): void }[] = []
      for (let i = 0; i < n; i++) {
        const node = el()
        nodes.push(node)
        made.push(
          kind === 'draggable'
            ? new Draggable({ id: `g${i}`, element: node, type: 'card' }, manager)
            : kind === 'droppable'
              ? new Droppable({ id: `g${i}`, element: node, accept: 'card' }, manager)
              : new Sortable({ id: `g${i}`, index: i, element: node }, manager),
        )
      }
      await flush()
      const [dr, dp] = count()
      const want = kind === 'draggable' ? [n, 0] : kind === 'droppable' ? [0, n] : [n, n]
      if (dr !== want[0] || dp !== want[1])
        throw new Error(`[correctness] dnd-kit ${kind}: registry ${dr}/${dp}, expected ${want}`)
      for (const m of made) m.destroy()
      const [ar, ap] = count()
      if (ar !== 0 || ap !== 0) throw new Error(`[correctness] dnd-kit ${kind}: ${ar}/${ap} left after destroy`)
      for (const node of nodes) node.remove()
    }
    // Pyreon: pragmatic-drag-and-drop marks registered elements; check they
    // appear after the flush and are gone after dispose.
    for (const kind of ['draggable', 'droppable'] as const) {
      const nodes: HTMLElement[] = []
      const effects: { dispose(): void }[] = []
      for (let i = 0; i < n; i++) {
        const node = el()
        nodes.push(node)
        effects.push(
          effect(() => {
            if (kind === 'draggable') useDraggable({ element: () => node, data: { i } })
            else useDroppable({ element: () => node, data: { i }, onDrop: () => {} })
          }),
        )
      }
      await flush()
      const marked = () => nodes.filter((x) => x.getAttributeNames().some((a) => a.startsWith('data-'))).length
      const on = kind === 'draggable' ? nodes.filter((x) => x.getAttribute('draggable') === 'true').length : marked()
      if (on !== n) throw new Error(`[correctness] Pyreon ${kind}: ${on}/${n} registered after flush`)
      for (const e of effects) e.dispose()
      const left =
        kind === 'draggable' ? nodes.filter((x) => x.getAttribute('draggable') === 'true').length : marked()
      if (left !== 0) throw new Error(`[correctness] Pyreon ${kind}: ${left} still registered after dispose`)
      for (const node of nodes) node.remove()
    }
  },
  footnotes: [
    '⚠ happy-dom: relative work only. Pyreon registers through pragmatic-drag-and-drop (native HTML5 DnD); dnd-kit registers into its own signal-backed registry and attaches pointer/keyboard sensors per draggable.',
  ],
})
