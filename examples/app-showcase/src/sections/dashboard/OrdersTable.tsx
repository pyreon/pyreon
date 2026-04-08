import { useMutation, useQuery, useQueryClient } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'
import {
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  useTable,
} from '@pyreon/table'
import { toast } from '@pyreon/toast'
import { useUrlState } from '@pyreon/url-state'
import { useDashboardPermissions } from './permissions'
import { fetchOrders, refundOrder } from './data/api'
import type { Order, OrderStatus } from './data/types'
import {
  ActionButton,
  PageButton,
  PageButtons,
  Pagination,
  StateCard,
  StatusFilter,
  StatusPill,
  Table,
  TableCard,
  TableRow,
  TableSearchInput,
  TableToolbar,
  Td,
  Th,
} from './styled'

const STATUS_OPTIONS: Array<'all' | OrderStatus> = [
  'all',
  'pending',
  'processing',
  'shipped',
  'delivered',
  'refunded',
]

const PAGE_SIZE = 10

function fmtUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

interface ColumnSpec {
  /** Field id — also used as the TanStack accessor key. */
  id: keyof Order | 'actions'
  /** Display label in the sortable header. */
  label: string
  /** Whether the user can sort by this column. */
  sortable: boolean
}

/**
 * Static column specs. Cell rendering happens inline in the row map
 * below — TanStack Table is only used for the sort/pagination state
 * machine, not for cell render functions. This keeps the column
 * defs free of JSX (which the Pyreon compiler can't always inline
 * cleanly when JSX lives inside an object literal inside an array).
 */
const COLUMNS: ColumnSpec[] = [
  { id: 'id', label: 'Order', sortable: true },
  { id: 'customer', label: 'Customer', sortable: true },
  { id: 'category', label: 'Category', sortable: true },
  { id: 'items', label: 'Items', sortable: true },
  { id: 'total', label: 'Total', sortable: true },
  { id: 'status', label: 'Status', sortable: false },
  { id: 'createdAt', label: 'Created', sortable: true },
  { id: 'actions', label: '', sortable: false },
]

/**
 * Orders table — the core dashboard widget.
 *
 * Demonstrates:
 *   • @pyreon/query useQuery for fetching, useMutation for refund actions
 *   • @pyreon/table TanStack adapter for sort state (cells rendered inline)
 *   • @pyreon/url-state for the search query and status filter
 *   • @pyreon/rx for the search + filter pipeline (signal-aware combine)
 *   • @pyreon/toast for success/error feedback after mutations
 *   • @pyreon/permissions to disable the refund action when in viewer mode
 */
