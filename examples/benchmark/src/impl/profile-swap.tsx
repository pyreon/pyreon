/**
 * Swap-rows profiling target — mounts three arms side by side, each in its own
 * `bench-fixture` host, with the EXACT markup and update shape the row board
 * benches:
 *
 *  - `pyreon`  — `impl/pyreon.tsx` (For + per-row label signal + createSelector
 *                class binding; the swap copies `rows()` and sets it)
 *  - `vapor`   — the real Vue 3.6 Vapor RC SFC from `impl/vue-vapor.ts`
 *                (`rows.value = [...]` then `await nextTick()`)
 *  - `vanilla` — `impl/vanilla.ts`'s swap (three array swaps + two
 *                `insertBefore`)
 *
 * `bench-swapprofile.ts` drives it in two phases: an interleaved wall-clock
 * phase (the forced layout flush inside the timed window, exactly like
 * `bench()` in runner.ts), and a CPU-profile phase that runs ONE arm per
 * profile so whole-profile attribution needs no frame naming — Vapor's RC
 * runtime is a minified prod build whose own frames carry no usable names, and
 * its flush runs in a microtask outside any caller frame.
 *
 * NOT part of the timed fair bench — loaded only behind `?profileSwap=1`.
 */
import { For } from '@pyreon/core'
import { createSelector, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { createVaporApp, nextTick } from 'virtual:vue-vapor-runtime'
import RowsVapor, { onRowsVaporReady } from 'virtual:rows-vue-vapor'
import type { NumericText, Row } from '../runner'
import { buildRows, buildRowsWith, resetRng } from '../runner'

type ReactiveRow = { id: number; label: ReturnType<typeof signal<string>> }
type Driver = {
  swap: () => void | Promise<void>
  flush: () => void
  ids: () => number[]
  /** Replace all rows `n` times (the board's create/replace history), ending at ROWS fresh rows. */
  churn: (n: number) => void | Promise<void>
}

const ROWS = 1_000

function idsOf(host: HTMLElement): number[] {
  return [...host.querySelectorAll('tr')].map((tr) => Number(tr.firstChild?.textContent))
}

function setupPyreon(host: HTMLElement): Driver {
  const rows = signal<ReactiveRow[]>([])
  const selectedId = signal<number | null>(null)
  const isSelected = createSelector(selectedId)
  mount(
    <table>
      <tbody>
        <For each={rows} by={(row: ReactiveRow) => row.id}>
          {(row: ReactiveRow) => (
            <tr class={() => (isSelected(row.id) ? 'selected' : '')}>
              <td>{row.id}</td>
              <td>{() => row.label()}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>,
    host,
  )
  rows.set(buildRowsWith<ReactiveRow>(ROWS, (id, label) => ({ id, label: signal(label) })))
  // Named so a profile can be read as a tree rooted at the op.
  function __swapPyreon(): void {
    const current = [...rows()]
    const a = current[1] as ReactiveRow
    current[1] = current[998] as ReactiveRow
    current[998] = a
    rows.set(current)
  }
  const churn = (n: number) => {
    for (let i = 0; i < n; i++) {
      rows.set(buildRowsWith<ReactiveRow>(ROWS, (id, label) => ({ id, label: signal(label) })))
      host.getBoundingClientRect()
    }
  }
  return { swap: __swapPyreon, flush: () => host.getBoundingClientRect(), ids: () => idsOf(host), churn }
}

async function setupVapor(host: HTMLElement): Promise<Driver> {
  const handles = new Promise<{ rows: { value: Row[] } }>((r) => onRowsVaporReady(r))
  createVaporApp(RowsVapor).mount(host)
  const { rows } = await handles
  let currentRows = buildRows(ROWS)
  rows.value = currentRows
  await nextTick()
  async function __swapVapor(): Promise<void> {
    const updated = [...currentRows]
    const tmp = updated[1] as Row
    updated[1] = updated[998] as Row
    updated[998] = tmp
    rows.value = currentRows = updated
    await nextTick()
  }
  const churn = async (n: number) => {
    for (let i = 0; i < n; i++) {
      rows.value = currentRows = buildRows(ROWS)
      await nextTick()
      host.getBoundingClientRect()
    }
  }
  return { swap: __swapVapor, flush: () => host.getBoundingClientRect(), ids: () => idsOf(host), churn }
}

function setupVanilla(host: HTMLElement): Driver {
  const tpl = document.createElement('tr')
  tpl.innerHTML = '<td></td><td></td>'
  const rows = buildRows(ROWS)
  const table = document.createElement('table')
  const tbody = document.createElement('tbody')
  const trs: HTMLElement[] = new Array(ROWS)
  const labelTds: HTMLElement[] = new Array(ROWS)
  for (let i = 0; i < ROWS; i++) {
    const tr = tpl.cloneNode(true) as HTMLElement
    const td1 = tr.firstChild as HTMLElement
    const td2 = td1.nextSibling as HTMLElement
    ;(td1 as unknown as NumericText).textContent = (rows[i] as Row).id
    td2.textContent = (rows[i] as Row).label
    tbody.appendChild(tr)
    trs[i] = tr
    labelTds[i] = td2
  }
  table.appendChild(tbody)
  host.appendChild(table)
  function __swapVanilla(): void {
    const tmp = rows[1] as Row
    rows[1] = rows[998] as Row
    rows[998] = tmp
    const tmpTr = trs[1] as HTMLElement
    trs[1] = trs[998] as HTMLElement
    trs[998] = tmpTr
    const tmpTd = labelTds[1] as HTMLElement
    labelTds[1] = labelTds[998] as HTMLElement
    labelTds[998] = tmpTd
    tbody.insertBefore(trs[1] as HTMLElement, trs[2] as HTMLElement)
    tbody.insertBefore(trs[998] as HTMLElement, (trs[999] as HTMLElement | undefined) ?? null)
  }
  // Vanilla's renderAll rebuilds the table from scratch, so its board history
  // never touches the live tbody it swaps in — churn is a no-op by construction.
  return { swap: __swapVanilla, flush: () => host.getBoundingClientRect(), ids: () => idsOf(host), churn: () => {} }
}

export async function setupSwapProfile(makeHost: () => HTMLElement): Promise<void> {
  resetRng()
  const drivers: Record<string, Driver> = {
    pyreon: setupPyreon(makeHost()),
    vanilla: setupVanilla(makeHost()),
    vapor: await setupVapor(makeHost()),
  }
  ;(globalThis as Record<string, unknown>).__swapBench = drivers
}
