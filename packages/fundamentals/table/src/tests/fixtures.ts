/**
 * Shared v9 feature set for the test suite.
 *
 * v9 requires every non-core capability to be registered explicitly. Tests
 * exercise the whole surface, so they use a v8-parity set: all 16 stock
 * features PLUS every row model and function registry (`stockFeatures` carries
 * the features only — the row-model slots are separate by design, which is what
 * makes an app's real feature set tree-shakeable).
 *
 * Production code should register only what it uses; `pyreon doctor`-style
 * bundle guidance and the docs both say so. This breadth is deliberate here.
 */
import {
  aggregationFns,
  createExpandedRowModel,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createGroupedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  sortFns,
  stockFeatures,
  tableFeatures,
} from '../index'

export const allFeatures = tableFeatures({
  ...stockFeatures,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  groupedRowModel: createGroupedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  sortFns,
  filterFns,
  aggregationFns,
})

export type AllFeatures = typeof allFeatures
