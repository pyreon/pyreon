// @ts-nocheck — `key` on a DOM element is typed by the JSX runtime, the rows are plain objects
/**
 * Compiled by the REAL Pyreon transform (see `../compiled-fixtures-plugin.ts`) for
 * `keyed-root-template.browser.test.tsx`: a keyed `.map()` whose row root is
 * templated with its key on the item.
 */
import type { Signal } from '@pyreon/reactivity'

export interface KeyedRow {
  id: number
  label: Signal<string>
  done: Signal<boolean>
}

export function KeyedTable(props: { rows: () => KeyedRow[] }) {
  return (
    <table>
      <tbody>
        {props.rows().map((row) => (
          <tr key={row.id}>
            <td class="id">{row.id}</td>
            <td class="label">
              <input value={row.label()} />
            </td>
            <td class="status">{row.done() ? <span>done</span> : <em>todo</em>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