export function OrdersTable() {
  const can = useDashboardPermissions()
  const queryClient = useQueryClient()

  // ── Fetch orders via @pyreon/query ──────────────────────────────────
  const ordersQuery = useQuery<Order[]>(() => ({
    queryKey: ['dashboard', 'orders'],
    queryFn: fetchOrders,
  }))

  const ordersAccessor = (): Order[] => ordersQuery.data() ?? []

  // ── URL state for filters ───────────────────────────────────────────
  const search = useUrlState('q', '')
  const status = useUrlState('status', 'all' as 'all' | OrderStatus)

  // ── Reactive filter pipeline via @pyreon/rx ─────────────────────────
  const filtered = rx.combine(
    ordersAccessor,
    search,
    status,
    (rows, query, currentStatus) => {
      const needle = query.trim().toLowerCase()
      return rows.filter((order) => {
        if (currentStatus !== 'all' && order.status !== currentStatus) return false
        if (!needle) return true
        return (
          order.id.toLowerCase().includes(needle) ||
          order.customer.toLowerCase().includes(needle) ||
          order.customerEmail.toLowerCase().includes(needle)
        )
      })
    },
  )

  // ── Refund mutation with optimistic toast feedback ───────────────────
  const refundMutation = useMutation<Order, Error, string, { toastId: string }>({
    mutationFn: refundOrder,
    onMutate: (id) => {
      const toastId = toast.loading(`Refunding order ${id}…`)
      return { toastId }
    },
    onSuccess: (order, _id, ctx) => {
      if (ctx?.toastId) {
        toast.update(ctx.toastId, { type: 'success', message: `Order ${order.id} refunded` })
      } else {
        toast.success(`Order ${order.id} refunded`)
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'orders'] })
    },
    onError: (error, _id, ctx) => {
      const message = error instanceof Error ? error.message : 'Refund failed'
      if (ctx?.toastId) {
        toast.update(ctx.toastId, { type: 'error', message })
      } else {
        toast.error(message)
      }
    },
  })

  // ── Pagination state — driven from a local signal so it resets to
  //    page 1 whenever filters change.
  const pageIndex = signal(0)

  // Plain TanStack column defs — only used to drive the sort state.
  // No `cell` render functions; cells are rendered inline below.
  const tableColumns: ColumnDef<Order>[] = COLUMNS.filter((c) => c.id !== 'actions').map((c) => ({
    accessorKey: c.id as keyof Order,
    enableSorting: c.sortable,
  }))

  // ── Reactive TanStack Table instance — used purely for sort state ──
  const table = useTable<Order>(() => ({
    data: filtered(),
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  }))

  // Sorted + paginated rows for the current page.
  const visibleRows = (): Order[] => {
    const sorted = table().getSortedRowModel().rows.map((row) => row.original)
    const start = pageIndex() * PAGE_SIZE
    return sorted.slice(start, start + PAGE_SIZE)
  }
  const pageCount = (): number => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE))

  function changePage(next: number) {
    const max = pageCount() - 1
    pageIndex.set(Math.max(0, Math.min(max, next)))
  }

  function toggleSort(columnId: string) {
    const column = table().getColumn(columnId)
    if (column?.getCanSort()) column.toggleSorting()
  }

  function sortIndicator(columnId: string): string {
    const dir = table().getColumn(columnId)?.getIsSorted()
    return dir === 'asc' ? ' ↑' : dir === 'desc' ? ' ↓' : ''
  }

  return (
    <TableCard>
      <TableToolbar>
        <TableSearchInput
          type="text"
          placeholder="Search orders by id, customer, or email…"
          value={search()}
          onInput={(e: Event) => {
            search.set((e.target as HTMLInputElement).value)
            pageIndex.set(0)
          }}
        />
        <StatusFilter
          value={status()}
          onChange={(e: Event) => {
            const next = (e.target as HTMLSelectElement).value as 'all' | OrderStatus
            status.set(next)
            pageIndex.set(0)
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option value={opt}>{opt === 'all' ? 'All statuses' : opt}</option>
          ))}
        </StatusFilter>
      </TableToolbar>

      {() => {
        if (ordersQuery.isPending()) {
          return <StateCard>Loading orders…</StateCard>
        }
        const rows = visibleRows()
        if (rows.length === 0) {
          return <StateCard>No orders match the current filters.</StateCard>
        }
        return (
          <Table>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <Th
                    $sortable={column.sortable}
                    onClick={() => toggleSort(column.id)}
                  >
                    {column.label}
                    {column.sortable ? <span>{sortIndicator(column.id)}</span> : null}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <TableRow>
                  <Td>{order.id}</Td>
                  <Td>{order.customer}</Td>
                  <Td>{order.category}</Td>
                  <Td>{order.items}</Td>
                  <Td>{fmtUsd(order.total)}</Td>
                  <Td>
                    <StatusPill $status={order.status}>{order.status}</StatusPill>
                  </Td>
                  <Td>{fmtDate(order.createdAt)}</Td>
                  <Td>
                    <ActionButton
                      type="button"
                      $variant="danger"
                      disabled={
                        order.status === 'refunded' ||
                        !can('orders.refund') ||
                        refundMutation.isPending()
                      }
                      onClick={() => refundMutation.mutate(order.id)}
                    >
                      Refund
                    </ActionButton>
                  </Td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        )
      }}

      <Pagination>
        <span>
          {() => {
            const total = filtered().length
            const start = pageIndex() * PAGE_SIZE
            const end = Math.min(start + PAGE_SIZE, total)
            return total === 0 ? '0 results' : `${start + 1}–${end} of ${total}`
          }}
        </span>
        <PageButtons>
          <PageButton type="button" disabled={pageIndex() === 0} onClick={() => changePage(pageIndex() - 1)}>
            ← Prev
          </PageButton>
          <PageButton $active>{pageIndex() + 1}</PageButton>
          <PageButton
            type="button"
            disabled={pageIndex() >= pageCount() - 1}
            onClick={() => changePage(pageIndex() + 1)}
          >
            Next →
          </PageButton>
        </PageButtons>
      </Pagination>
    </TableCard>
  )
}
