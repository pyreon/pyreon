import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { effect, signal, untrack } from '@pyreon/reactivity'
import {
  constructTable,
  type RowData,
  type Table,
  type TableFeatures,
  type TableOptions,
} from '@tanstack/table-core'
import { pyreonReactivity } from './reactivity'

/**
 * Table options as a FUNCTION, so signal reads inside (data, columns, state)
 * are tracked and re-sync the table when any of them changes.
 */
export type UseTableOptions<
  TFeatures extends TableFeatures,
  TData extends RowData,
> = () => TableOptions<TFeatures, TData>

/**
 * Fine-grained bridge for a `useTable` result, keyed by the returned `Table`.
 * `flexRenderCell` uses it to subscribe to ONLY the row's own signal instead of
 * the whole row-model atom, so an in-place data edit re-runs just the cells of
 * the rows whose `original` reference changed.
 *
 * v9's atoms are per-STATE-SLICE, not per-row, so this row-level layer is still
 * the adapter's own contribution — but it is far smaller than the v8 one,
 * because table STATE changes now notify natively (v8 had to diff whole
 * `TableState` objects by hand to tell a real change from a no-op re-emission).
 *
 * A `WeakMap` so the entry dies with the table — no manual cleanup.
 */
interface RowSignalBridge {
  /** Get-or-create this row's version signal. Call it to subscribe. */
  rowSignal(rowId: string): Signal<number>
}
const rowSignalRegistry = new WeakMap<object, RowSignalBridge>()

/** @internal — used by `flexRenderCell`. */
export function _getRowSignalBridge(table: object): RowSignalBridge | undefined {
  return rowSignalRegistry.get(table)
}

/**
 * Exported for unit test only — `index.ts` re-exports by NAME, so this does not
 * widen the package's public surface. Tested directly because it is pure and
 * its branches (absent list, missing `id`/`accessorKey`, non-string `header`)
 * are the shapes a real column list hits, but are awkward to drive through a
 * mounted table.
 *
 * A stable, structural key for a column list — the identity of each column and
 * the order they appear in. Used instead of an array-identity check so that an
 * inline `columns: [...]` literal (recreated on every options run) is not
 * mistaken for a real column change.
 */
export function columnSignature(columns: readonly unknown[] | undefined): string {
  if (!columns) return ''
  let out = ''
  for (const column of columns) {
    const c = column as { id?: string; accessorKey?: string | number; header?: unknown }
    out += `${c.id ?? ''}\u0000${String(c.accessorKey ?? '')}\u0000${typeof c.header === 'string' ? c.header : ''}\u0000`
  }
  return out
}

/**
 * Create a reactive TanStack Table v9 instance.
 *
 * Options are passed as a function so reactive signals (data, columns, state)
 * can be read inside; the table re-syncs automatically when any change.
 *
 * The returned `Table` is a STABLE instance whose state lives in Pyreon signals
 * (via the v9 `coreReactivityFeature` bindings), so reading it inside any
 * reactive scope — a JSX accessor, an `effect`, a `computed` — subscribes
 * natively. There is no `Computed<Table>` wrapper and no `table()` call: the
 * v8 adapter needed those only because v8 had no reactivity seam.
 *
 * @example
 * const data = signal([{ name: 'Alice' }])
 * const features = tableFeatures({
 *   rowSortingFeature,
 *   sortedRowModel: createSortedRowModel(),
 * })
 * const table = useTable(() => ({
 *   features,
 *   data: data(),
 *   columns: [{ accessorKey: 'name', header: 'Name' }],
 * }))
 * // In a template: {() => table.getRowModel().rows.length}
 */
