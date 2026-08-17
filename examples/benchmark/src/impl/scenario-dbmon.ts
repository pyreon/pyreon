/**
 * Scenario: **dbmon — sustained wide update**.
 *
 * WHAT IT MEASURES: 100 rows × 12 dynamic values (query count + its class, then
 * 5 × (elapsed text + threshold class)) = 1,200 values mutated per tick, with
 * EVERY value changing every tick. Eight pre-built ticks are rotated so nothing
 * can be short-circuited as unchanged and no input is loop-invariant (the
 * rotated-input contract from `bench-ssr.ts`).
 *
 * WHY IT IS WORTH MEASURING: the existing nine ops are narrow updates on a
 * keyed list — one field on 10% of rows, or a structural add/remove/reorder.
 * A signal graph wins those by NOT DOING WORK: it skips the 90% that did not
 * change. dbmon removes that advantage by construction, because everything
 * changes. This is therefore a scenario where fine-grained reactivity is
 * expected to be at its weakest relative to a vdom diff, and it is included
 * precisely for that reason — "fastest in all aspects" is not a claim you can
 * make from a suite that only contains your best shapes.
 *
 * FAIRNESS: each framework updates using ITS OWN documented model, which is the
 * same convention the main suite already follows (Pyreon/Solid hold per-row
 * signals; React/Vue/Svelte/Preact rebuild immutably):
 *   - **Pyreon / Solid** — per-cell signals mutated inside `batch()`. The row
 *     LIST is static, so replacing an array would be the non-idiomatic path.
 *   - **React / Preact** — new sample array into `useState`, `memo`'d row,
 *     `flushSync` (React) / microtask (Preact). Every row genuinely changed, so
 *     `memo` correctly saves nothing here; it is kept because omitting it would
 *     differ from `impl/react.ts` without cause.
 *   - **Vue** — `shallowRef` replace + `nextTick`. Vue's own performance guide
 *     prescribes `shallowRef` for a wholesale-replaced structure; a deep `ref`
 *     would allocate a proxy per sample per tick, the handicap PR #2878 removed.
 *   - **Svelte** — `$state.raw` replace + `flushSync`, same reasoning.
 *   - **Vanilla** — direct DOM writes against cached node references. The
 *     floor, not a competitor.
 *
 * Batching is applied for every framework that has it (`batch` / `flushSync` /
 * `nextTick`), so no framework pays per-write scheduling the others avoid.
 */
