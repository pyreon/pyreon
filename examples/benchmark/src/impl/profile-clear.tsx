/**
 * Clear-rows profiling target — mounts the EXACT markup `impl/pyreon.tsx`
 * benches (same For + per-row label signal + createSelector class binding)
 * and exposes named driver functions on `globalThis` so `bench-clearprofile.ts`
 * can attribute CPU-profile samples to a specific op via subtree walks.
 *
 * NOT part of the timed fair bench — measurement scaffolding only, loaded
 * exclusively behind `?profileClear=1`.
 */
import { For, h } from '@pyreon/core'
import { createSelector, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { buildRowsWith, resetRng } from '../runner'
import { type PyreonMapRow, PyreonForList, PyreonMapList } from './scenario-maplist-pyreon'

type ReactiveRow = { id: number; label: ReturnType<typeof signal<string>> }

export function setupClearProfile(container: HTMLElement, target: string | null = null): void {
  resetRng()
  if (target === 'maplist-for' || target === 'maplist-map') {
    setupMapListProfile(container, target === 'maplist-for' ? PyreonForList : PyreonMapList)
    return
  }
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

/**
 * The `maplist` scenario's Pyreon arms (`?profileClear=maplist-for` /
 * `maplist-map`): the same components and row model `scenario-maplist.ts`
 * times, behind the same named drivers, plus `__swapOnly` / `__removeOnly`.
 */
function setupMapListProfile(
  container: HTMLElement,
  List: (props: { rows: () => PyreonMapRow[] }) => unknown,
): void {
  const rows = signal<PyreonMapRow[]>([])
  // `h()` with the signal itself, exactly as `scenario-maplist.ts` mounts it
  // (JSX would hand the component the signal's VALUE through a getter).
  mount(h(List as never, { rows }), container)
  const mkRows = (n: number) =>
    buildRowsWith<PyreonMapRow>(n, (id, label) => ({ id, label: signal(label), done: signal(id % 3 === 0) }))

  function __createOnly(n: number): void {
    rows.set(mkRows(n))
  }
  function __clearOnly(): void {
    rows.set([])
  }
  function __replaceOnly(n: number): void {
    rows.set(mkRows(n))
  }
  function __swapOnly(): void {
    const next = rows.peek().slice()
    const a = next[1] as PyreonMapRow
    next[1] = next[next.length - 2] as PyreonMapRow
    next[next.length - 2] = a
    rows.set(next)
  }
  function __removeOnly(): void {
    const next = rows.peek().slice()
    next.splice(499, 1)
    rows.set(next)
  }

  ;(globalThis as Record<string, unknown>).__clearBench = {
    create: __createOnly,
    clear: __clearOnly,
    replace: __replaceOnly,
    swap: __swapOnly,
    remove: __removeOnly,
    rowCount: () => container.querySelectorAll('tr').length,
  }
}
