/**
 * Types for the dashboard mock data layer.
 *
 * Everything here is the shape a real backend would return — the
 * mock fetch functions in `data/api.ts` simulate latency around them
 * so the @pyreon/query and @pyreon/table integration looks identical
 * to a real REST/GraphQL setup.
 */

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'refunded'
export type OrderCategory = 'apparel' | 'electronics' | 'home' | 'books' | 'beauty'

export interface Order {
  id: string
  customer: string
  customerEmail: string
  status: OrderStatus
  category: OrderCategory
  total: number
  items: number
  /** ISO 8601 created timestamp. */
  createdAt: string
}

export interface Customer {
  id: string
  name: string
  email: string
  /** Lifetime spend in USD. */
  ltv: number
  ordersCount: number
  /** ISO date of most recent order. */
  lastSeen: string
  /** Account tier — drives the badge color. */
  tier: 'free' | 'pro' | 'enterprise'
}

export interface Kpi {
  /** Display label. */
  label: string
  /** Formatted value (e.g. "$184.2K"). */
  value: string
  /** Change vs previous period, formatted (e.g. "+12.4%"). */
  delta: string
  /** Whether the delta is a positive change. */
  trend: 'up' | 'down'
}

/** A `[label, value]` tuple for chart series. */
export type Datum = readonly [string, number]
