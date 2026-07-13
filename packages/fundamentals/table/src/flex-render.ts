import type { VNodeChild } from '@pyreon/core'
import type { Computed } from '@pyreon/reactivity'
import type { RowData, Table } from '@tanstack/table-core'
import { _getRowSignalBridge } from './use-table'

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
export function flexRender<_TData extends RowData, TValue>(
  component: ((p: TValue) => unknown) | string | number | undefined | null | unknown,
  props: TValue,
): unknown {
  if (component == null) return null
  if (typeof component === 'string' || typeof component === 'number') return component
  if (typeof component === 'function') return (component as (p: TValue) => unknown)(props)
  // Pass through VNodes and other objects as-is (the renderer handles them)
  if (isVNode(component)) return component
  return null
}

/**
 * Render a cell by re-navigating to the LIVE cell from the reactive table on
 * every read — the fine-grained per-cell update primitive.
 *
 * Inside a keyed `<For>`, the `row`/`cell` objects passed to the row/cell
 * render callback are captured ONCE (the keyed reconciler reuses the DOM node
 * and never re-runs its body), so a cell bound with the plain
 * `flexRender(cell.column.columnDef.cell, cell.getContext())` FREEZES when the
 * underlying value changes without the row identity changing (an in-place edit
 * or a live data feed). `flexRenderCell` fixes this: place it inside an
 * explicit accessor `{() => flexRenderCell(table, row.id, cell.column.id)}` so
 * the read subscribes reactively, and it looks the cell up fresh from the
 * current row model each time — so a single-cell change patches ONLY that
 * cell's text node (no row or table re-render). Returns `null` when the row is
 * not in the current (filtered/paginated) row model.
 *
 * FINE-GRAINED: pass the `Computed<Table>` ACCESSOR (`table`, not `table()`).
 * The cell then subscribes to only its own row's signal, so an in-place data
 * edit re-runs just the changed rows' cells — not every cell. (Passing a
 * resolved `Table` instance still works but subscribes to nothing on its own,
 * so wrap it: `{() => flexRenderCell(table(), ...)}` — the coarse `table()`
 * read is the subscription; every cell re-runs on any change.)
 *
 * @example
 * <For each={() => table().getRowModel().rows} by={(r) => r.id}>
 *   {(row) => (
 *     <tr>
 *       <For each={() => row.getVisibleCells()} by={(c) => c.id}>
 *         {(cell) => (
 *           // Fine-grained: pass the accessor `table`, not `table()`.
 *           <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>
 *         )}
 *       </For>
 *     </tr>
 *   )}
 * </For>
 */
export function flexRenderCell<TData extends RowData>(
  table: Table<TData> | Computed<Table<TData>>,
  rowId: string,
  columnId: string,
): VNodeChild {
  let instance: Table<TData>
  if (typeof table === 'function') {
    const bridge = _getRowSignalBridge<TData>(table)
    if (bridge !== undefined) {
      // Fine-grained: subscribe to THIS row's signal, read the instance
      // WITHOUT subscribing to the coarse table signal.
      bridge.rowSignal(rowId)()
      instance = bridge.instance
    } else {
      // A plain Computed<Table> not from useTable — subscribe coarsely.
      instance = table()
    }
  } else {
    // Raw Table instance — the caller's own `{() => ...}` accessor is the
    // subscription (coarse) if it read the table signal.
    instance = table
  }
  const row = instance.getRowModel().rowsById[rowId]
  if (row == null) return null
  const cell = row.getVisibleCells().find((c) => c.column.id === columnId)
  if (cell == null) return null
  return flexRender(cell.column.columnDef.cell, cell.getContext()) as VNodeChild
}
