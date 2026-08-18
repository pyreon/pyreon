/**
 * Clear-rows profiling target — mounts the EXACT markup `impl/pyreon.tsx`
 * benches (same For + per-row label signal + createSelector class binding)
 * and exposes named driver functions on `globalThis` so `bench-clearprofile.ts`
 * can attribute CPU-profile samples to a specific op via subtree walks.
 *
 * NOT part of the timed fair bench — measurement scaffolding only, loaded
 * exclusively behind `?profileClear=1`.
 */
import { For } from '@pyreon/core'
import { createSelector, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { buildRowsWith, resetRng } from '../runner'

type ReactiveRow = { id: number; label: ReturnType<typeof signal<string>> }

export function setupClearProfile(container: HTMLElement): void {
  resetRng()
  const rows = signal<ReactiveRow[]>([])
  const selectedId = signal<number | null>(null)
  const isSelected = createSelector(selectedId)

  mount(
    <table>
      <tbody>
        <For each={rows} by={(row: ReactiveRow) => row.id}>
          {(row: ReactiveRow) => (
            <tr class={() => (isSelected(row.id) ? 'selected' : '')}>
              {/* raw number — mirrors impl/pyreon.tsx exactly */}
              <td>{row.id}</td>
              <td>{() => row.label()}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>,
    container,
  )

  const mkRows = (n: number) =>
    buildRowsWith<ReactiveRow>(n, (id, label) => ({ id, label: signal(label) }))

  // NAMED function statements so profile nodes carry stable functionNames the
  // driver can key subtree attribution on.
  function __createOnly(n: number): void {
    rows.set(mkRows(n))
  }
  function __clearOnly(): void {
    rows.set([])
  }
  function __replaceOnly(n: number): void {
    rows.set(mkRows(n))
  }

  ;(globalThis as Record<string, unknown>).__clearBench = {
    create: __createOnly,
    clear: __clearOnly,
    replace: __replaceOnly,
    rowCount: () => container.querySelectorAll('tr').length,
  }
}
