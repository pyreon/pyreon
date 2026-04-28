/**
 * Public surface snapshot — drift gate for TanStack version bumps.
 *
 * `@pyreon/table` re-exports `@tanstack/table-core` via `export *` to
 * mirror the convention used by all official TanStack adapters
 * (`@tanstack/react-table`, `@tanstack/solid-table`, `@tanstack/svelte-
 * table`, `@tanstack/vue-table`). The downside of `export *` is that
 * the package's actual surface is invisible from `src/index.ts` — you
 * can't read 4 lines and see what's exposed.
 *
 * This snapshot test makes the surface explicit. On every CI run it
 * snapshots `Object.keys(import * as table from '@pyreon/table')`. When
 * TanStack ships a new minor that adds (or renames, or removes) an
 * export, this test fails — the diff is the deliberate-decision moment
 * that wildcard re-exports otherwise paper over.
 *
 * To intentionally update the snapshot after a TanStack bump:
 *   bun run --filter='./packages/fundamentals/table' test -- -u
 *
 * Then review the diff in the PR — added/removed names should match
 * the TanStack changelog. If TanStack added a debug or internal API
 * we DON'T want to leak, narrow `index.ts` from `export *` to a named
 * list.
 *
 * See `.claude/rules/anti-patterns.md` (audit bug #11 entry) for the
 * full reasoning behind keeping `export *` over named exports.
 */

import { describe, expect, it } from 'vitest'
import * as table from '../index'

describe('@pyreon/table — public surface', () => {
  it('exports drift gate (snapshot must match TanStack version + Pyreon adapter)', () => {
    const surface = Object.keys(table).sort()
    expect(surface).toMatchInlineSnapshot(`
      [
        "ColumnFaceting",
        "ColumnFiltering",
        "ColumnGrouping",
        "ColumnOrdering",
        "ColumnPinning",
        "ColumnSizing",
        "ColumnVisibility",
        "GlobalFaceting",
        "GlobalFiltering",
        "Headers",
        "RowExpanding",
        "RowPagination",
        "RowPinning",
        "RowSelection",
        "RowSorting",
        "_getVisibleLeafColumns",
        "aggregationFns",
        "buildHeaderGroups",
        "createCell",
        "createColumn",
        "createColumnHelper",
        "createRow",
        "createTable",
        "defaultColumnSizing",
        "expandRows",
        "filterFns",
        "flattenBy",
        "flexRender",
        "functionalUpdate",
        "getCoreRowModel",
        "getExpandedRowModel",
        "getFacetedMinMaxValues",
        "getFacetedRowModel",
        "getFacetedUniqueValues",
        "getFilteredRowModel",
        "getGroupedRowModel",
        "getMemoOptions",
        "getPaginationRowModel",
        "getSortedRowModel",
        "isFunction",
        "isNumberArray",
        "isRowSelected",
        "isSubRowSelected",
        "makeStateUpdater",
        "memo",
        "noop",
        "orderColumns",
        "passiveEventSupported",
        "reSplitAlphaNumeric",
        "selectRowsFn",
        "shouldAutoRemoveFilter",
        "sortingFns",
        "useTable",
      ]
    `)
  })
})
