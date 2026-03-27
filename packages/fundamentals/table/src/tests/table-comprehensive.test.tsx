import { type Computed, computed, signal } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"
import type { ColumnDef } from "../index"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useTable,
} from "../index"

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Person {
  name: string
  age: number
}

const defaultData: Person[] = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
  { name: "Charlie", age: 35 },
]

const defaultColumns: ColumnDef<Person, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" },
]

function mountWithTable<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement("div")
  document.body.appendChild(el)
  const Wrapper = () => {
    result = fn()
    return null
  }
  const unmount = mount(<Wrapper />, el)
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

// ─── useTable — creates reactive table ─────────────────────────────────────

describe("useTable — reactive table creation", () => {
  it("creates a table instance with correct row count", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    expect(table().getRowModel().rows).toHaveLength(3)
    unmount()
  })

  it("table signal is a computed that returns a Table instance", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    expect(typeof table).toBe("function")
    const inst = table()
    expect(inst.getRowModel).toBeDefined()
    expect(inst.getHeaderGroups).toBeDefined()
    expect(inst.getAllColumns).toBeDefined()
    unmount()
  })

  it("rows contain original data", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    const rows = table().getRowModel().rows
    expect(rows[0]!.original).toEqual({ name: "Alice", age: 30 })
    expect(rows[1]!.original).toEqual({ name: "Bob", age: 25 })
    expect(rows[2]!.original).toEqual({ name: "Charlie", age: 35 })
    unmount()
  })
})

// ─── flexRender — rendering column defs ────────────────────────────────────

describe("flexRender — comprehensive", () => {
  it("renders string directly", () => {
    expect(flexRender("Hello", {})).toBe("Hello")
  })

  it("renders number directly", () => {
    expect(flexRender(42, {})).toBe(42)
    expect(flexRender(0, {})).toBe(0)
    expect(flexRender(-1, {})).toBe(-1)
  })

  it("renders null for undefined", () => {
    expect(flexRender(undefined, {})).toBeNull()
  })

  it("renders null for null", () => {
    expect(flexRender(null, {})).toBeNull()
  })

  it("calls function component with props", () => {
    const fn = (props: { value: string }) => `Value: ${props.value}`
    expect(flexRender(fn, { value: "test" })).toBe("Value: test")
  })

  it("function component receives full context props", () => {
    const fn = (props: { a: number; b: string }) => `${props.a}-${props.b}`
    expect(flexRender(fn, { a: 1, b: "x" })).toBe("1-x")
  })

  it("passes through VNode objects", () => {
    const vnode = <span>content</span>
    expect(flexRender(vnode as unknown, {})).toBe(vnode)
  })

  it("returns null for boolean", () => {
    expect(flexRender(true as unknown, {})).toBeNull()
    expect(flexRender(false as unknown, {})).toBeNull()
  })

  it("returns null for plain object (non-VNode)", () => {
    expect(flexRender({} as unknown, {})).toBeNull()
    expect(flexRender({ foo: "bar" } as unknown, {})).toBeNull()
  })

  it("returns null for array", () => {
    expect(flexRender([] as unknown, {})).toBeNull()
  })
})

// ─── Reactive table options ────────────────────────────────────────────────

describe("useTable — reactive options (signal-driven)", () => {
  it("data signal changes update row model", () => {
    const data = signal<Person[]>(defaultData)
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: data(),
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    expect(table().getRowModel().rows).toHaveLength(3)

    data.set([{ name: "Diana", age: 28 }])
    expect(table().getRowModel().rows).toHaveLength(1)
    expect(table().getRowModel().rows[0]!.original.name).toBe("Diana")

    data.set([])
    expect(table().getRowModel().rows).toHaveLength(0)
    unmount()
  })

  it("column signal changes update column model", () => {
    const cols = signal<ColumnDef<Person, unknown>[]>(defaultColumns)
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: cols(),
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    expect(table().getAllColumns()).toHaveLength(2)

    cols.set([{ accessorKey: "name", header: "Name" }])
    expect(table().getAllColumns()).toHaveLength(1)
    expect(table().getAllColumns()[0]!.id).toBe("name")
    unmount()
  })

  it("computed derived from table re-evaluates on data change", () => {
    const data = signal<Person[]>(defaultData)
    let rowCount: Computed<number> | undefined

    const { unmount } = mountWithTable(() => {
      const table = useTable(() => ({
        data: data(),
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      }))
      rowCount = computed(() => table().getRowModel().rows.length)
      return table
    })

    expect(rowCount!()).toBe(3)

    data.set([defaultData[0]!])
    expect(rowCount!()).toBe(1)

    data.set([...defaultData, { name: "X", age: 1 }])
    expect(rowCount!()).toBe(4)
    unmount()
  })
})

// ─── Sorting ───────────────────────────────────────────────────────────────

