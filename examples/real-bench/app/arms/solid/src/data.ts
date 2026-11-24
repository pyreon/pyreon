/**
 * The shared data and pure helpers of the real-bench catalogue app.
 *
 * Every arm copies this file VERBATIM (its path is named in the arm's
 * `arm.json` → `dataFile`); the harness refuses to build or measure an arm
 * whose copy differs. The harness imports the same file to compute what the
 * correctness gate expects, so the arms and the gate cannot disagree about
 * the data.
 *
 * What lives here is the work every arm must do identically: generating the
 * records, the filter predicate and comparators, the aggregate, the validation
 * rules and every user-visible string. What does NOT live here is how an arm
 * holds state, derives from it, routes and renders — that is the framework
 * work the benchmark compares.
 *
 * Every number shown in the UI is stringified HERE (`formatStock`,
 * `countLabel`, …), never by a framework's own text-node conversion, so V8's
 * number-string cache is charged the same way in every arm (see the heap
 * trap in `.agents/guides/benchmarks/README.md`).
 */

export const CATEGORIES = [
  'Books',
  'Electronics',
  'Garden',
  'Grocery',
  'Health',
  'Home',
  'Sports',
  'Toys',
] as const

export type Category = (typeof CATEGORIES)[number]

export interface Product {
  id: number
  name: string
  category: Category
  priceCents: number
  stock: number
  /** 1.0 – 5.0, one decimal. */
  rating: number
}

export const PRODUCT_COUNT = 5000
export const PAGE_SIZE = 50
const SEED = 20261123

const ADJECTIVES = [
  'Amber',
  'Bold',
  'Brass',
  'Calm',
  'Cedar',
  'Coral',
  'Crisp',
  'Dusky',
  'Ember',
  'Fable',
  'Grand',
  'Hazel',
  'Ivory',
  'Jade',
  'Lunar',
  'Maple',
  'Noble',
  'Ocean',
  'Plain',
  'Quiet',
  'Rustic',
  'Sandy',
  'Slate',
  'Sunny',
  'Tidal',
  'Urban',
  'Velvet',
  'Wild',
  'Woven',
  'Zesty',
]
const NOUNS = [
  'Atlas',
  'Basket',
  'Blanket',
  'Bottle',
  'Candle',
  'Chair',
  'Clock',
  'Cushion',
  'Desk',
  'Drone',
  'Fan',
  'Frame',
  'Grinder',
  'Helmet',
  'Journal',
  'Kettle',
  'Lamp',
  'Lantern',
  'Mug',
  'Planter',
  'Puzzle',
  'Racket',
  'Speaker',
  'Teapot',
  'Towel',
  'Vase',
  'Wallet',
  'Whisk',
  'Yarn',
  'Yoyo',
]

/** mulberry32: small, fast, deterministic across engines. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The seeded catalogue: `PRODUCT_COUNT` records, ids 1…PRODUCT_COUNT. Same output every call. */
export function createProducts(): Product[] {
  const next = rng(SEED)
  const out: Product[] = []
  for (let id = 1; id <= PRODUCT_COUNT; id++) {
    const adjective = ADJECTIVES[Math.floor(next() * ADJECTIVES.length)] as string
    const noun = NOUNS[Math.floor(next() * NOUNS.length)] as string
    out.push({
      id,
      name: `${adjective} ${noun} ${id}`,
      category: CATEGORIES[Math.floor(next() * CATEGORIES.length)] as Category,
      priceCents: 199 + Math.floor(next() * 49_800),
      stock: Math.floor(next() * 501),
      rating: Math.round(10 + next() * 40) / 10,
    })
  }
  return out
}

// ─── List view: filter, sort, paginate, aggregate ───────────────────────────

export type SortKey = 'name' | 'price-asc' | 'price-desc' | 'stock'

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'price-asc', label: 'Price, low to high' },
  { value: 'price-desc', label: 'Price, high to low' },
  { value: 'stock', label: 'Stock, most first' },
]

export interface Filters {
  /** Free text, matched case-insensitively against the name. */
  query: string
  /** '' means every category. */
  category: Category | ''
  sort: SortKey
}

export const DEFAULT_FILTERS: Filters = { query: '', category: '', sort: 'name' }

export function matches(p: Product, query: string, category: Category | ''): boolean {
  if (category !== '' && p.category !== category) return false
  if (query === '') return true
  return p.name.toLowerCase().includes(query.toLowerCase())
}

function byName(a: Product, b: Product): number {
  if (a.name < b.name) return -1
  if (a.name > b.name) return 1
  return a.id - b.id
}