export function useTable<TFeatures extends TableFeatures, TData extends RowData>(
  options: UseTableOptions<TFeatures, TData>,
): Table<TFeatures, TData> {
  const initial = untrack(options)

  // Pyreon's bindings go in FIRST so a caller can still override
  // `coreReactivityFeature` deliberately — the convention the official React
  // adapter uses.
  const table = constructTable<TFeatures, TData>({
    ...initial,
    features: {
      coreReactivityFeature: pyreonReactivity(),
      ...initial.features,
    },
  })

  // ── Fine-grained per-row invalidation ──────────────────────────────────────
  const rowVersions = new Map<string, Signal<number>>()
  let prevOriginals = new Map<string, unknown>()
  let firstSync = true

  const getRowSignal = (rowId: string): Signal<number> => {
    let s = rowVersions.get(rowId)
    if (s === undefined) {
      s = signal(0)
      rowVersions.set(rowId, s)
    }
    return s
  }
  rowSignalRegistry.set(table, { rowSignal: getRowSignal })

  // Sync user options into the table whenever a tracked signal inside
  // `options()` changes.
  const sync = effect(() => {
    const userOptions = options()
    // `setOptions((prev) => …)` READS the options atom. Reading it inside this
    // tracked scope would subscribe the effect to the very atom it is about to
    // write — a self-retriggering loop (empirically: unbounded re-runs). So the
    // write is untracked; the tracked part is `options()` above.
    untrack(() => {
      table.setOptions((prev) => ({ ...prev, ...userOptions }))
    })
  })

  // Maintain per-row signals from the live row model.
  //
  // `flexRenderCell` subscribes ONLY to a row's own signal, so this effect owns
  // every invalidation decision. It tracks the row model and the column list:
  //
  //   structure or columns changed         → bump EVERY live row (such a change
  //       can affect any rendered cell: correct-by-over-invalidation)
  //   otherwise, a pure in-place data edit → bump only the rows whose `original`
  //       reference actually changed (the fine-grained path)
  //
  // Table STATE is deliberately NOT tracked here. Any state change that can
  // alter which rows or cells render (sort, filter, pagination) already flows
  // through the row model above; ones that cannot (selection, visibility) are
  // read directly by the cells that care, and those reads are themselves atom
  // subscriptions. Tracking state here instead makes a data edit's auto-resets
  // re-fire this effect and cascade into repeated bump-alls (measured: 30
  // cell re-runs where 2 are correct).
  //
  // v9 also retires the v8 hand-written `TableState` structural diff: slices are
  // atoms now, so a no-op state re-emission never propagates in the first place.
  let prevRowIds: string[] = []
  let prevColumns: string | undefined
  const rowSync = effect(() => {
    const rows = table.getRowModel().rows
    // Columns are compared by STRUCTURAL SIGNATURE, not by array identity.
    // Identity churns on every sync for the (very common) case of an inline
    // `columns: [...]` literal inside the options function — comparing
    // references there reports "columns changed" on every data edit and
    // coarse-invalidates the whole table, destroying fine-grained updates.
    //
    // `groupedColumnMode` is part of the signature because it changes the LEAF
    // COLUMN list (`getAllLeafColumns` reads it) without touching `columns` or
    // the row ids — the one options-level input to a row's visible cell list
    // that neither the row model nor the column signature would otherwise
    // cover (`visibleCells` subscribes to the per-row signal, so this bump is
    // what keeps its cell lists honest on that change).
    const columns =
      columnSignature(table.options.columns) +
      `${String((table.options as { groupedColumnMode?: unknown }).groupedColumnMode ?? '')}`

    const currentIds = rows.map((r) => r.id)
    const nextOriginals = new Map<string, unknown>()
    for (const row of rows) nextOriginals.set(row.id, row.original)

    if (!firstSync) {
      const columnsChanged = columns !== prevColumns
      let structureChanged = currentIds.length !== prevRowIds.length
      if (!structureChanged) {
        for (let i = 0; i < currentIds.length; i++) {
          if (currentIds[i] !== prevRowIds[i]) {
            structureChanged = true
            break
          }
        }
      }

      untrack(() => {
        if (structureChanged) {
          // Evict signals for rows no longer rendered (Class-C leak safety).
          const live = new Set(currentIds)
          for (const id of rowVersions.keys()) {
            if (!live.has(id)) rowVersions.delete(id)
          }
        }
        if (structureChanged || columnsChanged) {
          for (const s of rowVersions.values()) s.update((n) => n + 1)
        } else {
          // A pure in-place data edit: bump ONLY the rows whose object changed.
          //
          // There is deliberately no "nothing changed → bump everything"
          // fallback. This effect can re-run more than once per user change (the
          // row-model atom and the options atom settle separately), and on the
          // second pass the baselines below have already been advanced, so such
          // a fallback fires on a spurious re-run and coarse-invalidates the
          // whole table (measured: 20 cell re-runs where 2 are correct).
          for (const [id, original] of nextOriginals) {
            if (prevOriginals.has(id) && prevOriginals.get(id) !== original) {
              rowVersions.get(id)?.update((n) => n + 1)
            }
          }
        }
      })
    }
    firstSync = false
    prevRowIds = currentIds
    prevOriginals = nextOriginals
    prevColumns = columns
  })

  onUnmount(() => {
    sync.dispose()
    rowSync.dispose()
    rowVersions.clear()
    table._reactivity.unmount?.()
  })

  return table
}