describe("useTable — sorting", () => {
  it("toggleSorting by age ascending", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      })),
    )

    table().getColumn("age")!.toggleSorting(false)
    const rows = table().getRowModel().rows
    expect(rows[0]!.original.age).toBe(25)
    expect(rows[1]!.original.age).toBe(30)
    expect(rows[2]!.original.age).toBe(35)
    unmount()
  })

  it("toggleSorting by age descending", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      })),
    )

    table().getColumn("age")!.toggleSorting(true)
    const rows = table().getRowModel().rows
    expect(rows[0]!.original.age).toBe(35)
    expect(rows[2]!.original.age).toBe(25)
    unmount()
  })

  it("sorting state reflected in getState()", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      })),
    )

    expect(table().getState().sorting).toEqual([])
    table().getColumn("name")!.toggleSorting(false)
    expect(table().getState().sorting).toEqual([{ id: "name", desc: false }])
    unmount()
  })
})

// ─── Filtering ─────────────────────────────────────────────────────────────

describe("useTable — filtering", () => {
  it("setFilterValue filters rows by partial match", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
      })),
    )

    table().getColumn("name")!.setFilterValue("Bob")
    const rows = table().getRowModel().rows
    expect(rows).toHaveLength(1)
    expect(rows[0]!.original.name).toBe("Bob")
    unmount()
  })

  it("clearing filter restores all rows", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
      })),
    )

    table().getColumn("name")!.setFilterValue("Alice")
    expect(table().getRowModel().rows).toHaveLength(1)

    table().getColumn("name")!.setFilterValue("")
    expect(table().getRowModel().rows).toHaveLength(3)
    unmount()
  })
})

// ─── Pagination ────────────────────────────────────────────────────────────

describe("useTable — pagination", () => {
  const bigData: Person[] = Array.from({ length: 25 }, (_, i) => ({
    name: `Person ${i}`,
    age: 20 + i,
  }))

  it("default page size is 10", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: bigData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
      })),
    )

    expect(table().getRowModel().rows).toHaveLength(10)
    unmount()
  })

  it("can navigate pages", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: bigData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
      })),
    )

    expect(table().getCanNextPage()).toBe(true)
    expect(table().getCanPreviousPage()).toBe(false)

    table().nextPage()
    expect(table().getRowModel().rows[0]!.original.name).toBe("Person 10")

    table().nextPage()
    expect(table().getRowModel().rows).toHaveLength(5) // last page has 5
    expect(table().getCanNextPage()).toBe(false)
    unmount()
  })
})

// ─── createColumnHelper ────────────────────────────────────────────────────

describe("createColumnHelper", () => {
  it("creates typed column definitions", () => {
    const helper = createColumnHelper<Person>()
    const cols = [
      helper.accessor("name", { header: "Full Name" }),
      helper.accessor("age", { header: "Years" }),
    ]

    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: cols,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    const headers = table().getHeaderGroups()[0]!.headers
    expect(headers).toHaveLength(2)
    expect(headers[0]!.id).toBe("name")
    expect(headers[1]!.id).toBe("age")
    unmount()
  })
})

// ─── Column visibility ─────────────────────────────────────────────────────

describe("useTable — column visibility", () => {
  it("hides and shows columns", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    expect(table().getVisibleFlatColumns()).toHaveLength(2)

    table().getColumn("age")!.toggleVisibility(false)
    expect(table().getVisibleFlatColumns()).toHaveLength(1)
    expect(table().getVisibleFlatColumns()[0]!.id).toBe("name")

    table().getColumn("age")!.toggleVisibility(true)
    expect(table().getVisibleFlatColumns()).toHaveLength(2)
    unmount()
  })
})

// ─── Row selection ─────────────────────────────────────────────────────────

describe("useTable — row selection", () => {
  it("selects and deselects rows", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        enableRowSelection: true,
      })),
    )

    expect(table().getSelectedRowModel().rows).toHaveLength(0)

    table().getRowModel().rows[1]!.toggleSelected(true)
    expect(table().getSelectedRowModel().rows).toHaveLength(1)
    expect(table().getSelectedRowModel().rows[0]!.original.name).toBe("Bob")

    table().getRowModel().rows[1]!.toggleSelected(false)
    expect(table().getSelectedRowModel().rows).toHaveLength(0)
    unmount()
  })
})

// ─── onStateChange edge case ───────────────────────────────────────────────

describe("useTable — onStateChange", () => {
  it("handles non-function updater (plain state object)", () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      })),
    )

    const currentState = table().getState()
    const newState = {
      ...currentState,
      sorting: [{ id: "name", desc: true }],
    }

    table().options.onStateChange(newState as any)
    expect(table().getState().sorting).toEqual([{ id: "name", desc: true }])
    unmount()
  })

  it("forwards updater to user-provided onStateChange callback", () => {
    const stateChanges: unknown[] = []
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        onStateChange: (updater) => {
          stateChanges.push(updater)
        },
      })),
    )

    const currentState = table().getState()
    table().options.onStateChange({ ...currentState, columnOrder: ["age", "name"] } as any)

    expect(stateChanges.length).toBeGreaterThanOrEqual(1)
    unmount()
  })
})
