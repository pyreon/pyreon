// ─── TanStack Table core (v9) ───────────────────────────────────────────────
//
// The RUNTIME surface is re-exported EXPLICITLY rather than with `export *`.
// Under v8 the wildcard made table-core's public surface literally ours, so an
// upstream major became a break for every @pyreon/table consumer (v8 → v9
// retired 40 of 51 runtime exports) and it leaked genuine internals
// (`_getVisibleLeafColumns`, `noop`, `getMemoOptions`, …) into our API.
//
// This list is everything a table AUTHOR needs — all 16 features, every row
// model, every built-in filter/sort/aggregation fn, the helpers — minus
// adapter-construction plumbing (`constructTable`/`constructRow`/…, `memo`,
// `assignTableAPIs`, the `core*Feature` objects), which `useTable` owns.
//
// TYPES are re-exported wholesale: they carry no runtime weight, users need
// them for annotations, and a type internal cannot bloat a bundle.
export {
  aggregationFn_count, aggregationFn_extent, aggregationFn_first,
  aggregationFn_last, aggregationFn_max, aggregationFn_mean,
  aggregationFn_median, aggregationFn_min, aggregationFn_sum,
  aggregationFn_unique, aggregationFn_uniqueCount, aggregationFns,
  cellSelectionFeature, cellSpanningFeature, columnFacetingFeature,
  columnFilteringFeature, columnGroupingFeature, columnOrderingFeature,
  columnPinningFeature, columnResizingFeature, columnSizingFeature,
  columnVisibilityFeature, constructAggregationFn, constructFilterFn,
  constructSortFn, coreFeatures, createColumnHelper,
  createCoreRowModel, createExpandedRowModel, createFacetedMinMaxValues,
  createFacetedRowModel, createFacetedUniqueValues, createFilteredRowModel,
  createGroupedRowModel, createPaginatedRowModel, createSortedRowModel,
  filterFn_arrHas, filterFn_arrIncludes, filterFn_arrIncludesAll,
  filterFn_arrIncludesSome, filterFn_between, filterFn_betweenInclusive,
  filterFn_empty, filterFn_endsWith, filterFn_equals,
  filterFn_equalsString, filterFn_equalsStringSensitive, filterFn_greaterThan,
  filterFn_greaterThanOrEqualTo, filterFn_inDateRange, filterFn_inNumberRange,
  filterFn_includesString, filterFn_includesStringSensitive, filterFn_lessThan,
  filterFn_lessThanOrEqualTo, filterFn_notEmpty, filterFn_startsWith,
  filterFn_weakEquals, filterFns, functionalUpdate,
  getInitialTableState, globalFilteringFeature, makeStateUpdater,
  metaHelper, reSplitAlphaNumeric, rowAggregationFeature,
  rowExpandingFeature, rowPaginationFeature, rowPinningFeature,
  rowSelectionFeature, rowSortingFeature, sortFn_alphanumeric,
  sortFn_alphanumericCaseSensitive, sortFn_basic, sortFn_datetime,
  sortFn_text, sortFn_textCaseSensitive, sortFns,
  stockFeatures, tableFeatures, tableOptions,
} from '@tanstack/table-core'

export type * from '@tanstack/table-core'

// ─── Pyreon adapter ─────────────────────────────────────────────────────────

export { flexRender, flexRenderCell } from './flex-render'
export { pyreonReactivity } from './reactivity'
export type { UseTableOptions } from './use-table'
export { useTable } from './use-table'
