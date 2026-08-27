import type { VNodeChild, VNodeChildAtom } from '@pyreon/core'
import { untrack } from '@pyreon/reactivity'
import type { Cell, RowData, Table, TableFeatures } from '@tanstack/table-core'
import { _getRowSignalBridge } from './use-table'

/** Resolved renderable content — deliberately NOT the full `VNodeChild`.
 *  `VNodeChild` includes the ACCESSOR arm (`() => …`), so returning it would
 *  make the documented `<td>{() => flexRenderCell(…)}</td>` shape a NESTED
 *  accessor, which `VNodeChildAccessor` rejects. Both renderers always return
 *  already-resolved content, never an accessor — this narrower type says so,
 *  and it is exactly `ReturnType<VNodeChildAccessor>`. */
type RenderedChild = VNodeChildAtom | VNodeChild[]

/**
 * Check whether a value is a Pyreon VNode (has type, props, children, key).
 */
function isVNode(value: unknown): boolean {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'type' in (value as Record<string, unknown>) &&
    'props' in (value as Record<string, unknown>) &&
    'children' in (value as Record<string, unknown>)
  )
}

/**
 * Renders a TanStack Table column def template (header, cell, footer).
 * Handles strings, numbers, functions (components/render fns), and VNodes.
 *
 * @example
 * // In a header:
 * flexRender(header.column.columnDef.header, header.getContext())
 * // In a cell:
 * flexRender(cell.column.columnDef.cell, cell.getContext())
 */
export function flexRender<TValue>(
  component: ((p: TValue) => unknown) | string | number | undefined | null | unknown,
  props: TValue,
): RenderedChild {
  if (component == null) return null
  if (typeof component === 'string' || typeof component === 'number') return component
  if (typeof component === 'function') return (component as (p: TValue) => RenderedChild)(props)
  // Pass through VNodes and other objects as-is (the renderer handles them)
  if (isVNode(component)) return component as RenderedChild
  return null
}

/**
 * Render a cell by re-navigating to the LIVE cell from the table on every read
 * — the fine-grained per-cell update primitive.
 *
 * Inside a keyed `<For>`, the `row`/`cell` objects passed to the row/cell render
 * callback are captured ONCE (the keyed reconciler reuses the DOM node and never
 * re-runs its body), so a cell bound with the plain
 * `flexRender(cell.column.columnDef.cell, cell.getContext())` FREEZES when the
 * underlying value changes without the row identity changing (an in-place edit
 * or a live data feed). `flexRenderCell` fixes this: place it inside an explicit
 * accessor `{() => flexRenderCell(table, row.id, cell.column.id)}` so the read
 * subscribes reactively, and it looks the cell up fresh from the current row
 * model each time — so a single-cell change patches ONLY that cell's text node.
 * Returns `null` when the row is not in the current (filtered/paginated) model.
 *
 * FINE-GRAINED: a table from `useTable` carries a per-row signal bridge, so the
 * cell subscribes to only its own row's signal and an in-place data edit re-runs
 * just the changed rows' cells — not every cell. A table built directly with
 * `constructTable` has no bridge; it still renders correctly, subscribing to the
 * row-model atom instead (coarser: every cell re-runs on any change).
 *
 * NOTE: `row.getVisibleCells()` is provided by v9's `columnVisibilityFeature`.
 * Without that feature registered this falls back to the row's full cell list
 * (`getAllCells`, which is core), so the call is safe either way.
 *
 * @example
 * <For each={() => table.getRowModel().rows} by={(r) => r.id}>
 *   {(row) => (
 *     <tr>
 *       <For each={() => row.getVisibleCells()} by={(c) => c.id}>
 *         {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
 *       </For>
 *     </tr>
 *   )}
 * </For>
 */
export function flexRenderCell<TFeatures extends TableFeatures, TData extends RowData>(
  table: Table<TFeatures, TData>,
  rowId: string,
  columnId: string,
): RenderedChild {
  // Fine-grained: when the table came from `useTable`, THIS row's signal is the
  // one and ONLY subscription, so the entire lookup below runs UNTRACKED.
  //
  // Under v9 every step of that lookup is a derived-atom read — `getRowModel()`,
  // `getVisibleCells()`, `getContext()` — so leaving any of them tracked
  // re-subscribes the cell to table-wide state and a single-cell edit re-runs
  // every cell (measured: 20 re-runs where 2 are correct). Untracking one call
  // is not enough; they all leak.
  //
  // Without a bridge (a table built directly with `constructTable`) the reads
  // stay TRACKED and are themselves the subscription — coarser, but correct.
  const bridge = _getRowSignalBridge(table)
  if (!bridge) return renderCell(table, rowId, columnId)
  bridge.rowSignal(rowId)()
  return untrack(() => renderCell(table, rowId, columnId))
}

function renderCell<TFeatures extends TableFeatures, TData extends RowData>(
  table: Table<TFeatures, TData>,
  rowId: string,
  columnId: string,
): RenderedChild {
  const cell = lookupCellByColumnId(table, rowId, columnId)
  if (cell == null) return null
  return flexRender(cell.column.columnDef.cell, cell.getContext())
}

