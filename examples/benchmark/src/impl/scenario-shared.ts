/**
 * Shared data + DOM contracts for the COVERAGE-EXPANSION scenarios
 * (`?mode=scenarios`). One module so every framework consumes byte-identical
 * inputs and is verified against byte-identical expectations — the same
 * anti-drift discipline as `hydration-shared.ts`.
 *
 * Two scenarios live here, both chosen because the existing suite structurally
 * cannot measure them (it is nine ops on ONE flat keyed `<tr>` list):
 *
 *  - **dbmon** — sustained WIDE update. Every cell of every row changes on
 *    every tick, so nothing can be skipped. This is deliberately the shape
 *    where fine-grained reactivity has NO structural advantage: a signal graph
 *    wins by not doing work, and here there is no work to avoid. Expect it to
 *    be a close race or a loss; that is the point of measuring it.
 *  - **deep tree** — component INSTANTIATION at depth and CONTEXT propagation
 *    through it. Today every framework is measured on a two-level table, so
 *    per-component overhead and context fan-out are entirely unmeasured.
 */

// ─── Seeded RNG ──────────────────────────────────────────────────────────────
// Independent of runner.ts's RNG so scenario data is identical regardless of
// how many rows a previous op happened to draw.

function makeRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Scenario 1: dbmon (sustained wide update) ───────────────────────────────

/**
 * 100 rows × 5 query slots. Each row renders 12 dynamic values per tick
 * (query count + its class, then 5 × (elapsed text + class)) = 1,200 dynamic
 * values mutated per timed iteration.
 *
 * 100 rather than the original dbmon's 50: at 50 the median lands close enough
 * to Chromium's timer quantum that ops start reporting as unrankable ties (the
 * existing suite's `select row` is already stuck at the 0µs floor and cannot be
 * ranked). 100 keeps the measurement well clear of the floor while staying a
 * plausible dashboard size.
 *
 * The query SLOT COUNT is fixed at 5 — the original dbmon varies it, which
 * mixes list reconciliation back into the measurement. Reconciliation is
 * already covered by the main suite's swap/remove/append ops; holding the
 * structure fixed isolates the dimension that is actually missing (many
 * bindings per row updating at once).
 */
export const DB_COUNT = 100
export const QUERY_SLOTS = 5
/** Pre-built tick samples, rotated so no framework can short-circuit on an
 * unchanged value and no loop-invariant result can be hoisted. Mirrors the
 * rotated-input contract in `bench-ssr.ts`. */
export const DBMON_SAMPLES = 8

export interface QueryCell {
  /** Formatted elapsed time, e.g. "12.44". */
  elapsed: string
  /**
   * The COMPLETE `className` for the cell, e.g. `"query elapsed warn"`
   * (dbmon's threshold class: elapsed ≥ 10 → warn_long, ≥ 1 → warn, else
   * short). Pre-composed in the sample rather than assembled per framework so
   * nobody pays a template-literal concat of their own inside the timed
   * region — every framework performs the identical `className = <string>`
   * assignment.
   */
  cls: string
}

export interface DbSample {
  queryCount: number
  countCls: string
  queries: QueryCell[]
}

export const DB_NAMES: readonly string[] = Array.from(
  { length: DB_COUNT },
  (_, i) => `cluster${Math.floor(i / 10) + 1}.db${(i % 10) + 1}`,
)

function elapsedClass(elapsed: number): string {
  if (elapsed >= 10) return 'query elapsed warn_long'
  if (elapsed >= 1) return 'query elapsed warn'
  return 'query elapsed short'
}

function countClass(count: number): string {
  if (count >= 20) return 'label label-important'
  if (count >= 10) return 'label label-warning'
  return 'label label-success'
}

/** Build one full tick: a fresh sample for every row. */
function buildTick(rnd: () => number): DbSample[] {
  const out: DbSample[] = []
  for (let i = 0; i < DB_COUNT; i++) {
    const queryCount = Math.floor(rnd() * 30)
    const queries: QueryCell[] = []
    for (let q = 0; q < QUERY_SLOTS; q++) {
      const elapsed = rnd() * 15
      queries.push({ elapsed: elapsed.toFixed(2), cls: elapsedClass(elapsed) })
    }
    out.push({ queryCount, countCls: countClass(queryCount), queries })
  }
  return out
}

/**
 * `DBMON_SAMPLES` complete ticks, generated once at module load from a fixed
 * seed. Every framework applies the SAME sequence in the SAME order, so the
 * only variable is the framework's update machinery.
 */
export const DBMON_TICKS: DbSample[][] = (() => {
  const rnd = makeRng(0x5bf03635)
  return Array.from({ length: DBMON_SAMPLES }, () => buildTick(rnd))
})()

/**
 * Per-iteration correctness gate. Reads back a spread of cells from the real
 * DOM and compares them to the tick that was just applied.
 *
 * This is the load-bearing half of the scenario: a framework that batches the
 * update past the timer, or silently drops a cell, fails the run instead of
 * posting a fast number. Checks the count cell AND a query cell's text AND its
 * class on rows 0, 37 and 99 — text-only would miss a framework that updates
 * text but not the threshold class.
 *
 * It ALSO asserts the row's total cell count and its static `dbname` text.
 * Neither is touched by a tick, so it would be easy to argue they do not need
 * checking — that argument is exactly backwards. An arm that never renders the
 * name, or renders one fewer `<td>`, does strictly LESS DOM work than its
 * rivals on every mount and would post a faster number for a structurally
 * unfair reason. The name is also the one value the re-rendering arms
 * (React/Preact/Vue/Svelte/Octane) genuinely re-read from `DB_NAMES[i]` each
 * tick while the retained-node arms (Vanilla/Solid/Pyreon) set it once, so it
 * is the single most load-bearing thing to pin down across models.
 */
