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
 *     Published TWICE: `Vue 3` runs the render function Vue's own template
 *     compiler emits (build-time, SFC options), and the `Vue 3 (h())`
 *     DIAGNOSTIC builds vnodes with hand-written `h()` (the suite's former
 *     convention), so the cost of that convention is a measured number rather
 *     than an open question.
 *   - **Svelte** — `$state.raw` replace + `flushSync`, same reasoning.
 *   - **Vanilla** — rows cloned from one prototype (`cloneNode(true)`, the
 *     krausest vanillajs idiom), then direct DOM writes against cached node
 *     references. The floor, not a competitor.
 *
 * Batching is applied for every framework that has it (`batch` / `flushSync` /
 * `nextTick`), so no framework pays per-write scheduling the others avoid.
 *
 * TWO ARMS ARE PUBLISHED IN DUPLICATE ON PURPOSE (`Vue 3 (h())`,
 * `SolidJS (per-attr effects)`). Both exist because a fairness correction was
 * made to a COMPETITOR's arm, and a competitor correction made by the framework
 * author is exactly the kind of change a reader should not have to take on
 * trust. Shipping the superseded shape beside the corrected one turns "we fixed
 * their arm" into something checkable in one run.
 */
import { h as ph } from '@pyreon/core'
import { batch as pyreonBatch, signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { render as preactRender } from 'preact'
import { jsx as preactJsx, jsxs as preactJsxs } from 'preact/jsx-runtime'
import { preactJsxKeyed } from './preact-jsx-keyed'
import { memo as preactMemo } from 'preact/compat'
import { useEffect as preactUseEffect, useState as preactUseState } from 'preact/hooks'
import * as React from 'react'
import { flushSync as reactFlushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import { jsx as reactJsx, jsxs as reactJsxs } from 'react/jsx-runtime'
import { batch as solidBatch, createComponent, createRenderEffect, createSignal, For } from 'solid-js'
import { className as solidClassName, effect, insert, render as solidRender, template } from 'solid-js/web'
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from 'svelte'
import { createApp, defineComponent, h as vueH, nextTick, shallowRef } from 'vue'
// Build-time-compiled render fn for the ranked `Vue 3` arm — see the
// `vue-templates` plugin in vite.config.ts.
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

/**
 * Row prototype, cloned per row — the krausest `vanillajs-keyed` idiom (one
 * native deep `cloneNode` + a firstChild/nextSibling walk) that `impl/vanilla.ts`
 * uses, instead of 17 `createElement`/`createTextNode` calls + appends per row.
 * The spaces seed the text nodes the tick writes to, so the clone already
 * carries them. Built lazily so importing this module never touches `document`.
 */
let vanillaDbRowProto: HTMLTableRowElement | null = null

function vanillaTarget(container: HTMLElement): DbmonTarget {
  if (vanillaDbRowProto === null) {
    const t = document.createElement('template')
    t.innerHTML =
      '<tr><td class="dbname"></td><td class="query-count"><span> </span></td><td> </td><td> </td><td> </td><td> </td><td> </td></tr>'
    vanillaDbRowProto = t.content.firstChild as HTMLTableRowElement
  }
  const table = document.createElement('table')
  const tbody = document.createElement('tbody')
  table.appendChild(tbody)

  // Cache every node the tick writes to — a hand-optimised app would.
  const countSpans: HTMLElement[] = []
  const countTexts: Text[] = []
  const queryCells: HTMLElement[][] = []
  const queryTexts: Text[][] = []

  for (let i = 0; i < DB_COUNT; i++) {
    const tr = vanillaDbRowProto.cloneNode(true) as HTMLTableRowElement
    const nameTd = tr.firstChild as HTMLElement
    nameTd.textContent = DB_NAMES[i] as string
    const countTd = nameTd.nextSibling as HTMLElement
    const span = countTd.firstChild as HTMLElement
    countSpans.push(span)
    countTexts.push(span.firstChild as Text)

    const cells: HTMLElement[] = []
    const texts: Text[] = []
    let td = countTd.nextSibling as HTMLElement | null
    for (let q = 0; q < QUERY_SLOTS; q++) {
      const cell = td as HTMLElement
      cells.push(cell)
      texts.push(cell.firstChild as Text)
      td = cell.nextSibling as HTMLElement | null
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

// Templates exactly as babel-preset-solid 1.9.15 emits them (it drops the
// quotes around attribute values and the close tags the parser infers).
const _dbTableTmpl = template('<table><tbody>')
const _dbRowTmplCompiled = template(
  '<tr><td class=dbname></td><td class=query-count><span></span></td><td></td><td></td><td></td><td></td><td>',
)
// The diagnostic arm below keeps its original template string unchanged.
const _dbRowTmpl = template(
  '<tr><td class="dbname"></td><td class="query-count"><span></span></td><td></td><td></td><td></td><td></td><td></td></tr>',
)

type SolidDbCell = {
  elapsed: () => string
  setElapsed: (s: string) => void
  cls: () => string
  setCls: (s: string) => void
}
type SolidDbRow = {
  name: string
  count: () => number
  setCount: (n: number) => void
  countCls: () => string
  setCountCls: (s: string) => void
  queries: SolidDbCell[]
}

/** The compiler's `_p$` previous-value record for the row's six classes. */
type SolidDbPrev = {
  e: string | undefined
  t: string | undefined
  a: string | undefined
  o: string | undefined
  i: string | undefined
  n: string | undefined
}

function solidDbRowModel(): SolidDbRow[] {
  return DB_NAMES.map((name) => {
    const [count, setCount] = createSignal(0)
    const [countCls, setCountCls] = createSignal('')
    const queries: SolidDbCell[] = Array.from({ length: QUERY_SLOTS }, () => {
      const [elapsed, setElapsed] = createSignal('')
      const [cls, setCls] = createSignal('')
      return { elapsed, setElapsed, cls, setCls }
    })
    return { name, count, setCount, countCls, setCountCls, queries }
  })
}

function solidDbApply(rowModel: SolidDbRow[], tick: DbSample[]): void {
  solidBatch(() => {
    for (let i = 0; i < DB_COUNT; i++) {
      const row = rowModel[i] as SolidDbRow
      const s = tick[i] as DbSample
      row.setCount(s.queryCount)
      row.setCountCls(s.countCls)
      for (let q = 0; q < QUERY_SLOTS; q++) {
        const cell = row.queries[q] as SolidDbCell
        const want = s.queries[q] as { elapsed: string; cls: string }
        cell.setElapsed(want.elapsed)
        cell.setCls(want.cls)
      }
    }
  })
}

function solidTarget(container: HTMLElement): DbmonTarget {
  const rowModel = solidDbRowModel()

  // Byte-for-byte the emit of babel-preset-solid 1.9.15 (`generate: 'dom'`) for
  // the idiomatic component — diffed, not assumed:
  //
  //   <table><tbody><For each={rowModel}>{(row) => (
  //     <tr>
  //       <td class="dbname">{row.name}</td>
  //       <td class="query-count"><span class={row.countCls()}>{row.count()}</span></td>
  //       <td class={row.queries[0].cls()}>{row.queries[0].elapsed()}</td>  … ×5
  //     </tr>)}</For></tbody></table>
  //
  // (firstChild/nextSibling walk, `insert(el, () => row.name)` for the member
  // read, one grouped `effect` with `_p$` previous-value diffing for all six
  // classes.)
  const dispose = solidRender(
    () =>
      (() => {
        const _el$ = _dbTableTmpl()
        const _el$2 = _el$.firstChild as Node
        insert(
          _el$2,
          createComponent(
            For as unknown as (props: {
              each: SolidDbRow[]
              children: (row: SolidDbRow) => Node
            }) => Node[],
            {
              each: rowModel,
              children: (row: SolidDbRow) =>
                (() => {
                  const _el$3 = _dbRowTmplCompiled()
                  const _el$4 = _el$3.firstChild as Node
                  const _el$5 = _el$4.nextSibling as Node
                  const _el$6 = _el$5.firstChild as Element
                  const _el$7 = _el$5.nextSibling as Element
                  const _el$8 = _el$7.nextSibling as Element
                  const _el$9 = _el$8.nextSibling as Element
                  const _el$0 = _el$9.nextSibling as Element
                  const _el$1 = _el$0.nextSibling as Element
                  insert(_el$4, () => row.name)
                  insert(_el$6, () => row.count())
                  insert(_el$7, () => row.queries[0]!.elapsed())
                  insert(_el$8, () => row.queries[1]!.elapsed())
                  insert(_el$9, () => row.queries[2]!.elapsed())
                  insert(_el$0, () => row.queries[3]!.elapsed())
                  insert(_el$1, () => row.queries[4]!.elapsed())
                  effect(
                    // `effect`'s signature types `prev` optional; the init
                    // object below guarantees it, so the cast is type-only.
                    (prev?: SolidDbPrev) => {
                      const _p$ = prev as SolidDbPrev
                      const _v$ = row.countCls(),
                        _v$2 = row.queries[0]!.cls(),
                        _v$3 = row.queries[1]!.cls(),
                        _v$4 = row.queries[2]!.cls(),
                        _v$5 = row.queries[3]!.cls(),
                        _v$6 = row.queries[4]!.cls()
                      if (_v$ !== _p$.e) solidClassName(_el$6, (_p$.e = _v$))
                      if (_v$2 !== _p$.t) solidClassName(_el$7, (_p$.t = _v$2))
                      if (_v$3 !== _p$.a) solidClassName(_el$8, (_p$.a = _v$3))
                      if (_v$4 !== _p$.o) solidClassName(_el$9, (_p$.o = _v$4))
                      if (_v$5 !== _p$.i) solidClassName(_el$0, (_p$.i = _v$5))
                      if (_v$6 !== _p$.n) solidClassName(_el$1, (_p$.n = _v$6))
                      return _p$
                    },
                    {
                      e: undefined,
                      t: undefined,
                      a: undefined,
                      o: undefined,
                      i: undefined,
                      n: undefined,
                    } as SolidDbPrev,
                  )
                  return _el$3
                })(),
            },
          ),
        )
        return _el$
      })(),
    container,
  )

  return {
    apply: (tick) => solidDbApply(rowModel, tick),
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

// Both arms are written as the automatic JSX runtime's output — byte-for-byte
// esbuild's `jsx: 'automatic'` emit (jsxImportSource `react` / `preact`) for
// the idiomatic component, diffed rather than assumed:
//
//   const Row = memo(function Row({ name, sample }) {
//     const q = sample.queries
//     return <tr><td className="dbname">{name}</td>
//       <td className="query-count"><span className={sample.countCls}>{sample.queryCount}</span></td>
//       <td className={q[0].cls}>{q[0].elapsed}</td> … ×5</tr>
//   })
//   <table><tbody>{tick.map((sample, i) => <Row key={i} name={DB_NAMES[i]} sample={sample} />)}</tbody></table>
//
// i.e. `jsxs` for a multi-child element with ONE `children` array, the key as
// `jsx`'s third argument, and the mapped array as a single `children` value —
// not `createElement` varargs, which no JSX app produces.

type DbQ = { cls: string; elapsed: string }

const ReactDbRow = React.memo(function ReactDbRowInner({
  name,
  sample,
}: {
  name: string
  sample: DbSample
}) {
  const q = sample.queries as DbQ[]
  return reactJsxs('tr', {
    children: [
      reactJsx('td', { className: 'dbname', children: name }),
      reactJsx('td', {
        className: 'query-count',
        children: reactJsx('span', { className: sample.countCls, children: sample.queryCount }),
      }),
      reactJsx('td', { className: q[0]!.cls, children: q[0]!.elapsed }),
      reactJsx('td', { className: q[1]!.cls, children: q[1]!.elapsed }),
      reactJsx('td', { className: q[2]!.cls, children: q[2]!.elapsed }),
      reactJsx('td', { className: q[3]!.cls, children: q[3]!.elapsed }),
      reactJsx('td', { className: q[4]!.cls, children: q[4]!.elapsed }),
    ],
  })
})

function reactTarget(container: HTMLElement): Promise<DbmonTarget> {
  let resolveSetter!: (set: (t: DbSample[]) => void) => void
  const setterPromise = new Promise<(t: DbSample[]) => void>((res) => {
    resolveSetter = res
  })

  function App({ onMounted }: { onMounted: (set: (t: DbSample[]) => void) => void }) {
    const [tick, setTickState] = React.useState<DbSample[]>([])
    React.useEffect(() => {
      onMounted(setTickState)
    }, [onMounted])
    return reactJsx('table', {
      children: reactJsx('tbody', {
        children: tick.map((sample, i) =>
          reactJsx(ReactDbRow, { name: DB_NAMES[i] as string, sample }, i),
        ),
      }),
    })
  }

  const root = ReactDOM.createRoot(container)
  root.render(reactJsx(App, { onMounted: resolveSetter }))

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
  const q = sample.queries as DbQ[]
  return preactJsxs('tr', {
    children: [
      preactJsx('td', { className: 'dbname', children: name }),
      preactJsx('td', {
        className: 'query-count',
        children: preactJsx('span', { className: sample.countCls, children: sample.queryCount }),
      }),
      preactJsx('td', { className: q[0]!.cls, children: q[0]!.elapsed }),
      preactJsx('td', { className: q[1]!.cls, children: q[1]!.elapsed }),
      preactJsx('td', { className: q[2]!.cls, children: q[2]!.elapsed }),
      preactJsx('td', { className: q[3]!.cls, children: q[3]!.elapsed }),
      preactJsx('td', { className: q[4]!.cls, children: q[4]!.elapsed }),
    ],
  })
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
    return preactJsx('table', {
      children: preactJsx('tbody', {
        children: tick.map((sample, i) =>
          preactJsxKeyed(PreactDbRow, { name: DB_NAMES[i] as string, sample }, i),
        ),
      }),
    })
  }

  preactRender(preactJsx(App, { onMounted: resolveSetter }), container)

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

// ─── Vue (h() — DIAGNOSTIC, not ranked) ──────────────────────────────────────
//
// The previous RANKING arm, kept as `Vue 3 (h())` so the cost of the
// hand-written render-function convention stays a measured number. `h()`
// produces vnodes with no patch flags and no block tree, which no Vue app built
// with its own toolchain ships — so the ranked `Vue 3` entry is the compiled
// template below.

function vueHTarget(container: HTMLElement): DbmonTarget {
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

// ─── Vue (template-compiled — the RANKING arm) ────────────────────────────────

/**
 * Vue on the render path a real Vue app actually ships. Published as `Vue 3`
 * (it was `Vue 3 (template)` beside an `h()` `Vue 3` until the 2026-09
 * competitor-fidelity pass, which made every Vue arm in the suite a compiled
 * template; the `h()` arm survives as the `Vue 3 (h())` diagnostic).
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
 * Both arms are published; only this one is ranked. Keeping the `h()` arm makes the
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
  'Vue 3 (h())',
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
      target = vueTemplateTarget(container)
      break
    case 'Vue 3 (h())':
      target = vueHTarget(container)
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
