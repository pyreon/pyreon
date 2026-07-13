import { onUnmount } from '@pyreon/core'
import type { Computed, Signal } from '@pyreon/reactivity'
import { batch, computed, effect, signal } from '@pyreon/reactivity'
import {
  createTable,
  type RowData,
  type Table,
  type TableOptions,
  type TableOptionsResolved,
  type TableState,
  type Updater,
} from '@tanstack/table-core'

export type UseTableOptions<TData extends RowData> = () => TableOptions<TData>

/** One-level structural equality for a state slice (array element-wise / object
 *  key-wise, each by `Object.is`). Used to tell a REAL table-state change from a
 *  no-op auto-reset (TanStack re-emits `pagination`/`expanded` on a data change
 *  even when nothing changed — that must NOT trigger a coarse cell invalidation). */
function sliceEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  // A primitive (string globalFilter, boolean expanded) or null can only be
  // equal by identity, already handled above.
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const aArr = Array.isArray(a)
  if (aArr || Array.isArray(b)) {
    if (!aArr || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
    return true
  }
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
  }
  return true
}

/** Table-state equality: each slice one-level structurally equal. `a`/`b` are
 *  full `TableState` objects with the same stable key set (a TanStack invariant),
 *  so iterating `a`'s keys is sufficient. */
function sameTableState(a: TableState, b: TableState): boolean {
  if (a === b) return true
  for (const k of Object.keys(a)) {
    if (!sliceEqual((a as unknown as Record<string, unknown>)[k], (b as unknown as Record<string, unknown>)[k])) return false
  }
  return true
}

/**
 * Fine-grained bridge for a `useTable` result, keyed by the returned
 * `Computed<Table>`. `flexRenderCell` uses it to subscribe to ONLY the row's
 * own signal (instead of the coarse whole-table signal) and read the instance
 * WITHOUT a coarse subscription. A `WeakMap` so the entry dies with the
 * returned computed — no manual cleanup.
 */
interface RowSignalBridge<TData extends RowData> {
  /** Get-or-create this row's version signal. Call it to subscribe. */
  rowSignal(rowId: string): Signal<number>
  /** The (stable) Table instance — read without a coarse subscription. */
  readonly instance: Table<TData>
}
const rowSignalRegistry = new WeakMap<object, RowSignalBridge<RowData>>()

/** @internal — used by `flexRenderCell`. Returns undefined for a plain
 *  `Computed<Table>` not produced by `useTable`. */
export function _getRowSignalBridge<TData extends RowData>(
  tableSig: object,
): RowSignalBridge<TData> | undefined {
  return rowSignalRegistry.get(tableSig) as RowSignalBridge<TData> | undefined
}

/**
 * Create a reactive TanStack Table instance. Returns a read-only signal
 * that holds the Table instance — read it in effects or templates to
 * track state changes.
 *
 * Options are passed as a function so reactive signals (e.g. data, columns)
 * can be read inside, and the table updates automatically when they change.
 *
 * @example
 * const data = signal([{ name: "Alice" }, { name: "Bob" }])
 * const table = useTable(() => ({
 *   data: data(),
 *   columns: [{ accessorKey: "name", header: "Name" }],
 *   getCoreRowModel: getCoreRowModel(),
 * }))
 * // In template: () => table().getRowModel().rows
 */
