import type { RowData } from "@tanstack/table-core"

/**
 * Check whether a value is a Pyreon VNode (has type, props, children, key).
 */
function isVNode(value: unknown): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "type" in (value as Record<string, unknown>) &&
    "props" in (value as Record<string, unknown>) &&
    "children" in (value as Record<string, unknown>)
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
  if (typeof component === "string" || typeof component === "number") return component
  if (typeof component === "function") return (component as (p: TValue) => unknown)(props)
  // Pass through VNodes and other objects as-is (the renderer handles them)
  if (isVNode(component)) return component
  return null
}
