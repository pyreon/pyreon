/**
 * Pyreon arms of the `maplist` scenario, as IDIOMATIC source compiled by the
 * real Pyreon compiler (this is a `.tsx` file, so `@pyreon/vite-plugin` owns
 * it). Do not hand-lower these: the point of the scenario is to measure what
 * the compiler does with the two shapes below.
 *
 *  - `PyreonMapList` — a keyed `.map()` of JSX rows inside a templated
 *    element, with conditional JSX in two slots (each row's status cell and the
 *    list's empty state). At runtime the keyed `.map()` goes through the keyed
 *    reconciler (`mountKeyedList` → `mountFor`), and the compiler decides how
 *    much of each row it can template.
 *  - `PyreonForList` — the same DOM written with `<For>`, the documented list
 *    primitive, kept alongside so `.map()` vs `<For>` is visible on one board.
 *
 * Rows carry a signal per mutable field (`label`, `done`), the same fine-grained
 * model the row board's Pyreon arm uses, so a single-row update is one signal
 * write in both arms.
 */
import { For } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'

export interface PyreonMapRow {
  id: number
  label: Signal<string>
  done: Signal<boolean>
}

export function PyreonMapList(props: { rows: () => PyreonMapRow[] }) {
  return (
    <div class="ml">
      <table>
        <tbody>
          {props.rows().map((row) => (
            <tr key={row.id}>
              {/* raw number — see runner.ts "Row-id rendering rule" */}
              <td class="id">{row.id}</td>
              <td class="label">{row.label()}</td>
              <td class="status">{row.done() ? <span class="done">done</span> : <em class="todo">todo</em>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.rows().length === 0 ? <p class="empty">No rows</p> : null}
    </div>
  )
}

export function PyreonForList(props: { rows: () => PyreonMapRow[] }) {
  return (
    <div class="ml">
      <table>
        <tbody>
          <For each={props.rows} by={(row: PyreonMapRow) => row.id}>
            {(row: PyreonMapRow) => (
              <tr>
                <td class="id">{row.id}</td>
                <td class="label">{row.label()}</td>
                <td class="status">{row.done() ? <span class="done">done</span> : <em class="todo">todo</em>}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      {props.rows().length === 0 ? <p class="empty">No rows</p> : null}
    </div>
  )
}
