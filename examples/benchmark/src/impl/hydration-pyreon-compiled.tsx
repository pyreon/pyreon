/**
 * COMPILED Pyreon hydration target — the same table as `pyreonApp` in
 * hydration-shared.ts, but as real JSX compiled by @pyreon/vite-plugin: rows
 * lower to `_tpl` templates, and hydration adopts the SSR rows through the
 * compiled binds (`runtime.tpl.adopt`) — what real Pyreon apps ship.
 * The SSR fixture side stays the h()-built twin (same structure; the k:/`$`
 * markers come from the runtime SSR of the same shape).
 */
import { For } from '@pyreon/core'
import type { PyreonRowState } from './hydration-shared'

export function PyreonCompiledApp(props: {
  rows: () => PyreonRowState[]
  isSelected: (id: number) => boolean
  onSelect: (id: number) => void
}) {
  return (
    <table>
      <tbody>
        <For each={() => props.rows()} by={(r: PyreonRowState) => r.id}>
          {(r: PyreonRowState) => (
            <tr class={() => (props.isSelected(r.id) ? 'danger' : '')}>
              <td>{String(r.id)}</td>
              <td>
                <a onClick={() => props.onSelect(r.id)}>{() => r.label()}</a>
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}