/** The row's cell for `columnId`, looked up FRESH (the captured row goes stale
 *  the moment the model rebuilds). Uses table-core's memoized by-id map — O(1),
 *  and filtered to the SAME visible columns as `getVisibleCells` — when the
 *  columnVisibility feature is registered; else an O(C) scan. This replaces a
 *  per-cell `getVisibleCells().find(...)`, which was O(C²) per row (O(N·C²) on a
 *  full render). Returns `undefined` when the row or column is absent. */
function lookupCellByColumnId<TFeatures extends TableFeatures, TData extends RowData>(
  table: Table<TFeatures, TData>,
  rowId: string,
  columnId: string,
): Cell<TFeatures, TData, unknown> | undefined {
  const row = table.getRowModel().rowsById[rowId]
  if (row == null) return undefined
  const byId = (
    row as { getVisibleCellsByColumnId?: () => Record<string, Cell<TFeatures, TData, unknown>> }
  ).getVisibleCellsByColumnId
  if (typeof byId === 'function') return byId.call(row)[columnId]
  // Fallback for a table built from a minimal feature set (no columnVisibility).
  const withVisible = row as { getVisibleCells?: () => VisibleCells<TFeatures, TData> }
  const cells =
    typeof withVisible.getVisibleCells === 'function' ? withVisible.getVisibleCells() : row.getAllCells()
  return cells.find((c) => c.column.id === columnId)
}

/** The current visible cells of a row, looked up FRESH from the row model (the
 *  captured `row` object goes stale the moment the model rebuilds). Returns an
 *  empty array when the row is not in the current model. */
function lookupVisibleCells<TFeatures extends TableFeatures, TData extends RowData>(
  table: Table<TFeatures, TData>,
  rowId: string,
): VisibleCells<TFeatures, TData> {
  const row = table.getRowModel().rowsById[rowId]
  if (row == null) return []
  const withVisible = row as { getVisibleCells?: () => VisibleCells<TFeatures, TData> }
  return typeof withVisible.getVisibleCells === 'function' ? withVisible.getVisibleCells() : row.getAllCells()
}

type VisibleCells<TFeatures extends TableFeatures, TData extends RowData> = Cell<
  TFeatures,
  TData,
  unknown
>[]

/** The column-GEOMETRY state slices — the only table state that can change a
 *  row's visible cell LIST without flowing through the row model (structure) or
 *  the `columns` option (both of which bump the per-row signals). Read tracked
 *  so `visibleCells` re-runs on a real visibility/order/pinning/grouping
 *  change; each read is a no-op when the feature is not registered. These
 *  subscriptions stay QUIET on data edits because the adapter's derived atoms
 *  are value-gated (`Object.is` reference parity — see reactivity.ts). */
function trackColumnGeometry(table: object): void {
  const atoms = (table as { atoms?: Record<string, { get(): unknown } | undefined> }).atoms
  if (!atoms) return
  atoms['columnVisibility']?.get()
  atoms['columnOrder']?.get()
  atoms['columnPinning']?.get()
  atoms['grouping']?.get()
}

/**
 * Fine-grained visible-cells accessor for a row — the cells-LIST companion to
 * `flexRenderCell`.
 *
 * The naive inner loop `each={() => row.getVisibleCells()}` leaves a TRACKED
 * table-core read in every row's scope: `getVisibleCells`' memo deps read
 * `table.options` (through `getAllCells` → `getAllLeafColumns`), and the
 * options atom changes on EVERY options sync — data edits included. So a
 * single-cell edit re-ran every row's cells-list accessor (measured: 1000
 * re-runs at N=1000 where 1 is correct — the dominant cost of the whole
 * update). `visibleCells` subscribes fine-grained instead: the row's own
 * signal (covers structure + `columns`-option changes via the `useTable`
 * bridge) plus the column-geometry state slices (visibility, order, pinning,
 * grouping), and runs the actual lookup UNTRACKED against the CURRENT row
 * model — never a captured stale `row`.
 *
 * A table built directly with `constructTable` has no bridge; the lookup then
 * stays tracked (coarse but correct), mirroring `flexRenderCell`'s fallback.
 *
 * @example
 * <For each={() => table.getRowModel().rows} by={(r) => r.id}>
 *   {(row) => (
 *     <tr>
 *       <For each={() => visibleCells(table, row.id)} by={(c) => c.id}>
 *         {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
 *       </For>
 *     </tr>
 *   )}
 * </For>
 */
export function visibleCells<TFeatures extends TableFeatures, TData extends RowData>(
  table: Table<TFeatures, TData>,
  rowId: string,
): VisibleCells<TFeatures, TData> {
  const bridge = _getRowSignalBridge(table)
  if (!bridge) return lookupVisibleCells(table, rowId)
  bridge.rowSignal(rowId)()
  trackColumnGeometry(table)
  return untrack(() => lookupVisibleCells(table, rowId))
}
