---
title: "TanStack Table Adapter — API Reference"
description: "Pyreon adapter for TanStack Table — reactive options, signal-driven state, flexRender"
---

# @pyreon/table — API Reference

> **Generated** from `table`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [table](/docs/table).

Reactive TanStack Table adapter for Pyreon. Options are passed as a function so signal reads inside (data, columns, sorting) automatically re-sync the table when any tracked signal changes. Returns a Computed&lt;Table&lt;T&gt;&gt; that consumers read inside templates or effects. Re-exports all TanStack Table core utilities and types for single-import convenience.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useTable`](#usetable) | hook | Create a reactive TanStack Table instance. |
| [`flexRender`](#flexrender) | function | Render a TanStack Table column definition template (header, cell, or footer). |

## API

### useTable `hook`

```ts
<TData extends RowData>(options: () => TableOptions<TData>) => Computed<Table<TData>>
```

Create a reactive TanStack Table instance. Options are passed as a function so reactive signals (data, columns, sorting state) can be read inside and the table updates automatically when they change. Returns a Computed&lt;Table&lt;T&gt;&gt; — read it inside JSX expression thunks or effects to track state changes. Internal state management uses a version counter to force re-notification even when the table reference is the same object.

**Example**

```tsx
const table = useTable(() => ({
  data: users(),
  columns: [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
  ],
  getCoreRowModel: getCoreRowModel(),
}))

// Read inside reactive scope:
<For each={() => table().getRowModel().rows} by={(r) => r.id}>
  {(row) => <tr>...</tr>}
</For>
```

**Common mistakes**

- Passing options as a plain object instead of a function — signal reads are not tracked and the table never updates when data changes
- Reading `table` without calling it — `table` is a Computed, you must call `table()` to get the Table instance
- Forgetting getCoreRowModel() — TanStack Table requires at least getCoreRowModel in options or it throws
- Using `.map()` on rows instead of `<For>` — loses Pyreon's keyed reconciliation and fine-grained DOM updates

**See also:** `flexRender`

---

### flexRender `function`

```ts
<TData extends RowData, TValue>(component: Renderable<TValue>, props: TValue) => unknown
```

Render a TanStack Table column definition template (header, cell, or footer). Handles strings, numbers, functions (component functions or render functions), and VNodes. Returns the rendered output or null for undefined/null inputs. Use in JSX to render column definitions provided by TanStack Table.

**Example**

```tsx
// Header:
flexRender(header.column.columnDef.header, header.getContext())
// Cell:
flexRender(cell.column.columnDef.cell, cell.getContext())
```

**Common mistakes**

- Wrapping flexRender output in an extra function accessor — the result is already renderable JSX content
- Passing the column def directly instead of calling getContext() — TanStack Table requires the context object

**See also:** `useTable`

---

## Package-level notes

> **Note:** Options must be a FUNCTION `() => TableOptions<T>`, not a plain object. Signal reads inside the function are tracked reactively — changing any tracked signal re-syncs the table automatically.

> **Re-exports:** All TanStack Table core utilities (getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, etc.) and types are re-exported from `@pyreon/table` — no need to import from `@tanstack/table-core` separately.

> **Computed return:** useTable returns Computed&lt;Table&lt;T&gt;&gt;, not Table&lt;T&gt;. Always call `table()` to get the instance. Reading it inside `<For each={() => table().getRowModel().rows}>` makes the list reactive.
