import { type Computed, computed, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import type { ColumnDef } from '../index'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useTable,
} from '../index'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Person {
  name: string
  age: number
}

const defaultData: Person[] = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 },
]

const defaultColumns: ColumnDef<Person, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'age', header: 'Age' },
]

function mountWithTable<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
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

// ─── useTable ─────────────────────────────────────────────────────────────────

describe('useTable', () => {
  it('creates a table with core row model', () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    const rows = table().getRowModel().rows
    expect(rows).toHaveLength(3)
    expect(rows[0]!.original.name).toBe('Alice')
    expect(rows[1]!.original.name).toBe('Bob')
    expect(rows[2]!.original.name).toBe('Charlie')
    unmount()
  })

  it('returns correct header groups', () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    const headerGroups = table().getHeaderGroups()
    expect(headerGroups).toHaveLength(1)
    expect(headerGroups[0]!.headers).toHaveLength(2)
    unmount()
  })

  it('reactive data — table updates when data signal changes', () => {
    const data = signal<Person[]>(defaultData)
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: data(),
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    expect(table().getRowModel().rows).toHaveLength(3)

    data.set([...defaultData, { name: 'Diana', age: 28 }])
    expect(table().getRowModel().rows).toHaveLength(4)
    expect(table().getRowModel().rows[3]!.original.name).toBe('Diana')
    unmount()
  })

  it('reactive subscribers — computed derived from table re-evaluates on data change', () => {
    const data = signal<Person[]>(defaultData)
    let rowCount: Computed<number> | undefined

    const { unmount } = mountWithTable(() => {
      const table = useTable(() => ({
        data: data(),
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      }))
      // A computed that depends on the table signal — should re-evaluate
      // when data changes, proving the signal actually notifies subscribers.
      rowCount = computed(() => table().getRowModel().rows.length)
      return table
    })

    expect(rowCount!()).toBe(3)

    data.set([...defaultData, { name: 'Diana', age: 28 }])
    expect(rowCount!()).toBe(4)

    data.set([defaultData[0]!])
    expect(rowCount!()).toBe(1)
    unmount()
  })

  it('reactive columns — table updates when columns signal changes', () => {
    const cols = signal<ColumnDef<Person, unknown>[]>(defaultColumns)
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: cols(),
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    expect(table().getAllColumns()).toHaveLength(2)

    cols.set([{ accessorKey: 'name', header: 'Name' }])
    expect(table().getAllColumns()).toHaveLength(1)
    unmount()
  })

  it('sorting — toggleSorting updates row order', () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      })),
    )

    // Sort by age ascending
    table().getColumn('age')!.toggleSorting(false)
    const rows = table().getRowModel().rows
    expect(rows[0]!.original.age).toBe(25)
    expect(rows[1]!.original.age).toBe(30)
    expect(rows[2]!.original.age).toBe(35)

    // Sort by age descending
    table().getColumn('age')!.toggleSorting(true)
    const desc = table().getRowModel().rows
    expect(desc[0]!.original.age).toBe(35)
    expect(desc[2]!.original.age).toBe(25)
    unmount()
  })

  it('filtering — setFilterValue filters rows', () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
      })),
    )

    table().getColumn('name')!.setFilterValue('Ali')
    const filtered = table().getRowModel().rows
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.original.name).toBe('Alice')
    unmount()
  })

  it('pagination — page size and navigation', () => {
    const bigData: Person[] = Array.from({ length: 25 }, (_, i) => ({
      name: `Person ${i}`,
      age: 20 + i,
    }))

    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: bigData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
      })),
    )

    // Default page size is 10
    expect(table().getRowModel().rows).toHaveLength(10)
    expect(table().getCanNextPage()).toBe(true)
    expect(table().getCanPreviousPage()).toBe(false)

    table().nextPage()
    expect(table().getRowModel().rows).toHaveLength(10)
    expect(table().getRowModel().rows[0]!.original.name).toBe('Person 10')

    table().nextPage()
    expect(table().getRowModel().rows).toHaveLength(5)
    expect(table().getCanNextPage()).toBe(false)
    unmount()
  })

  it('row selection — toggleRowSelected updates selection state', () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        enableRowSelection: true,
      })),
    )

    expect(table().getSelectedRowModel().rows).toHaveLength(0)

    table().getRowModel().rows[0]!.toggleSelected(true)
    expect(table().getSelectedRowModel().rows).toHaveLength(1)
    expect(table().getSelectedRowModel().rows[0]!.original.name).toBe('Alice')

    table().getRowModel().rows[0]!.toggleSelected(false)
    expect(table().getSelectedRowModel().rows).toHaveLength(0)
    unmount()
  })

  it('column visibility — toggleVisibility hides columns', () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    expect(table().getVisibleFlatColumns()).toHaveLength(2)

    table().getColumn('age')!.toggleVisibility(false)
    expect(table().getVisibleFlatColumns()).toHaveLength(1)
    expect(table().getVisibleFlatColumns()[0]!.id).toBe('name')

    table().getColumn('age')!.toggleVisibility(true)
    expect(table().getVisibleFlatColumns()).toHaveLength(2)
    unmount()
  })

  it('getState returns merged state', () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      })),
    )

    expect(table().getState().sorting).toEqual([])
    table().getColumn('name')!.toggleSorting(false)
    expect(table().getState().sorting).toEqual([{ id: 'name', desc: false }])
    unmount()
  })

  it('createColumnHelper works with useTable', () => {
    const columnHelper = createColumnHelper<Person>()
    const columns = [
      columnHelper.accessor('name', { header: 'Full Name' }),
      columnHelper.accessor('age', { header: 'Years' }),
    ]

    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns,
        getCoreRowModel: getCoreRowModel(),
      })),
    )

    const headers = table().getHeaderGroups()[0]!.headers
    expect(headers).toHaveLength(2)
    unmount()
  })
})

