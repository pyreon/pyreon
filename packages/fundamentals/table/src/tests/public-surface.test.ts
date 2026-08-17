/**
 * Public surface snapshot — drift gate for TanStack version bumps.
 *
 * As of the v9 migration `src/index.ts` re-exports the table-core RUNTIME
 * surface as an EXPLICIT named list rather than `export *` — which is the
 * remedy this file's own header used to prescribe ("if TanStack added a debug
 * or internal API we DON'T want to leak, narrow `index.ts` from `export *` to a
 * named list"). The v8 → v9 bump made the case unarguable: the wildcard meant
 * table-core's surface WAS ours, so an upstream major retired 40 of our 51
 * runtime exports, and it had been leaking genuine internals
 * (`_getVisibleLeafColumns`, `noop`, `getMemoOptions`, `selectRowsFn`, …).
 *
 * The snapshot therefore now guards two different things:
 *   1. that a TanStack bump which adds/renames/removes an export surfaces as a
 *      deliberate-decision moment, and
 *   2. that our curated list stays curated — a new internal cannot slip in
 *      unnoticed, because adding it requires editing `index.ts` by hand.
 *
 * To intentionally update after a TanStack bump:
 *   bun run --filter='./packages/fundamentals/table' test -- -u
 *
 * Then review the diff in the PR. Types are still re-exported wholesale
 * (`export type *`) and so do not appear here — they carry no runtime weight
 * and a type internal cannot bloat a consumer bundle.
 */

import { describe, expect, it } from 'vitest'
import * as table from '../index'

describe('@pyreon/table — public surface', () => {
  it('exports drift gate (snapshot must match TanStack version + Pyreon adapter)', () => {
    const surface = Object.keys(table).sort()
    expect(surface).toMatchInlineSnapshot(`
      [
        "aggregationFn_count",
        "aggregationFn_extent",
        "aggregationFn_first",
        "aggregationFn_last",
        "aggregationFn_max",
        "aggregationFn_mean",
        "aggregationFn_median",
        "aggregationFn_min",
        "aggregationFn_sum",
        "aggregationFn_unique",
        "aggregationFn_uniqueCount",
        "aggregationFns",
        "cellSelectionFeature",
        "cellSpanningFeature",
        "columnFacetingFeature",
        "columnFilteringFeature",
        "columnGroupingFeature",
        "columnOrderingFeature",
        "columnPinningFeature",
        "columnResizingFeature",
        "columnSizingFeature",
        "columnVisibilityFeature",
        "constructAggregationFn",
        "constructFilterFn",
        "constructSortFn",
        "coreFeatures",
        "createColumnHelper",
        "createCoreRowModel",
        "createExpandedRowModel",
        "createFacetedMinMaxValues",
        "createFacetedRowModel",
        "createFacetedUniqueValues",
        "createFilteredRowModel",
        "createGroupedRowModel",
        "createPaginatedRowModel",
        "createSortedRowModel",
        "createTableState",
        "filterFn_arrHas",
        "filterFn_arrIncludes",
        "filterFn_arrIncludesAll",
        "filterFn_arrIncludesSome",
        "filterFn_between",
        "filterFn_betweenInclusive",
        "filterFn_empty",
        "filterFn_endsWith",
        "filterFn_equals",
        "filterFn_equalsString",
        "filterFn_equalsStringSensitive",
        "filterFn_greaterThan",
        "filterFn_greaterThanOrEqualTo",
        "filterFn_inDateRange",
        "filterFn_inNumberRange",
        "filterFn_includesString",
        "filterFn_includesStringSensitive",
        "filterFn_lessThan",
        "filterFn_lessThanOrEqualTo",
        "filterFn_notEmpty",
        "filterFn_startsWith",
        "filterFn_weakEquals",
        "filterFns",
        "flexRender",
        "flexRenderCell",
        "functionalUpdate",
        "getInitialTableState",
        "globalFilteringFeature",
        "makeStateUpdater",
        "metaHelper",
        "pyreonReactivity",
        "reSplitAlphaNumeric",
        "rowAggregationFeature",
        "rowExpandingFeature",
        "rowPaginationFeature",
        "rowPinningFeature",
        "rowSelectionFeature",
        "rowSortingFeature",
        "sortFn_alphanumeric",
        "sortFn_alphanumericCaseSensitive",
        "sortFn_basic",
        "sortFn_datetime",
        "sortFn_text",
        "sortFn_textCaseSensitive",
        "sortFns",
        "stockFeatures",
        "tableFeatures",
        "tableOptions",
        "useTable",
        "visibleCells",
      ]
    `)
  })
})
