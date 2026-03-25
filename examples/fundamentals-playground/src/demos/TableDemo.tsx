import type { VNodeChild } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import type { SortingState } from "@pyreon/table"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useTable,
} from "@pyreon/table"

interface Employee {
  id: number
  name: string
  department: string
  salary: number
  startDate: string
}

const employees: Employee[] = [
  {
    id: 1,
    name: "Alice Johnson",
    department: "Engineering",
    salary: 120000,
    startDate: "2021-03-15",
  },
  {
    id: 2,
    name: "Bob Smith",
    department: "Marketing",
    salary: 95000,
    startDate: "2020-06-01",
  },
  {
    id: 3,
    name: "Carol Williams",
    department: "Engineering",
    salary: 135000,
    startDate: "2019-01-10",
  },
  {
    id: 4,
    name: "David Brown",
    department: "Sales",
    salary: 88000,
    startDate: "2022-09-20",
  },
  {
    id: 5,
    name: "Eve Davis",
    department: "Engineering",
    salary: 115000,
    startDate: "2023-02-28",
  },
  {
    id: 6,
    name: "Frank Miller",
    department: "Marketing",
    salary: 92000,
    startDate: "2021-11-05",
  },
  {
    id: 7,
    name: "Grace Lee",
    department: "Sales",
    salary: 97000,
    startDate: "2020-04-12",
  },
  {
    id: 8,
    name: "Henry Wilson",
    department: "Engineering",
    salary: 145000,
    startDate: "2018-07-22",
  },
  {
    id: 9,
    name: "Iris Chen",
    department: "Sales",
    salary: 105000,
    startDate: "2022-01-30",
  },
  {
    id: 10,
    name: "Jack Taylor",
    department: "Marketing",
    salary: 89000,
    startDate: "2023-06-14",
  },
  {
    id: 11,
    name: "Kate Moore",
    department: "Engineering",
    salary: 128000,
    startDate: "2019-09-08",
  },
  {
    id: 12,
    name: "Liam Anderson",
    department: "Sales",
    salary: 91000,
    startDate: "2021-05-19",
  },
]

const columnHelper = createColumnHelper<Employee>()
const columns = [
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("department", { header: "Department" }),
  columnHelper.accessor("salary", {
    header: "Salary",
    cell: (info) => `$${info.getValue().toLocaleString()}`,
  }),
  columnHelper.accessor("startDate", {
    header: "Start Date",
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
]

export function TableDemo() {
  const sorting = signal<SortingState>([])
  const globalFilter = signal("")

  const table = useTable(() => ({
    data: employees,
    columns,
    state: {
      sorting: sorting(),
      globalFilter: globalFilter(),
    },
    onSortingChange: (updater: any) => {
      sorting.set(typeof updater === "function" ? updater(sorting()) : updater)
    },
    onGlobalFilterChange: (updater: any) => {
      globalFilter.set(typeof updater === "function" ? updater(globalFilter()) : updater)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  }))

  return (
    <div>
      <h2>Table</h2>
      <p class="desc">
        TanStack Table adapter. Sorting, filtering, and pagination with reactive signals.
      </p>

      <div class="section">
        <h3>Employee Directory</h3>
        <input
          placeholder="Search all columns..."
          value={globalFilter()}
          onInput={(e: Event) => globalFilter.set((e.target as HTMLInputElement).value)}
          style="margin-bottom: 12px"
        />

        <table>
          <thead>
            {() =>
              table()
                .getHeaderGroups()
                .map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                        {
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          ) as VNodeChild
                        }
                        {header.column.getIsSorted() === "asc"
                          ? " ↑"
                          : header.column.getIsSorted() === "desc"
                            ? " ↓"
                            : ""}
                      </th>
                    ))}
                  </tr>
                ))
            }
          </thead>
          <tbody>
            {() =>
              table()
                .getRowModel()
                .rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext()) as VNodeChild}
                      </td>
                    ))}
                  </tr>
                ))
            }
          </tbody>
        </table>

        <div class="row" style="margin-top: 12px">
          <button onClick={() => table().previousPage()} disabled={!table().getCanPreviousPage()}>
            Previous
          </button>
          <span style="font-size: 13px">
            Page {() => table().getState().pagination.pageIndex + 1} of{" "}
            {() => table().getPageCount()}
          </span>
          <button onClick={() => table().nextPage()} disabled={!table().getCanNextPage()}>
            Next
          </button>
          <span class="badge gray" style="margin-left: auto">
            {() => table().getFilteredRowModel().rows.length} of {employees.length} rows
          </span>
        </div>
      </div>
    </div>
  )
}