import { h as ph } from '@pyreon/core'
import { batch as pyreonBatch, signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { h as preactH, render as preactRender } from 'preact'
import { memo as preactMemo } from 'preact/compat'
import { useEffect as preactUseEffect, useState as preactUseState } from 'preact/hooks'
import * as React from 'react'
import { flushSync as reactFlushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import { batch as solidBatch, createRenderEffect, createSignal } from 'solid-js'
import { insert, render as solidRender, template } from 'solid-js/web'
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from 'svelte'
import { createApp, defineComponent, h as vueH, nextTick, shallowRef } from 'vue'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import Dbmon from './Dbmon.svelte'
import { setTick } from './dbmon-state.svelte'
import { PyreonDbmon, type PyreonDbCell, type PyreonDbRow } from './scenario-dbmon-pyreon'
import {
  DB_COUNT,
  DB_NAMES,
  DBMON_SAMPLES,
  DBMON_TICKS,
  QUERY_SLOTS,
  verifyDbmon,
  type DbSample,
} from './scenario-shared'

export interface DbmonTarget {
  /** Apply one tick and return once the framework has committed it. */
  apply: (tick: DbSample[]) => void | Promise<void>
  teardown: () => void
}

// ─── Vanilla (baseline) ──────────────────────────────────────────────────────

function vanillaTarget(container: HTMLElement): DbmonTarget {
  const table = document.createElement('table')
  const tbody = document.createElement('tbody')
  table.appendChild(tbody)

  // Cache every node the tick writes to — a hand-optimised app would.
  const countSpans: HTMLElement[] = []
  const countTexts: Text[] = []
  const queryCells: HTMLElement[][] = []
  const queryTexts: Text[][] = []

  for (let i = 0; i < DB_COUNT; i++) {
    const tr = document.createElement('tr')
    const nameTd = document.createElement('td')
    nameTd.className = 'dbname'
    nameTd.textContent = DB_NAMES[i] as string
    tr.appendChild(nameTd)

    const countTd = document.createElement('td')
    countTd.className = 'query-count'
    const span = document.createElement('span')
    const countText = document.createTextNode('')
    span.appendChild(countText)
    countTd.appendChild(span)
    tr.appendChild(countTd)
    countSpans.push(span)
    countTexts.push(countText)

    const cells: HTMLElement[] = []
    const texts: Text[] = []
    for (let q = 0; q < QUERY_SLOTS; q++) {
      const td = document.createElement('td')
      const t = document.createTextNode('')
      td.appendChild(t)
      tr.appendChild(td)
      cells.push(td)
      texts.push(t)
    }
    queryCells.push(cells)
    queryTexts.push(texts)
    tbody.appendChild(tr)
  }
  container.appendChild(table)

  return {
    apply(tick) {
      for (let i = 0; i < DB_COUNT; i++) {
        const s = tick[i] as DbSample
        ;(countTexts[i] as Text).data = String(s.queryCount)
        ;(countSpans[i] as HTMLElement).className = s.countCls
        const cells = queryCells[i] as HTMLElement[]
        const texts = queryTexts[i] as Text[]
        for (let q = 0; q < QUERY_SLOTS; q++) {
          const want = s.queries[q] as { elapsed: string; cls: string }
          ;(texts[q] as Text).data = want.elapsed
          ;(cells[q] as HTMLElement).className = want.cls
        }
      }
    },
    teardown: () => table.remove(),
  }
}

// ─── Pyreon ──────────────────────────────────────────────────────────────────

function pyreonTarget(container: HTMLElement): DbmonTarget {
  const rowModel: PyreonDbRow[] = DB_NAMES.map((name) => ({
    name,
    count: signal(0),
    countCls: signal(''),
    queries: Array.from({ length: QUERY_SLOTS }, () => ({
      elapsed: signal(''),
      cls: signal(''),
    })),
  }))
  const rows = signal<PyreonDbRow[]>(rowModel)

  const unmount = pyreonMount(
    ph(PyreonDbmon as never, { rows: () => rows() }),
    container,
  )

  return {
    apply(tick) {
      // `batch()` is the documented way to group multiple signal writes —
      // CLAUDE.md lists "3+ signal updates without batch()" as an anti-pattern,
      // so this IS the idiomatic fast path, not a bench-only trick.
      pyreonBatch(() => {
        for (let i = 0; i < DB_COUNT; i++) {
          const row = rowModel[i] as PyreonDbRow
          const s = tick[i] as DbSample
          row.count.set(s.queryCount)
          row.countCls.set(s.countCls)
          for (let q = 0; q < QUERY_SLOTS; q++) {
            const cell = row.queries[q] as PyreonDbCell
            const want = s.queries[q] as { elapsed: string; cls: string }
            cell.elapsed.set(want.elapsed)
            cell.cls.set(want.cls)
          }
        }
      })
    },
    teardown: unmount,
  }
}

// ─── Solid ───────────────────────────────────────────────────────────────────
// Hand-written at the compiler's output level (template/insert/createRenderEffect)
// — this app has no vite-plugin-solid, the same constraint `impl/solid.ts`
// documents.

const _dbRowTmpl = template(
  '<tr><td class="dbname"></td><td class="query-count"><span></span></td><td></td><td></td><td></td><td></td><td></td></tr>',
)

function solidTarget(container: HTMLElement): DbmonTarget {
  type Cell = {
    elapsed: () => string
    setElapsed: (s: string) => void
    cls: () => string
    setCls: (s: string) => void
  }
  type SolidRow = {
    count: () => number
    setCount: (n: number) => void
    countCls: () => string
    setCountCls: (s: string) => void
    queries: Cell[]
  }

  const rowModel: SolidRow[] = DB_NAMES.map(() => {
    const [count, setCount] = createSignal(0)
    const [countCls, setCountCls] = createSignal('')
    const queries: Cell[] = Array.from({ length: QUERY_SLOTS }, () => {
      const [elapsed, setElapsed] = createSignal('')
      const [cls, setCls] = createSignal('')
      return { elapsed, setElapsed, cls, setCls }
    })
    return { count, setCount, countCls, setCountCls, queries }
  })

  const dispose = solidRender(() => {
    const table = document.createElement('table')
    const tbody = document.createElement('tbody')
    table.appendChild(tbody)
    for (let i = 0; i < DB_COUNT; i++) {
      const row = rowModel[i] as SolidRow
      const tr = _dbRowTmpl() as HTMLElement
      const tds = tr.children
      ;(tds[0] as HTMLElement).textContent = DB_NAMES[i] as string
      const span = (tds[1] as HTMLElement).firstElementChild as HTMLElement
      insert(span, () => row.count())
      createRenderEffect(() => {
        span.className = row.countCls()
      })
      for (let q = 0; q < QUERY_SLOTS; q++) {
        const cell = row.queries[q] as Cell
        const td = tds[2 + q] as HTMLElement
        insert(td, () => cell.elapsed())
        createRenderEffect(() => {
          td.className = cell.cls()
        })
      }
      tbody.appendChild(tr)
    }
    return table
  }, container)

  return {
    apply(tick) {
      solidBatch(() => {
        for (let i = 0; i < DB_COUNT; i++) {
          const row = rowModel[i] as SolidRow
          const s = tick[i] as DbSample
          row.setCount(s.queryCount)
          row.setCountCls(s.countCls)
          for (let q = 0; q < QUERY_SLOTS; q++) {
            const cell = row.queries[q] as Cell
            const want = s.queries[q] as { elapsed: string; cls: string }
            cell.setElapsed(want.elapsed)
            cell.setCls(want.cls)
          }
        }
      })
    },
    teardown: dispose,
  }
}

// ─── React ───────────────────────────────────────────────────────────────────

const ReactDbRow = React.memo(function ReactDbRowInner({
  name,
  sample,
}: {
  name: string
  sample: DbSample
}) {
  const r = React.createElement
  const q = sample.queries
  return r(
    'tr',
    null,
    r('td', { className: 'dbname' }, name),
    r(
      'td',
      { className: 'query-count' },
      r('span', { className: sample.countCls }, sample.queryCount),
    ),
    r('td', { className: (q[0] as { cls: string }).cls }, (q[0] as { elapsed: string }).elapsed),
    r('td', { className: (q[1] as { cls: string }).cls }, (q[1] as { elapsed: string }).elapsed),
    r('td', { className: (q[2] as { cls: string }).cls }, (q[2] as { elapsed: string }).elapsed),
    r('td', { className: (q[3] as { cls: string }).cls }, (q[3] as { elapsed: string }).elapsed),
    r('td', { className: (q[4] as { cls: string }).cls }, (q[4] as { elapsed: string }).elapsed),
  )
})

function reactTarget(container: HTMLElement): Promise<DbmonTarget> {
  const r = React.createElement
  let resolveSetter!: (set: (t: DbSample[]) => void) => void
  const setterPromise = new Promise<(t: DbSample[]) => void>((res) => {
    resolveSetter = res
  })

  function App({ onMounted }: { onMounted: (set: (t: DbSample[]) => void) => void }) {
    const [tick, setTickState] = React.useState<DbSample[]>([])
    React.useEffect(() => {
      onMounted(setTickState)
    }, [onMounted])
    return r(
      'table',
      null,
      r(
        'tbody',
        null,
        ...tick.map((sample, i) =>
          r(ReactDbRow, { key: i, name: DB_NAMES[i] as string, sample }),
        ),
      ),
    )
  }

  const root = ReactDOM.createRoot(container)
  root.render(r(App, { onMounted: resolveSetter }))

  return setterPromise.then((setTickState) => ({
    apply(tick: DbSample[]) {
      reactFlushSync(() => setTickState(tick))
    },
    teardown: () => root.unmount(),
  }))
}

// ─── Preact ──────────────────────────────────────────────────────────────────

const PreactDbRow = preactMemo(function PreactDbRowInner({
  name,
  sample,
}: {
  name: string
  sample: DbSample
}) {
  const q = sample.queries
  return preactH(
    'tr',
    null,
    preactH('td', { className: 'dbname' }, name),
    preactH(
      'td',
      { className: 'query-count' },
      preactH('span', { className: sample.countCls }, sample.queryCount),
    ),
    preactH('td', { className: (q[0] as { cls: string }).cls }, (q[0] as { elapsed: string }).elapsed),
    preactH('td', { className: (q[1] as { cls: string }).cls }, (q[1] as { elapsed: string }).elapsed),
    preactH('td', { className: (q[2] as { cls: string }).cls }, (q[2] as { elapsed: string }).elapsed),
    preactH('td', { className: (q[3] as { cls: string }).cls }, (q[3] as { elapsed: string }).elapsed),
    preactH('td', { className: (q[4] as { cls: string }).cls }, (q[4] as { elapsed: string }).elapsed),
  )
})

function preactTarget(container: HTMLElement): Promise<DbmonTarget> {
  let resolveSetter!: (set: (t: DbSample[]) => void) => void
  const setterPromise = new Promise<(t: DbSample[]) => void>((res) => {
    resolveSetter = res
  })

  function App({ onMounted }: { onMounted: (set: (t: DbSample[]) => void) => void }) {
    const [tick, setTickState] = preactUseState<DbSample[]>([])
    preactUseEffect(() => {
      onMounted(setTickState)
    }, [onMounted])
    return preactH(
      'table',
      null,
      preactH(
        'tbody',
        null,
        ...tick.map((sample, i) =>
          preactH(PreactDbRow, { key: i, name: DB_NAMES[i] as string, sample }),
        ),
      ),
    )
  }

  preactRender(preactH(App, { onMounted: resolveSetter }), container)

  return setterPromise.then((setTickState) => ({
    async apply(tick: DbSample[]) {
      setTickState(tick)
      // Preact batches hook updates on a microtask — wait exactly that, no rAF
      // (the tightest commit that still guarantees the DOM, matching impl/preact.ts).
      await Promise.resolve()
    },
    teardown: () => preactRender(null, container),
  }))
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

function vueTarget(container: HTMLElement): DbmonTarget {
  const tick = shallowRef<DbSample[]>([])

  const App = defineComponent({
    setup() {
      return () =>
        vueH('table', null, [
          vueH(
            'tbody',
            null,
            tick.value.map((sample, i) => {
              const q = sample.queries
              return vueH('tr', { key: i }, [
                vueH('td', { class: 'dbname' }, DB_NAMES[i] as string),
                vueH('td', { class: 'query-count' }, [
                  vueH('span', { class: sample.countCls }, String(sample.queryCount)),
                ]),
                vueH('td', { class: (q[0] as { cls: string }).cls }, (q[0] as { elapsed: string }).elapsed),
                vueH('td', { class: (q[1] as { cls: string }).cls }, (q[1] as { elapsed: string }).elapsed),
                vueH('td', { class: (q[2] as { cls: string }).cls }, (q[2] as { elapsed: string }).elapsed),
                vueH('td', { class: (q[3] as { cls: string }).cls }, (q[3] as { elapsed: string }).elapsed),
                vueH('td', { class: (q[4] as { cls: string }).cls }, (q[4] as { elapsed: string }).elapsed),
              ])
            }),
          ),
        ])
    },
  })

  const app = createApp(App)
  app.mount(container)

  return {
    async apply(t) {
      tick.value = t
      await nextTick()
    },
    teardown: () => app.unmount(),
  }
}

// ─── Svelte ──────────────────────────────────────────────────────────────────

function svelteTarget(container: HTMLElement): DbmonTarget {
  setTick([])
  const app = svelteMount(Dbmon, { target: container })
  svelteFlushSync()

  return {
    apply(t) {
      setTick(t)
      // flushSync applies Svelte's queued effects synchronously — DOM committed
      // on return, no extra macrotask (matches impl/svelte.ts).
      svelteFlushSync()
    },
    teardown: () => {
      setTick([])
      svelteUnmount(app)
    },
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export const DBMON_FRAMEWORKS = [
  'Vanilla JS',
  'Pyreon',
  'React 19',
  'Preact',
  'Vue 3',
  'SolidJS',
  'Svelte 5',
] as const

export async function runDbmon(frameworkName: string, container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }

  let target: DbmonTarget
  switch (frameworkName) {
    case 'Vanilla JS':
      target = vanillaTarget(container)
      break
    case 'Pyreon':
      target = pyreonTarget(container)
      break
    case 'React 19':
      target = await reactTarget(container)
      break
    case 'Preact':
      target = await preactTarget(container)
      break
    case 'Vue 3':
      target = vueTarget(container)
      break
    case 'SolidJS':
      target = solidTarget(container)
      break
    case 'Svelte 5':
      target = svelteTarget(container)
      break
    default:
      throw new Error(`[dbmon] unknown framework: ${frameworkName}`)
  }

  // Prime with tick 0 so the first TIMED iteration is a real update over an
  // already-populated table, not an initial mount (which the main suite's
  // create-1k op already measures).
  await target.apply(DBMON_TICKS[0] as DbSample[])

  let cursor = 0
  let applied: DbSample[] = DBMON_TICKS[0] as DbSample[]

  await bench(
    `dbmon tick — ${DB_COUNT} rows × ${QUERY_SLOTS + 1} cells (all changing)`,
    suite,
    async () => {
      // Rotate through the pre-built ticks: consecutive iterations always see
      // DIFFERENT data, so no framework can skip on equality and no value is
      // loop-invariant.
      cursor = (cursor + 1) % DBMON_SAMPLES
      applied = DBMON_TICKS[cursor] as DbSample[]
      await target.apply(applied)
    },
    { verify: (c) => verifyDbmon(c, applied) },
  )

  target.teardown()
  return suite
}
