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
 *   - **Octane** — new sample array into `useState` + `flushSync`, the same
 *     React-model shape, expressed through the compiler's `@for` block. No
 *     `memo` wrapper: `octane.tsrx` measured it 3.8x SLOWER in Octane, and it
 *     could not help here anyway since every row changes. See
 *     `scenario-dbmon-octane.tsrx` for the emitted-flag verification behind the
 *     row body's exact shape.
 *   - **Vue** — `shallowRef` replace + `nextTick`. Vue's own performance guide
 *     prescribes `shallowRef` for a wholesale-replaced structure; a deep `ref`
 *     would allocate a proxy per sample per tick, the handicap PR #2878 removed.
 *     Published TWICE: `Vue 3` builds vnodes with `h()` (the suite's convention)
 *     and `Vue 3 (template)` runs the render function Vue's own template
 *     compiler emits, so the cost of that convention is a measured number
 *     rather than an open question.
 *   - **Svelte** — `$state.raw` replace + `flushSync`, same reasoning.
 *   - **Vanilla** — direct DOM writes against cached node references. The
 *     floor, not a competitor.
 *
 * Batching is applied for every framework that has it (`batch` / `flushSync` /
 * `nextTick`), so no framework pays per-write scheduling the others avoid.
 *
 * TWO ARMS ARE PUBLISHED IN DUPLICATE ON PURPOSE (`Vue 3 (template)`,
 * `SolidJS (per-attr effects)`). Both exist because a fairness correction was
 * made to a COMPETITOR's arm, and a competitor correction made by the framework
 * author is exactly the kind of change a reader should not have to take on
 * trust. Shipping the superseded shape beside the corrected one turns "we fixed
 * their arm" into something checkable in one run.
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
import { className as solidClassName, insert, render as solidRender, template } from 'solid-js/web'
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from 'svelte'
import { createApp, defineComponent, h as vueH, nextTick, shallowRef } from 'vue'
// Build-time-compiled render fn for the `Vue 3 (template)` arm — see the
// `dbmon-vue-template` plugin in vite.config.ts.
import { render as vueCompiledRender } from 'virtual:dbmon-vue-render'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import Dbmon from './Dbmon.svelte'
import { setTick } from './dbmon-state.svelte'
import { createOctaneDbmonTarget } from './scenario-dbmon-octane.tsrx'
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

/**
 * The `Text.data` twin of runner.ts's `NumericText` — a type-level view that
 * lets an impl assign the raw number against DOM typings declaring
 * `data: string`. No runtime cost, no wrapper call.
 */
type NumericTextData = { data: number }

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
        // Raw number, not String(...) — runner.ts "Row-id rendering rule": the
        // JS stringify shapes cost ~62 KB of engine cache that the WebIDL
        // coercion does not. This arm and Vue's were the only two in the
        // scenario still calling String(), i.e. exactly the harness artifact
        // that rule exists to prevent.
        ;(countTexts[i] as unknown as NumericTextData).data = s.queryCount
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
//
// VERIFIED against `babel-preset-solid` rather than assumed, because a
// hand-written Solid arm on a shape the compiler does not emit is precisely the
// bug PR #2896 fixed in the deep-tree scenario. Compiling this row's JSX
// (`generate: 'dom'`) shows two things the earlier hand-written form got wrong,
// in OPPOSITE directions — both are corrected here:
//
//  1. CLASSES: the compiler groups every dynamic attribute in one template into
//     a SINGLE `_$effect` per row, carrying a previous-value object (`_p$`) and
//     writing only the values that actually changed. The earlier arm created SIX
//     separate `createRenderEffect`s per row (one per class), i.e. 600 effect
//     re-runs per tick instead of 100. That HANDICAPPED Solid.
//  2. NAME: the compiler emits `_$insert(el, () => row.name)` — a reactive
//     insert — because it cannot prove a member expression is static. The
//     earlier arm assigned `textContent` once, which is what PYREON's compiler
//     legitimately does for a `<For>` item param but Solid's does not. That
//     FLATTERED Solid.
//
// Correcting only (1) or only (2) would have moved the ranking in a chosen
// direction, so both are applied together.
//
// MEASURED OUTCOME: a wash. The `SolidJS (per-attr effects)` diagnostic arm
// below preserves the previous shape, and across four full-field passes the two
// land within noise of each other (1.69-1.71ms vs 1.70-1.71ms, CI95 overlapping
// every time). The expectation going in was that grouping would win by cutting
// 600 effect re-runs per tick to 100; it did not, which is worth stating
// plainly rather than quietly dropping. So this correction is about EMIT
// FIDELITY, not about a number — Solid's rank is the same either way.
//
// One process note, because it nearly produced a false finding: an early
// comparison appeared to show the correction costing Solid 0.39ms. It did not.
// The two figures came from different runs at different machine loads, and
// identical code measured 1.32ms at load 13 and 1.68ms at load 3. Only the
// same-run interleaved A/B is evidence here.
//
// `className()` is the compiler's own helper (`node.className = value` with a
// null/hydration guard), imported rather than re-implemented as a bare
// assignment so the arm cannot drift from it.

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
      const name = DB_NAMES[i] as string
      // Reactive insert — what `_$insert(el, () => row.name)` compiles to.
      // Holds no signal, so this effect runs once at mount and never again.
      insert(tds[0] as HTMLElement, () => name)
      const span = (tds[1] as HTMLElement).firstElementChild as HTMLElement
      insert(span, () => row.count())
      for (let q = 0; q < QUERY_SLOTS; q++) {
        const cell = row.queries[q] as Cell
        insert(tds[2 + q] as HTMLElement, () => cell.elapsed())
      }
      // ONE grouped effect for every class in the row, with the compiler's
      // previous-value diffing — the `_$effect(_p$ => { … }, { … })` shape.
      const q0 = row.queries[0] as Cell
      const q1 = row.queries[1] as Cell
      const q2 = row.queries[2] as Cell
      const q3 = row.queries[3] as Cell
      const q4 = row.queries[4] as Cell
      const td0 = tds[2] as HTMLElement
      const td1 = tds[3] as HTMLElement
      const td2 = tds[4] as HTMLElement
      const td3 = tds[5] as HTMLElement
      const td4 = tds[6] as HTMLElement
      createRenderEffect(
        (p: Record<string, string | undefined>) => {
          const v0 = row.countCls()
          const v1 = q0.cls()
          const v2 = q1.cls()
          const v3 = q2.cls()
          const v4 = q3.cls()
          const v5 = q4.cls()
          if (v0 !== p.a) solidClassName(span, (p.a = v0))
          if (v1 !== p.b) solidClassName(td0, (p.b = v1))
          if (v2 !== p.c) solidClassName(td1, (p.c = v2))
          if (v3 !== p.d) solidClassName(td2, (p.d = v3))
          if (v4 !== p.e) solidClassName(td3, (p.e = v4))
          if (v5 !== p.f) solidClassName(td4, (p.f = v5))
          return p
        },
        {
          a: undefined,
          b: undefined,
          c: undefined,
          d: undefined,
          e: undefined,
          f: undefined,
        } as Record<string, string | undefined>,
      )
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

/**
 * DIAGNOSTIC ARM (not ranked): the PREVIOUS hand-written Solid shape.
 *
 * Kept so the correction above is auditable rather than asserted. It differs
 * from the ranking arm in exactly the two ways the compiler probe identified:
 * one `createRenderEffect` per class instead of one grouped effect per row, and
 * a one-shot `textContent` name instead of a reactive `insert`.
 *
 * It exists because the correction moved Solid in the direction that FLATTERS
 * Pyreon (the ranking arm measures slower than this one), and a change with
 * that shape needs to be checkable by someone who does not trust the author.
 * Publishing both numbers is what makes it checkable.
 */
function solidPerAttrTarget(container: HTMLElement): DbmonTarget {
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
                // Raw number, not String(...) — runner.ts "Row-id rendering
                // rule". Vue's own text path stringifies internally, and that
                // cost is honestly Vue's; paying it in the harness instead
                // charged Vue for something the other arms were not charged for.
                vueH('td', { class: 'query-count' }, [
                  vueH('span', { class: sample.countCls }, sample.queryCount),
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

// ─── Vue (template-compiled) ─────────────────────────────────────────────────

/**
 * The SAME Vue, on the render path a real Vue app actually ships.
 *
 * The `Vue 3` arm above builds its vnodes with `h()`, which is the convention
 * the whole suite uses for Vue. That convention has a cost that is invisible
 * until you look for it: `h()` produces UNOPTIMIZED vnodes, so Vue's headline
 * compiler optimizations — PatchFlags (patch only `class`, skip a full prop
 * diff) and the block tree (`dynamicChildren`, skip untouched subtrees) — are
 * entirely switched off. Those are not incidental; they are the main thing
 * Vue's compiler does for update performance, and essentially every real Vue
 * app gets them via SFCs.
 *
 * Vue's own dbmon port is template-based, so `h()` is not the shape to judge
 * Vue's sustained-update performance by. This arm compiles the equivalent
 * template with Vue's real `@vue/compiler-dom`, at module load — OUTSIDE the
 * timed region, so the timer only ever sees the compiled render function.
 *
 * `prefixIdentifiers: true` IS THE LOAD-BEARING OPTION, and it was found by
 * measurement, not foresight. Vue's default RUNTIME compilation (what you get
 * from `vue/dist/vue.esm-bundler.js` with a `template:` string) wraps the whole
 * render body in `with (_ctx) { … }`. A `with` block is a hard V8
 * deoptimization barrier — every identifier becomes a dynamic scope lookup — so
 * that path is markedly slower than an SFC and measured SLOWER here than the
 * `h()` arm it was meant to beat (1.87ms vs 1.61ms). Publishing that would have
 * been a harness artifact reported as a Vue property. `prefixIdentifiers: true`
 * emits `_ctx.tick` with no `with`, which is what `@vue/compiler-sfc` does and
 * therefore what a real Vue app runs. `hoistStatic` is set for the same reason.
 * Function mode rather than module mode only changes the preamble (a
 * destructure instead of imports) so the emitted render BODY is the SFC's.
 *
 * Both arms are published and both are ranked. Keeping the `h()` arm makes the
 * size of the gap a measured number rather than an assertion.
 *
 * MEASURED OUTCOME: the gap is small — template 1.82-1.86ms vs `h()`
 * 1.87ms across four full-field passes, i.e. a slight edge that does not change
 * Vue's rank. That is a genuinely useful negative result: it says the suite's
 * long-standing `h()` convention is NOT meaningfully handicapping Vue on this
 * workload, because the dominant per-tick cost is vnode construction plus keyed
 * fragment reconciliation, which both paths pay in full. PatchFlags only narrow
 * the per-element PROP diff, and these rows carry one prop each. It does not
 * license the same conclusion for the main row-list suite, whose ops have
 * different shapes — that would need its own measurement.
 *
 * `{{ }}` interpolation routes through Vue's `toDisplayString`, which
 * stringifies in JS. That is deliberately left alone — runner.ts's "Row-id
 * rendering rule" is explicit that a framework's OWN text path is honestly
 * attributable to it, and only harness-side `String(...)` is the artifact.
 */
// The template itself lives in `dbmon-vue-template.ts` so vite.config.ts can
// read it at build time; see that file and the plugin for why.

function vueTemplateTarget(container: HTMLElement): DbmonTarget {
  const tick = shallowRef<DbSample[]>([])

  const App = defineComponent({
    render: vueCompiledRender,
    setup() {
      return { tick, names: DB_NAMES }
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
  'Octane',
  'React 19',
  'Preact',
  'Vue 3',
  'Vue 3 (template)',
  'SolidJS',
  'SolidJS (per-attr effects)',
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
    case 'Octane':
      target = await createOctaneDbmonTarget(container)
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
    case 'Vue 3 (template)':
      target = vueTemplateTarget(container)
      break
    case 'SolidJS':
      target = solidTarget(container)
      break
    case 'SolidJS (per-attr effects)':
      target = solidPerAttrTarget(container)
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