export function compareProducts(sort: SortKey): (a: Product, b: Product) => number {
  switch (sort) {
    case 'price-asc':
      return (a, b) => a.priceCents - b.priceCents || a.id - b.id
    case 'price-desc':
      return (a, b) => b.priceCents - a.priceCents || a.id - b.id
    case 'stock':
      return (a, b) => b.stock - a.stock || a.id - b.id
    default:
      return byName
  }
}

/** Filter then sort. Returns a new array; never mutates `all`. */
export function selectProducts(all: readonly Product[], f: Filters): Product[] {
  const q = f.query.trim()
  const out: Product[] = []
  for (const p of all) if (matches(p, q, f.category)) out.push(p)
  return out.sort(compareProducts(f.sort))
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

/** The rows of a 1-based page. */
export function pageSlice<T>(list: readonly T[], page: number): T[] {
  const start = (page - 1) * PAGE_SIZE
  return list.slice(start, start + PAGE_SIZE)
}

export interface Summary {
  count: number
  stock: number
  avgPriceCents: number
}

export function summarize(list: readonly Product[]): Summary {
  let stock = 0
  let price = 0
  for (const p of list) {
    stock += p.stock
    price += p.priceCents
  }
  return {
    count: list.length,
    stock,
    avgPriceCents: list.length === 0 ? 0 : Math.round(price / list.length),
  }
}

// ─── Every user-visible string ──────────────────────────────────────────────

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
export function formatStock(stock: number): string {
  return String(stock)
}
export function formatRating(rating: number): string {
  return `${rating.toFixed(1)} / 5`
}
export function countLabel(n: number): string {
  return n === 1 ? '1 product' : `${n} products`
}
export function summaryLabel(s: Summary): string {
  return `${s.stock} in stock · average ${formatPrice(s.avgPriceCents)}`
}
export function pageLabel(page: number, pages: number): string {
  return `Page ${page} of ${pages}`
}
export function favouritesLabel(n: number): string {
  return `Favourites: ${n}`
}
/** The text of a row's favourite toggle. */
export function favIcon(on: boolean): string {
  return on ? '★' : '☆'
}
/** The text of the detail view's favourite toggle. */
export function favButtonLabel(on: boolean): string {
  return on ? '★ Favourite' : '☆ Add to favourites'
}

// ─── Detail view ────────────────────────────────────────────────────────────

/** Parses a route param. Anything but a positive integer is "no such product". */
export function parseId(raw: string | undefined): number | null {
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return null
  return Number(raw)
}

export function findProduct(all: readonly Product[], id: number | null): Product | undefined {
  if (id === null) return undefined
  // Ids are dense from 1 for the seeded records; added records are appended.
  const guess = all[id - 1]
  if (guess && guess.id === id) return guess
  return all.find((p) => p.id === id)
}

// ─── New-product form ───────────────────────────────────────────────────────

export interface Draft {
  name: string
  category: string
  price: string
  stock: string
}

export type DraftField = keyof Draft
export type DraftErrors = Partial<Record<DraftField, string>>

export const EMPTY_DRAFT: Draft = { name: '', category: '', price: '', stock: '' }

export const ERRORS = {
  name: 'Name must be 3-60 characters',
  category: 'Choose a category',
  price: 'Price must be a positive amount with at most 2 decimals',
  stock: 'Stock must be a whole number from 0 to 100000',
} as const

export function validateDraft(d: Draft): DraftErrors {
  const errors: DraftErrors = {}
  const name = d.name.trim()
  if (name.length < 3 || name.length > 60) errors.name = ERRORS.name
  if (!(CATEGORIES as readonly string[]).includes(d.category)) errors.category = ERRORS.category
  if (!/^\d+(\.\d{1,2})?$/.test(d.price.trim()) || Number(d.price) <= 0) errors.price = ERRORS.price
  if (!/^\d+$/.test(d.stock.trim()) || Number(d.stock) > 100_000) errors.stock = ERRORS.stock
  return errors
}

export function hasErrors(e: DraftErrors): boolean {
  return (
    e.name !== undefined ||
    e.category !== undefined ||
    e.price !== undefined ||
    e.stock !== undefined
  )
}

export function nextProductId(all: readonly Product[]): number {
  let max = 0
  for (const p of all) if (p.id > max) max = p.id
  return max + 1
}

/** A valid draft as a record. Call only when `validateDraft(d)` is empty. */
export function draftToProduct(d: Draft, id: number): Product {
  return {
    id,
    name: d.name.trim(),
    category: d.category as Category,
    priceCents: Math.round(Number(d.price) * 100),
    stock: Number(d.stock),
    rating: 0,
  }
}
