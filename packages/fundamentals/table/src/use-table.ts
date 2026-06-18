import { onUnmount } from '@pyreon/core'
import type { Computed } from '@pyreon/reactivity'
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
  })

  // Clean up the effect when the component unmounts.
  onUnmount(() => cleanup.dispose())

  return tableSig
}
