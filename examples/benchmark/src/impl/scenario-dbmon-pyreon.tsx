/**
 * Pyreon's dbmon component — in its own `.tsx` so the Pyreon compiler lowers it
 * to `_tpl()` cloneNode + fine-grained binds, which is what real Pyreon apps
 * ship. Hand-writing `h()` in the shared `.ts` scenario file would measure the
 * SLOWER runtime path and quietly handicap Pyreon; same reason
 * `hydration-pyreon-compiled.tsx` exists.
 *
 * Per-cell signals are the idiomatic model here: the row LIST never changes
 * (100 fixed rows), only cell values do, so a Pyreon author binds each cell to
 * its own signal rather than replacing an array.
 */
import { For } from '@pyreon/core'
import type { signal } from '@pyreon/reactivity'

type Sig<T> = ReturnType<typeof signal<T>>

export interface PyreonDbCell {
  elapsed: Sig<string>
  cls: Sig<string>
}

export interface PyreonDbRow {
  name: string
  count: Sig<number>
  countCls: Sig<string>
  queries: PyreonDbCell[]
}

/**
 * Five query cells are written out literally rather than looped. A fixed-column
 * dashboard is what a real template looks like, and it keeps every framework on
 * the same footing — a nested list primitive here would add reconciliation
 * machinery for a structure that never changes.
 */
export function PyreonDbmon(props: { rows: () => PyreonDbRow[] }) {
  return (
    <table>
      <tbody>
        <For each={props.rows} by={(row: PyreonDbRow) => row.name}>
          {(row: PyreonDbRow) => (
            <tr>
              <td class="dbname">{row.name}</td>
              <td class="query-count">
                <span class={() => row.countCls()}>{() => row.count()}</span>
              </td>
              <td class={() => (row.queries[0] as PyreonDbCell).cls()}>
                {() => (row.queries[0] as PyreonDbCell).elapsed()}
              </td>
              <td class={() => (row.queries[1] as PyreonDbCell).cls()}>
                {() => (row.queries[1] as PyreonDbCell).elapsed()}
              </td>
              <td class={() => (row.queries[2] as PyreonDbCell).cls()}>
                {() => (row.queries[2] as PyreonDbCell).elapsed()}
              </td>
              <td class={() => (row.queries[3] as PyreonDbCell).cls()}>
                {() => (row.queries[3] as PyreonDbCell).elapsed()}
              </td>
              <td class={() => (row.queries[4] as PyreonDbCell).cls()}>
                {() => (row.queries[4] as PyreonDbCell).elapsed()}
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}
