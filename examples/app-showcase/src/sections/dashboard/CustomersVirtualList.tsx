import { useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { useVirtualizer } from '@pyreon/virtual'
import { fetchCustomers } from './data/api'
import type { Customer } from './data/types'
import {
  CustomerAvatar,
  CustomerName,
  CustomerNameMain,
  CustomerNameSub,
  CustomerRow,
  StateCard,
  TierBadge,
  VirtualInner,
  VirtualScroll,
} from './styled'

const ROW_HEIGHT = 56

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * Virtualized customers list.
 *
 * Demonstrates `@pyreon/virtual` (TanStack Virtual adapter) for
 * scrolling 1k+ rows at 60fps. Only the rows currently visible in the
 * viewport are rendered; the rest exists only as a `totalSize` height
 * on the inner spacer div.
 */
export function CustomersVirtualList() {
  // ── Fetch customers via @pyreon/query ──────────────────────────────
  const customersQuery = useQuery<Customer[]>(() => ({
    queryKey: ['dashboard', 'customers'],
    queryFn: fetchCustomers,
  }))

  // The scroll container — captured via ref so the virtualizer knows
  // which element it's measuring.
  const scrollEl = signal<HTMLElement | null>(null)
  const setScrollRef = (el: HTMLElement | null) => scrollEl.set(el)

  // ── Virtualizer ─────────────────────────────────────────────────────
  const virtual = useVirtualizer<HTMLElement, HTMLElement>(() => ({
    count: customersQuery.data()?.length ?? 0,
    getScrollElement: () => scrollEl(),
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  }))

  return () => {
    if (customersQuery.isPending()) {
      return <StateCard>Loading customers…</StateCard>
    }
    const customers = customersQuery.data() ?? []
    if (customers.length === 0) {
      return <StateCard>No customers found.</StateCard>
    }
    return (
      <VirtualScroll innerRef={setScrollRef}>
        <VirtualInner style={`--total-h: ${virtual.totalSize()}px`}>
          {() =>
            virtual.virtualItems().map((item) => {
              const customer = customers[item.index]
              if (!customer) return null
              // CSS variables — see styled.ts CustomerRow comment for the
              // virtualization pattern. The styled component reads `--row-h`
              // and `--row-y` to position itself; the styled class itself
              // is shared across all rows so the stylesheet stays small.
              return (
                <CustomerRow style={`--row-h: ${item.size}px; --row-y: ${item.start}px`}>
                  <CustomerAvatar>{initials(customer.name)}</CustomerAvatar>
                  <CustomerName>
                    <CustomerNameMain>{customer.name}</CustomerNameMain>
                    <CustomerNameSub>{customer.email}</CustomerNameSub>
                  </CustomerName>
                  <span>{customer.ordersCount} orders</span>
                  <span>{fmtUsd(customer.ltv)}</span>
                  <span>{customer.lastSeen}</span>
                  <TierBadge $tier={customer.tier}>{customer.tier}</TierBadge>
                </CustomerRow>
              )
            })
          }
        </VirtualInner>
      </VirtualScroll>
    )
  }
}
