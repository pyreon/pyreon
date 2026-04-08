import type { Customer, Datum, Kpi, Order, OrderCategory, OrderStatus } from './types'

/**
 * Deterministic seed data. Generated once at module load — the result
 * is stable across page reloads so the demo doesn't shimmer.
 */

const FIRST_NAMES = [
  'Aisha', 'Ben', 'Chiara', 'Dmitri', 'Elena', 'Felix', 'Gabriela',
  'Hiroshi', 'Ines', 'Jonas', 'Kira', 'Luca', 'Mei', 'Niko',
  'Olive', 'Priya', 'Quinn', 'Rafael', 'Sora', 'Tomas',
] as const

const LAST_NAMES = [
  'Aldridge', 'Brennan', 'Castellano', 'Diaz', 'Eriksson',
  'Fontaine', 'Greene', 'Hartwell', 'Iwasaki', 'Janowski',
] as const

const CATEGORIES: OrderCategory[] = ['apparel', 'electronics', 'home', 'books', 'beauty']
const STATUSES: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered', 'refunded']
const TIERS = ['free', 'pro', 'enterprise'] as const

/**
 * Simple deterministic PRNG (Mulberry32). Seeded so the data is the
 * same on every page load — important for demo screenshots and tests.
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = makeRng(0xc0ffee)

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T
}

function int(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

function randomName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`
}

function randomEmail(name: string): string {
  return `${name.toLowerCase().replace(' ', '.')}@example.com`
}

// ─── Customers ────────────────────────────────────────────────────────
const CUSTOMERS_COUNT = 1024

export const customers: Customer[] = Array.from({ length: CUSTOMERS_COUNT }, (_, i) => {
  const name = randomName()
  const ordersCount = int(1, 80)
  const ltv = ordersCount * int(40, 600)
  const daysAgo = int(0, 365)
  const lastSeen = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
  return {
    id: `cust_${i.toString().padStart(4, '0')}`,
    name,
    email: randomEmail(name),
    ltv,
    ordersCount,
    lastSeen,
    tier: pick(TIERS),
  }
})

// ─── Orders ────────────────────────────────────────────────────────────
const ORDERS_COUNT = 240

export const orders: Order[] = Array.from({ length: ORDERS_COUNT }, (_, i) => {
  const customer = customers[int(0, customers.length - 1)] as Customer
  const items = int(1, 8)
  const total = items * int(15, 250)
  const minutesAgo = int(0, 60 * 24 * 30)
  const createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  return {
    id: `ord_${(10000 + i).toString()}`,
    customer: customer.name,
    customerEmail: customer.email,
    status: pick(STATUSES),
    category: pick(CATEGORIES),
    total,
    items,
    createdAt,
  }
}).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

// ─── KPIs ────────────────────────────────────────────────────────────
function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0)
const ordersDelivered = orders.filter((o) => o.status === 'delivered').length
const conversion = (ordersDelivered / orders.length) * 100

export const kpis: Kpi[] = [
  { label: 'Revenue', value: fmtUsd(totalRevenue), delta: '+12.4%', trend: 'up' },
  { label: 'Orders', value: orders.length.toLocaleString(), delta: '+4.1%', trend: 'up' },
  { label: 'Customers', value: customers.length.toLocaleString(), delta: '+8.7%', trend: 'up' },
  { label: 'Conversion', value: `${conversion.toFixed(1)}%`, delta: '-1.2%', trend: 'down' },
]

// ─── Chart series ────────────────────────────────────────────────────
/**
 * Last 14 days of revenue. Each point is `[YYYY-MM-DD, revenue]`.
 */
export const revenueByDay: Datum[] = (() => {
  const buckets = new Map<string, number>()
  for (const order of orders) {
    const day = order.createdAt.slice(0, 10)
    buckets.set(day, (buckets.get(day) ?? 0) + order.total)
  }
  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-14) as Datum[]
})()

/**
 * Total revenue per category — used for the bar chart.
 */
export const revenueByCategory: Datum[] = (() => {
  const buckets = new Map<OrderCategory, number>()
  for (const order of orders) {
    buckets.set(order.category, (buckets.get(order.category) ?? 0) + order.total)
  }
  return Array.from(buckets.entries()).map(([k, v]) => [k, Math.round(v)] as Datum)
})()
