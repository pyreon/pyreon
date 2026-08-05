import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@pyreon/table'

/**
 * The ONE feature set every `feature.useTable()` table is built with.
 *
 * TanStack Table v9 made the feature set a compile-time type parameter
 * (`Table<TFeatures, TData>`), so it cannot be assembled conditionally at
 * runtime the way v8's row-model options could be — two shapes would mean two
 * `TFeatures` types, and `FeatureTableResult.table` is a single public type.
 *
 * So the set is STATIC and covers everything `useTable` exposes:
 *
 *   - `rowSortingFeature` + `sortedRowModel`    — the `sorting` signal
 *   - `columnFilteringFeature` + `filteredRowModel`
 *   - `globalFilteringFeature`                  — the `globalFilter` signal
 *     (it REQUIRES `columnFilteringFeature`: the global filter is applied by
 *     the filtered row model, not by a model of its own)
 *   - `rowPaginationFeature` + `paginatedRowModel` — the `pageSize` option
 *
 * `pageSize` then controls pagination BEHAVIOUR rather than registration:
 * without it `useTable` passes `manualPagination: true`, which makes
 * `getPaginatedRowModel()` return the pre-paginated rows — byte-for-byte the
 * v8 behaviour of not registering `getPaginationRowModel()` at all, while the
 * pagination APIs (`getPageCount`, `nextPage`, …) stay present exactly as they
 * were in v8 (where every feature was always on and only row models were
 * opt-in).
 *
 * The `sortFns` / `filterFns` registries are included so a `columnOverrides`
 * entry can name a built-in by string (`sortFn: 'datetime'`,
 * `filterFn: 'includesString'`) — v8 resolved those names implicitly.
 *
 * Registering the full set costs bundle weight a hand-built table would not
 * pay. That is the deliberate trade of a schema-driven table: the columns are
 * derived at runtime from the schema, so which capabilities a given feature's
 * table needs is not knowable at build time. Consumers who want a minimal
 * feature set should build the table with `@pyreon/table` directly.
 */
export const featureTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
  filterFns,
})

/**
 * The feature set of every table returned by `feature.useTable()`.
 *
 * Use it to name the table type outside the hook, e.g.
 * `Table<FeatureTableFeatures, Post>` or
 * `ColumnDef<FeatureTableFeatures, Post, unknown>` for a `columnOverrides`
 * entry.
 */
export type FeatureTableFeatures = typeof featureTableFeatures