export function useTable<TData extends RowData>(
  options: UseTableOptions<TData>,
): Computed<Table<TData>> {
  // Internal state managed by the adapter — merged with user-provided state.
  const tableState = signal<TableState>({} as TableState)

  // Version counter — Pyreon signals use Object.is for equality, so
  // setting the same table reference is a no-op. We bump a version
  // counter to force the computed to re-evaluate and notify consumers.
  const version = signal(0)

  // Resolve user options with adapter-required defaults.
  const resolvedOptions: TableOptionsResolved<TData> = {
    state: {},
    /* v8 ignore next 3 -- defensive default required by TableOptionsResolved; the
       effect below always overrides onStateChange via setOptions before any
       table.setState() can fire, so this noop body is unreachable (proven: it
       never executes even under reactive re-runs + state mutations). */
    onStateChange() {
      /* default noop */
    },
    renderFallbackValue: null,
    ...options(),
  }

  // Create the table instance once.
  const table = createTable(resolvedOptions)

  // Initialize internal state from the table's initial state.
  tableState.set(table.initialState)

  // The signal that consumers read — depends on `version` so it
  // re-notifies whenever we bump the version after a state/option change.
  const tableSig = computed(() => {
    version()
    return table
  })

  // ── Fine-grained per-row invalidation ──────────────────────────────────────
  // Each rendered cell (via flexRenderCell) subscribes to ITS row's signal, not
  // the coarse table signal, so an in-place data edit re-runs only the cells of
  // the rows whose `original` reference changed — instead of every cell. A
  // table-STATE change (sort/filter/selection/visibility), a column change, or a
  // row-STRUCTURE change (order/membership) can affect any rendered cell, so
  // those bump every live row signal (correct-by-over-invalidation).
  const rowVersions = new Map<string, Signal<number>>()
  let prevOriginals = new Map<string, unknown>()
  let prevRowIds: string[] = []
  let prevState: TableState | undefined
  let prevData: unknown
  let prevColumns: unknown
  let firstSync = true

  const getRowSignal = (rowId: string): Signal<number> => {
    let s = rowVersions.get(rowId)
    if (s === undefined) {
      s = signal(0)
      rowVersions.set(rowId, s)
    }
    return s
  }
  rowSignalRegistry.set(tableSig, { rowSignal: getRowSignal, instance: table } as RowSignalBridge<RowData>)

  function invalidateRows(data: unknown, columns: unknown, state: TableState): void {
    const rows = table.getRowModel().rows
    const currentIds = rows.map((r) => r.id)

    if (!firstSync) {
      // Value-compare (not by reference): TanStack re-emits a fresh state object
      // on a data change even for a no-op auto-reset — a reference check would
      // treat that as a real state change and coarse-invalidate every cell.
      // prevState is always defined here (recorded on the first, firstSync run).
      const stateChanged = !sameTableState(state, prevState as TableState)
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

      if (structureChanged) {
        // Evict signals for rows no longer rendered (Class-C leak safety).
        const live = new Set(currentIds)
        for (const id of rowVersions.keys()) {
          if (!live.has(id)) rowVersions.delete(id)
        }
      }

      if (stateChanged || columnsChanged || structureChanged) {
        for (const s of rowVersions.values()) s.update((n) => n + 1)
      } else if (data !== prevData) {
        for (const row of rows) {
          if (prevOriginals.get(row.id) !== row.original) {
            rowVersions.get(row.id)?.update((n) => n + 1)
          }
        }
      }
    }
    firstSync = false

    // Record the baseline for the next diff.
    prevRowIds = currentIds
    prevState = state
    prevData = data
    prevColumns = columns
    const nextOriginals = new Map<string, unknown>()
    for (const row of rows) nextOriginals.set(row.id, row.original)
    prevOriginals = nextOriginals
  }

  // Sync options reactively: when signals inside options() change, or when
  // internal state changes, update the table and notify consumers.
  const cleanup = effect(() => {
    const userOpts = options()
    const currentState = tableState()
    let stateChanged = false

    table.setOptions((prev) => ({
      ...prev,
      ...userOpts,
      state: {
        ...currentState,
        ...userOpts.state,
      },
      onStateChange: (updater: Updater<TableState>) => {
        // Imperative event callback (not a tracked scope) — reading the
        // current state to apply the TanStack updater must not subscribe.
        // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
        const newState = typeof updater === 'function' ? updater(tableState.peek()) : updater

        stateChanged = true
        batch(() => {
          tableState.set(newState)
          version.update((n) => n + 1)
        })

        userOpts.onStateChange?.(updater)
      },
    }))

    // Only bump if setOptions didn't already trigger a state change.
    // table-core's setOptions only merges options (it never calls setState),
    // so within a single effect run stateChanged is always false here — the
    // skip-branch (stateChanged === true) is defensive and unreachable
    // (proven: it never executes even under reactive re-runs + state mutations).
    /* v8 ignore next 3 */
    if (!stateChanged) {
      version.update((n) => n + 1)
    }

    // Fine-grained per-row invalidation runs after the table is up to date.
    invalidateRows(userOpts.data, userOpts.columns, currentState)
  })

  // Clean up the effect when the component unmounts.
  onUnmount(() => {
    cleanup.dispose()
    rowVersions.clear()
  })

  return tableSig
}
