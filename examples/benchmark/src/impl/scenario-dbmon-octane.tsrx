/**
 * Octane's dbmon arm — idiomatic TSRX (compiled React programming model).
 *
 * Octane is the nearest rival in the main row-list suite, yet it was absent
 * from every coverage-expansion scenario. This adds it to the one that
 * measures sustained wide updates.
 *
 * Like `octane.tsrx`, this is a deliberate line-for-line port of the React arm
 * in `scenario-dbmon.ts` — same state shape, same commit discipline
 * (`flushSync`) — with only the things Octane genuinely does differently:
 *
 *   - the list is the compiler's `@for (… ; index … ; key …)` block rather
 *     than `tick.map()` + a `key` prop;
 *   - the row is INLINE in the `@for` body rather than a `memo()`'d child
 *     component. `octane.tsrx` verified that `memo` is 3.8x SLOWER in Octane
 *     (the per-row props allocation plus `shallowEqualProps` costs more than
 *     the body it skips), so omitting it is Octane's model working as designed.
 *     It also cannot help here even in principle: every row changes every tick,
 *     so React's `memo` bails zero rows too.
 *
 * `{s.queryCount}` is raw, NOT `{String(s.queryCount)}` — load-bearing, and
 * VERIFIED for this shape rather than assumed from `octane.tsrx`. Compiling
 * this exact row body both ways (`compile(src, f, { mode: 'client' })` from
 * `octane/compiler`) emits `forBlock` flags 19 without the wrapper and 18 with
 * it: the wrapper clears a flag bit and moves surviving rows onto a heavier
 * update path. React/Preact/Svelte all pass the raw number here too, so this
 * matches them rather than favouring Octane.
 *
 * INDEX DEPENDENCE IS UNAVOIDABLE HERE, AND IS NOT A HANDICAP. Bit 3 of those
 * flags is `indexIndependent` (named in `reconcileKeyed`, octane/dist/runtime.js).
 * Reading `DB_NAMES[i]` clears it, because the body then depends on the item's
 * index. The only shape that keeps the bit set is
 * `@for (const [i, s] of tick.entries(); key i)`, which allocates an iterator
 * plus a tuple per row per tick — a cost no other arm pays.
 *
 * That flag is not measured here, and the claim being made is deliberately the
 * weaker, checkable one: what the bit CONTROLS is whether an item body must be
 * re-run because its index moved, and in dbmon no row ever moves (100 fixed
 * rows, same order every tick, replaced wholesale). So the branch it guards
 * cannot fire in this workload regardless of its value. Compiling both forms to
 * confirm the flags is in the probe history; timing them is not, and no such
 * comparison should be quoted from this file.
 *
 * The row name is re-read from `DB_NAMES[i]` every tick. That is not a
 * handicap — it is exactly what the other re-rendering arms do (React passes
 * `name: DB_NAMES[i]` per tick, Vue and Svelte read `DB_NAMES[i]` inside their
 * loops). The retained-node arms (Vanilla, Solid, Pyreon) set the name once at
 * construction because their model lets them; that difference is the models',
 * not the harness's.
 */
import { createRoot, flushSync, useEffect, useState } from 'octane'
import { DB_NAMES } from './scenario-shared'
import type { DbSample } from './scenario-shared'

export function DbmonApp(props: { onMounted: (set: (t: DbSample[]) => void) => void }) @{
  const [tick, setTick] = useState<DbSample[]>([])

  useEffect(() => {
    props.onMounted(setTick)
  }, [])

  <table>
    <tbody>
      @for (const s of tick; index i; key i) {
        <tr>
          <td class="dbname">{DB_NAMES[i]}</td>
          <td class="query-count"><span class={s.countCls}>{s.queryCount}</span></td>
          <td class={s.queries[0].cls}>{s.queries[0].elapsed}</td>
          <td class={s.queries[1].cls}>{s.queries[1].elapsed}</td>
          <td class={s.queries[2].cls}>{s.queries[2].elapsed}</td>
          <td class={s.queries[3].cls}>{s.queries[3].elapsed}</td>
          <td class={s.queries[4].cls}>{s.queries[4].elapsed}</td>
        </tr>
      }
    </tbody>
  </table>
}

/**
 * Mount and return the scenario's `DbmonTarget` contract.
 *
 * The setter is published post-commit through `useEffect` via a Promise — the
 * same shape `octane.tsrx` uses, and the reason is the same: the value is
 * unknown at bundle time, so Rollup cannot dead-code-eliminate the update
 * calls. `flushSync` forces the commit inside the timed region so the number is
 * reconcile+commit CPU rather than scheduler latency, matching the React arm.
 */
export function createOctaneDbmonTarget(container: HTMLElement) {
  const root = createRoot(container)

  let resolveSetter!: (set: (t: DbSample[]) => void) => void
  const setterPromise = new Promise<(t: DbSample[]) => void>((res) => {
    resolveSetter = res
  })

  root.render(DbmonApp, { onMounted: resolveSetter })

  return setterPromise.then((setTick) => ({
    apply(tick: DbSample[]) {
      flushSync(() => setTick(tick))
    },
    teardown: () => root.unmount(),
  }))
}
