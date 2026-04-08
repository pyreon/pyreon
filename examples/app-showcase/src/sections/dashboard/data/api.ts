import { customers, kpis, orders, revenueByCategory, revenueByDay } from './seed'
import type { Customer, Datum, Kpi, Order } from './types'

/**
 * Mock async API. Each call returns a Promise with a small delay so
 * the @pyreon/query integration looks identical to a real REST/GraphQL
 * setup — loading states, refetch, fetching indicators, etc.
 *
 * In a real app these would be `fetch('/api/orders').then(r => r.json())`.
 * The shapes are unchanged, so swapping in real network calls is a
 * one-line edit.
 */

/** Simulate network latency in milliseconds. */
const NETWORK_DELAY_MS = 250

function delay<T>(value: T, ms = NETWORK_DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

// ─── Queries ─────────────────────────────────────────────────────────

export function fetchKpis(): Promise<Kpi[]> {
  return delay(kpis)
}

export function fetchRevenueByDay(): Promise<Datum[]> {
  return delay(revenueByDay)
}

export function fetchRevenueByCategory(): Promise<Datum[]> {
  return delay(revenueByCategory)
}

export function fetchOrders(): Promise<Order[]> {
  return delay(orders)
}

export function fetchCustomers(): Promise<Customer[]> {
  return delay(customers, 400) // bigger payload, slightly longer
}

// ─── Mutations ───────────────────────────────────────────────────────

/**
 * "Refund" an order — flips the in-memory record's status. The mutation
 * is intentionally minimal so the showcase can demonstrate optimistic
 * updates and toast feedback without a real backend.
 */
export function refundOrder(id: string): Promise<Order> {
  const order = orders.find((o) => o.id === id)
  if (!order) return Promise.reject(new Error(`Order ${id} not found`))
  if (order.status === 'refunded') {
    return Promise.reject(new Error(`Order ${id} is already refunded`))
  }
  // Simulate occasional failures so the toast.error path is exercised.
  // Deterministic so the demo doesn't surprise users — every 7th order fails.
  const orderIndex = orders.findIndex((o) => o.id === id)
  if (orderIndex >= 0 && orderIndex % 7 === 6) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Payment processor unreachable')), NETWORK_DELAY_MS),
    )
  }
  order.status = 'refunded'
  return delay(order)
}