export function verifyDbmon(container: HTMLElement, tick: DbSample[]): void {
  const rows = container.querySelectorAll('tbody > tr')
  if (rows.length !== DB_COUNT) {
    throw new Error(`[dbmon] expected ${DB_COUNT} rows, got ${rows.length}`)
  }
  for (const i of [0, 37, DB_COUNT - 1]) {
    const row = rows[i] as HTMLElement
    const sample = tick[i] as DbSample

    // Structural equivalence: 1 name + 1 count + QUERY_SLOTS query cells.
    const allCells = row.querySelectorAll('td')
    if (allCells.length !== QUERY_SLOTS + 2) {
      throw new Error(
        `[dbmon] row ${i}: expected ${QUERY_SLOTS + 2} <td> cells, got ${allCells.length} — this arm does not render the same DOM as the others`,
      )
    }
    const nameEl = row.querySelector('td.dbname')
    if (nameEl?.textContent !== DB_NAMES[i]) {
      throw new Error(
        `[dbmon] row ${i} dbname: expected "${DB_NAMES[i]}", got "${nameEl?.textContent}"`,
      )
    }

    const countEl = row.querySelector('.query-count > span')
    if (countEl?.textContent !== String(sample.queryCount)) {
      throw new Error(
        `[dbmon] row ${i} count: expected "${sample.queryCount}", got "${countEl?.textContent}" — framework did not commit before the timer ended`,
      )
    }
    if (countEl.className !== sample.countCls) {
      throw new Error(
        `[dbmon] row ${i} count class: expected "${sample.countCls}", got "${countEl.className}"`,
      )
    }
    const cells = row.querySelectorAll('td.query')
    if (cells.length !== QUERY_SLOTS) {
      throw new Error(`[dbmon] row ${i}: expected ${QUERY_SLOTS} query cells, got ${cells.length}`)
    }
    for (let q = 0; q < QUERY_SLOTS; q++) {
      const cell = cells[q] as HTMLElement
      const want = sample.queries[q] as QueryCell
      if (cell.textContent !== want.elapsed) {
        throw new Error(
          `[dbmon] row ${i} query ${q}: expected "${want.elapsed}", got "${cell.textContent}"`,
        )
      }
      if (cell.className !== want.cls) {
        throw new Error(
          `[dbmon] row ${i} query ${q} class: expected "${want.cls}", got "${cell.className}"`,
        )
      }
    }
  }
}

// ─── Scenario 2: deep component tree + context propagation ───────────────────

/**
 * A BALANCED BINARY tree of `TREE_DEPTH` levels: 2^depth − 1 total component
 * instances, of which 2^(depth−1) are leaves.
 *
 * At depth 11 that is 2,047 components with 1,024 leaves — big enough that
 * per-component overhead is measurable well above the timer quantum, small
 * enough that the untimed mount does not dominate the driver's wall clock.
 *
 * Only LEAVES read the context. The 1,023 interior components exist precisely
 * so the benchmark can see whether a framework walks them on a context change
 * (vdom fibers must be traversed to find consumers) or delivers straight to
 * the subscribed bindings (signal graphs). That distinction is invisible in a
 * two-level table, which is why the current suite cannot measure it.
 */
export const TREE_DEPTH = 11
export const TREE_LEAVES = 2 ** (TREE_DEPTH - 1) // 1024
export const TREE_NODES = 2 ** TREE_DEPTH - 1 // 2047

/** Context values cycled by the propagation op — rotated so each timed run is
 * a REAL change, never a no-op re-set of the current value. */
export const CONTEXT_VALUES: readonly string[] = ['alpha', 'bravo', 'charlie', 'delta']

/** Verify the deep tree mounted with the expected leaf count. */
export function verifyTreeMounted(container: HTMLElement): void {
  const leaves = container.querySelectorAll('.leaf')
  if (leaves.length !== TREE_LEAVES) {
    throw new Error(`[deep-tree] expected ${TREE_LEAVES} leaves, got ${leaves.length}`)
  }
}

/**
 * Verify EVERY leaf reflects the current context value.
 *
 * Checking all 1,024 (not a sample) is deliberate: a framework that propagates
 * to only part of the tree — the exact failure mode this scenario exists to
 * detect — would slip past a spot check on the first and last leaf.
 */
export function verifyContextPropagated(container: HTMLElement, value: string): void {
  const leaves = container.querySelectorAll('.leaf')
  if (leaves.length !== TREE_LEAVES) {
    throw new Error(`[deep-tree] expected ${TREE_LEAVES} leaves, got ${leaves.length}`)
  }
  for (let i = 0; i < leaves.length; i++) {
    const text = (leaves[i] as HTMLElement).textContent
    if (text !== value) {
      throw new Error(
        `[deep-tree] leaf ${i}: expected "${value}", got "${text}" — context did not propagate to the whole tree before the timer ended`,
      )
    }
  }
}
