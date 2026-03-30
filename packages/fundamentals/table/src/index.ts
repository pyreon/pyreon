// ─── TanStack Table core — re-export everything ─────────────────────────────
// Mirrors the approach of @tanstack/react-table and @tanstack/solid-table:
// users can import any core utility, type, or built-in fn from @pyreon/table.
export * from '@tanstack/table-core'

// ─── Pyreon adapter ─────────────────────────────────────────────────────────────

export { flexRender } from './flex-render'
export type { UseTableOptions } from './use-table'
export { useTable } from './use-table'
