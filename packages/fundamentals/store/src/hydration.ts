// ─── SSR store hydration ─────────────────────────────────────────────────────
//
// Mirrors the proven loader-data / TanStack-Query `dehydrate → inline-script →
// hydrate` handshake, but for `@pyreon/store`. The server snapshots each
// per-request store's state after render (`dehydrateStores`), the framework
// serializes it into the HTML, and the client seeds the stores back before
// they're read (`hydrateStores`).
//
// This is what makes CROSS-ISLAND SHARED STATE production-complete: two islands
// that both `import { cart } from '~/stores/cart'` already share one store
// instance on the client (the registry is a module singleton), so a signal
// write in one is seen by the other — with zero prop-drilling. The only missing
// piece was hydrating that shared store ONCE with the server's initial state
// instead of per-island. These two helpers + the framework's script injection
// close it.
//
// Stores created LAZILY (an island whose store isn't touched until it hydrates)
// seed on first creation via `consumeHydration`, called from `defineSetupStore`
// right after the store is registered. Each store seeds from server state
// exactly once (boot-time one-shot); a later `resetStore` + re-create starts
// from the store's own `setup()` initial values, not stale boot state.

import { getRegistry } from './registry'

// Minimal structural type — avoids a circular import of `StoreApi` from
// `./index` (index imports this module). The registry only ever holds objects
// with these two members for the hydration path.
interface HydratableStore {
  readonly state: Record<string, unknown>
  patch(partialState: Record<string, unknown>): void
}

// Server snapshot stashed for stores that don't exist yet on the client.
// `null` (the default) means "no hydration in flight" — the `consumeHydration`
// hot-path check below is then a single null compare, so the store-create path
// pays ~nothing when SSR hydration isn't used.
let _hydrationData: Record<string, Record<string, unknown>> | null = null

/**
 * Snapshot every active store's state into a plain, JSON-serializable object
 * keyed by store id — call on the SERVER after `renderToString` completes (the
 * per-request registry is still populated). Only signal-backed `state` is
 * captured; actions and computeds are excluded (they're not in `.state`).
 *
 * @param filter optional `(id) => boolean` to scope which stores are dehydrated
 *   — exclude server-only / sensitive stores from the client payload, e.g.
 *   `dehydrateStores(id => !id.startsWith('server:'))`.
 *
 * @remarks Values must be JSON-serializable (the framework `JSON.stringify`s
 *   the result into the page). Non-JSON types (Date/Map/Set) should be stored
 *   as plain values or revived on read.
 *
 * @example
 * // server, after render:
 * const stores = dehydrateStores()
 * html = html.replace('</head>',
 *   `<script>window.__PYREON_STORE_STATE__=${JSON.stringify(stores)}</script></head>`)
 */
export function dehydrateStores(
  filter?: (id: string) => boolean,
): Record<string, Record<string, unknown>> {
  const registry = getRegistry()
  const out: Record<string, Record<string, unknown>> = {}
  for (const [id, api] of registry) {
    if (filter && !filter(id)) continue
    // `.state` already returns a fresh snapshot object of the signal values.
    out[id] = (api as HydratableStore).state
  }
  return out
}

/**
 * Seed stores from a server snapshot — call on the CLIENT once at boot, BEFORE
 * the app mounts, so components/islands read the hydrated values immediately
 * (no flash of default state). Stores that already exist are patched in place;
 * stores not yet created are seeded on their first use.
 *
 * @example
 * // client entry, before mount:
 * hydrateStores(window.__PYREON_STORE_STATE__ ?? {})
 */
export function hydrateStores(data: Record<string, Record<string, unknown>>): void {
  if (data === null || typeof data !== 'object') return
  // Merge into any existing stash so repeated calls are idempotent.
  _hydrationData = _hydrationData ? { ..._hydrationData, ...data } : { ...data }

  // Seed any already-created stores NOW, and drop them from the stash so a
  // later resetStore + re-create doesn't re-hydrate stale boot state.
  const registry = getRegistry()
  for (const id in data) {
    const existing = registry.get(id) as HydratableStore | undefined
    if (existing) {
      existing.patch(data[id] as Record<string, unknown>)
      delete _hydrationData[id]
    }
  }
}

/**
 * @internal — called by `defineSetupStore` immediately after a store is
 * registered. Seeds the freshly-created store from stashed server state
 * (one-shot per id). A single null check when no hydration is in flight.
 */
export function consumeHydration(id: string, api: HydratableStore): void {
  if (_hydrationData === null) return
  const seed = _hydrationData[id]
  if (seed === undefined) return
  api.patch(seed)
  // One-shot: a re-created store seeds from its own setup(), not stale state.
  delete _hydrationData[id]
}

/** @internal test-only — clear the hydration stash for cross-test isolation. */
export function __clearStoreHydrationForTesting(): void {
  _hydrationData = null
}
