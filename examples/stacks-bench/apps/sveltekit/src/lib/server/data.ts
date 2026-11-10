/**
 * The in-process "database" every arm of the stacks benchmark uses.
 *
 * This file is copied VERBATIM into each arm (`bun setup.ts` copies it and the
 * harness refuses to measure an arm whose copy differs), so every stack does the
 * same data work per request: one `await` on a resolved promise (standing in
 * for a database round trip) and the same 100 seeded rows.
 *
 * Framework-agnostic on purpose: no imports, plain TypeScript.
 *
 * The rows live on `globalThis`, not in a module-level `let`, because some
 * bundlers emit one module instance per server chunk (a page and its form
 * action can land in different chunks). A real database is one store per
 * process; so is this.
 */

export interface ItemSummary {
  id: number
  name: string
  /** Price in cents. */
  price: number
}

export interface Item extends ItemSummary {
  description: string
}

const ADJECTIVES = [
  'Amber',
  'Brisk',
  'Cobalt',
  'Dusky',
  'Ember',
  'Frosted',
  'Gilded',
  'Hollow',
  'Ivory',
  'Jade',
  'Keen',
  'Lunar',
  'Misty',
  'Noble',
  'Opal',
  'Pale',
]
const NOUNS = [
  'Falcon',
  'Harbor',
  'Lantern',
  'Meadow',
  'Orchard',
  'Pebble',
  'Quarry',
  'Ridge',
  'Sparrow',
  'Thistle',
  'Upland',
  'Valley',
  'Willow',
  'Yarrow',
  'Zephyr',
  'Cedar',
]

/** mulberry32 — deterministic per seed. */
function rng(s0: number): () => number {
  let a = s0 >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedRows(): Item[] {
  const r = rng(20261110)
  const out: Item[] = []
  for (let id = 1; id <= 100; id++) {
    const adj = ADJECTIVES[Math.floor(r() * ADJECTIVES.length)] as string
    const noun = NOUNS[Math.floor(r() * NOUNS.length)] as string
    out.push({
      id,
      name: `Item ${id}: ${adj} ${noun}`,
      price: 100 + Math.floor(r() * 99_900),
      description: `The ${adj.toLowerCase()} ${noun.toLowerCase()} is item number ${id} in the seeded catalogue.`,
    })
  }
  return out
}

interface Store {
  items: Item[]
}
const STORE_KEY = '__stacksBenchStore'
function store(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>
  let s = g[STORE_KEY]
  if (!s) {
    s = { items: seedRows() }
    g[STORE_KEY] = s
  }
  return s
}

/** Stand-in for a database round trip: one await on an already-resolved promise. */
function db(): Promise<void> {
  return Promise.resolve()
}

/** The `/items` loader's query: every row, summary columns only. */
export async function listItems(): Promise<ItemSummary[]> {
  await db()
  return store().items.map(({ id, name, price }) => ({ id, name, price }))
}

/** The `/items/:id` loader's query. `undefined` → the route answers 404. */
export async function getItem(id: number): Promise<Item | undefined> {
  await db()
  return store().items.find((i) => i.id === id)
}

export type NameCheck = { ok: true; name: string } | { ok: false; error: string }

/** The form's one validated field: a trimmed name of 3–60 characters. */
export function validateName(raw: unknown): NameCheck {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name.length < 3 || name.length > 60) {
    return { ok: false, error: 'Name must be 3-60 characters' }
  }
  return { ok: true, name }
}

/** The form action's write. Returns the new row (the arm redirects to it). */
export async function addItem(name: string): Promise<Item> {
  await db()
  const s = store()
  const id = s.items.length + 1
  const item: Item = { id, name, price: 999, description: `Added through the form: ${name}.` }
  s.items.push(item)
  return item
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
