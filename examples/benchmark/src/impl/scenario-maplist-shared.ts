/**
 * Shared data + DOM contract for the `maplist` scenario (`scenario-maplist.ts`).
 *
 * Every arm renders the SAME DOM from the SAME plain rows, and is verified
 * against the SAME expectations, so the only variable is the framework:
 *
 *   <div class="ml">
 *     <table><tbody>
 *       <tr>                                   ← one per row, keyed by `id`
 *         <td class="id">{id}</td>
 *         <td class="label">{label}</td>
 *         <td class="status">{done ? <span class="done">done</span> : <em class="todo">todo</em>}</td>
 *       </tr>
 *     </tbody></table>
 *     {rows.length === 0 ? <p class="empty">No rows</p> : null}
 *   </div>
 *
 * Two source shapes the rest of the suite never contains live here on purpose:
 * a keyed `.map()` of JSX rows inside an element, and conditional JSX in a slot
 * (the per-row status cell and the list's empty state).
 */
import { buildRowsWith } from '../runner'

/** One row as the harness owns it. Each arm converts it to its own model. */
export interface PlainRow {
  id: number
  label: string
  done: boolean
}

export const ML_ROWS = 1_000
/** Row index touched by the single-row ops (the krausest "row 500" convention). */
export const ML_TARGET = 499
/** Swap pair — the same `1 ↔ n-2` rule as the row board's `swap rows`. */
export const ML_SWAP_A = 1
export const ML_SWAP_B = ML_ROWS - 2
/**
 * Cycles per batch sample for the single-row ops (see `BenchOptions.batchK` in
 * `runner.ts`). The batch twin is the clock-independent cross-check of the
 * per-op row. 200 cycles keeps the slowest arm (a whole-list re-render per
 * write) under ~4 s per sample.
 */
export const ML_K = 200

export const ML_UPDATED_SUFFIX = ' !!!'

/**
 * `count` fresh rows from the runner's seeded generator (ids never repeat, so
 * every build is new keys). `done` is a pure function of the id, so the status
 * cells mix both branches deterministically.
 */
export function buildPlainRows(count: number): PlainRow[] {
  return buildRowsWith<PlainRow>(count, (id, label) => ({ id, label, done: id % 3 === 0 }))
}

function fail(detail: string): never {
  throw new Error(`[maplist] correctness gate failed — ${detail}`)
}

function rowList(container: HTMLElement): HTMLCollection {
  const tbody = container.querySelector('.ml tbody')
  if (tbody === null) fail('no `.ml tbody` rendered')
  return tbody.children
}

/** Indices checked on every verify: both ends, the swap pair and the target. */
function probeIndices(n: number): number[] {
  const out = new Set<number>()
  for (const i of [0, ML_SWAP_A, ML_TARGET, ML_TARGET + 1, n - 2, n - 1]) {
    if (i >= 0 && i < n) out.add(i)
  }
  return [...out]
}

/**
 * Full DOM check against the harness model. Runs OUTSIDE every timed region.
 *
 * Asserts the row count, the empty-state slot (present exactly when the list is
 * empty), and for a spread of rows: the cell count, the id, the label and the
 * status branch (exactly one element child, the right tag and class, the right
 * text). The status check is what makes the conditional slot load-bearing: an
 * arm that rendered the wrong branch, or both, fails here.
 */
export function verifyMapList(container: HTMLElement, model: readonly PlainRow[]): void {
  const rows = rowList(container)
  if (rows.length !== model.length) fail(`expected ${model.length} rows, got ${rows.length}`)
  const empty = container.querySelectorAll('.ml > p.empty')
  if (model.length === 0) {
    if (empty.length !== 1 || empty[0]?.textContent !== 'No rows') {
      fail(`empty list must render exactly one <p class="empty">No rows</p>, got ${empty.length}`)
    }
  } else if (empty.length !== 0) {
    fail(`non-empty list (${model.length} rows) still renders the empty state`)
  }
  for (const i of probeIndices(model.length)) {
    const tr = rows[i] as HTMLElement
    const want = model[i] as PlainRow
    if (tr.tagName !== 'TR' || tr.children.length !== 3) {
      fail(`row ${i}: expected a <tr> with 3 cells, got <${tr.tagName.toLowerCase()}> with ${tr.children.length}`)
    }
    const [idCell, labelCell, statusCell] = [...tr.children] as HTMLElement[]
    if (idCell?.className !== 'id' || idCell.textContent !== String(want.id)) {
      fail(`row ${i} id: expected "${want.id}", got "${idCell?.textContent}"`)
    }
    if (labelCell?.className !== 'label' || labelCell.textContent !== want.label) {
      fail(`row ${i} label: expected ${JSON.stringify(want.label)}, got ${JSON.stringify(labelCell?.textContent)}`)
    }
    const branch = statusCell?.children
    const wantTag = want.done ? 'SPAN' : 'EM'
    const wantCls = want.done ? 'done' : 'todo'
    if (
      statusCell?.className !== 'status' ||
      branch?.length !== 1 ||
      branch[0]?.tagName !== wantTag ||
      branch[0].className !== wantCls ||
      statusCell.textContent !== wantCls
    ) {
      fail(
        `row ${i} status: expected one <${wantTag.toLowerCase()} class="${wantCls}">, got ${JSON.stringify(statusCell?.innerHTML)}`,
      )
    }
  }
}

/**
 * O(1)-ish batch probes for the single-row ops: they read the CURRENT target
 * row through `children[i]` every call (never a cached element, because an arm
 * that re-creates rows would leave a cached one detached and stale), and assert
 * the effect the op claims, not a proxy for it.
 */
export function labelUpdatedProbe(container: HTMLElement): number {
  const tr = container.querySelector('.ml tbody')?.children[ML_TARGET]
  return tr?.children[1]?.textContent?.endsWith(ML_UPDATED_SUFFIX) ? 1 : 0
}

export function statusDoneProbe(container: HTMLElement): number {
  const tr = container.querySelector('.ml tbody')?.children[ML_TARGET]
  return tr?.children[2]?.firstElementChild?.className === 'done' ? 1 : 0
}