// ─── flexRender ──────────────────────────────────────────────────────────────

describe('flexRender', () => {
  it('renders a string directly', () => {
    expect(flexRender('Hello', {})).toBe('Hello')
  })

  it('renders a number directly', () => {
    expect(flexRender(42, {})).toBe(42)
  })

  it('renders null for undefined/null', () => {
    expect(flexRender(undefined, {})).toBeNull()
    expect(flexRender(null, {})).toBeNull()
  })

  it('calls a function with props', () => {
    const fn = (props: { value: string }) => `Value: ${props.value}`
    expect(flexRender(fn, { value: 'test' })).toBe('Value: test')
  })

  it('passes through VNodes as-is', () => {
    const vnode = <span>cell content</span>
    const result = flexRender(vnode as unknown, {})
    expect(result).toBe(vnode)
  })

  it('returns null for unsupported types', () => {
    expect(flexRender(true as unknown, {})).toBeNull()
    expect(flexRender({} as unknown, {})).toBeNull()
  })
})

// ─── onStateChange with non-function updater ─────────────────────────────────

describe('useTable — onStateChange with direct state object', () => {
  it('handles a non-function updater (plain state object) passed to onStateChange', () => {
    const { result: table, unmount } = mountWithTable(() =>
      useTable(() => ({
        data: defaultData,
        columns: defaultColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      })),
    )

    // Grab the current full state, then call onStateChange with a direct
    // state object (not an updater function) to exercise the else-branch.
    const currentState = table().getState()
    const newState = {
      ...currentState,
      sorting: [{ id: 'name', desc: true }],
    }

    // Access the resolved onStateChange and invoke it with a plain object
    table().options.onStateChange(newState as any)

    // The table should now reflect the new sorting state
    expect(table().getState().sorting).toEqual([{ id: 'name', desc: true }])
    unmount()
  })

  it('propagates non-function updater to user-provided onStateChange callback', () => {
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
    const newState = { ...currentState, columnOrder: ['age', 'name'] }

    table().options.onStateChange(newState as any)

    // The user callback should have received the plain state object
    expect(stateChanges.length).toBeGreaterThanOrEqual(1)
    const lastChange = stateChanges[stateChanges.length - 1]
    expect(lastChange).toEqual(expect.objectContaining({ columnOrder: ['age', 'name'] }))
    unmount()
  })
})
