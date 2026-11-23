---
title: "Offline and installable apps"
summary: "What works offline per render mode, the install prompt, the update banner, a persisted query cache, queued writes, and what is deliberately not provided."
seeAlso: [data-fetching, ssr-safe-hooks]
---

## The pattern

Three independent layers, each opt-in:

1. **The app shell loads offline**: `zero({ pwa })` generates a service worker.
2. **Reads survive a reload offline**: persist the `@pyreon/query` cache.
3. **Writes made offline are sent later**: TanStack pauses mutations while offline; persist them and register their function by key.

None of it runs in `vite dev`. Test it with `vite build && vite preview`.

## What works offline, per render mode

| Mode | A page visited before | A prerendered page never visited | A route never prerendered |
| --- | --- | --- | --- |
| `ssg` | yes (last public copy) | yes (precached) | the browser's offline error, or the app shell with `pwa.offlineFallback: '/'` |
| `spa` | yes | n/a | yes: the precached app shell answers every navigation |
| `ssr` / `isr` | only if served `Cache-Control: public` | n/a (HTML is per request) | the browser's offline error |

Hashed assets (`/assets/*`) are precached in every mode. Navigations are network-first, so online users always get fresh HTML. Responses are replayed offline only when they say `Cache-Control: public` with no `private`/`no-store`/`no-cache` and no user-dependent `Vary`, so a signed-in page is never shown to the next visitor.

With `offlineFallback`, the shell HTML is a prerendered page, but the client router renders the route that matches the address bar. A route that needs server data renders its loading or error state offline, so keep fallback routes self-contained.

## Installable app checklist

```ts
// vite.config.ts
zero({
  mode: 'ssg',
  pwa: {
    manifest: {
      name: 'My App',
      short_name: 'App',
      theme_color: '#0b1020',
      background_color: '#ffffff',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
  },
})
```

```ts
// src/entry-client.ts
import { routes } from 'virtual:zero/routes'
import { registerServiceWorker, startClient } from '@pyreon/zero/client'

void registerServiceWorker()
startClient({ routes })
```

- HTTPS in production (`localhost` counts as secure for testing).
- A 192px and a 512px icon, plus a `maskable` one so Android does not letterbox it.
- `start_url` and `scope` default to the app `base`; `display` defaults to `standalone`.
- **iOS ignores the manifest icons.** Use `faviconPlugin` (it emits `apple-touch-icon`) or add `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`. Add `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="apple-mobile-web-app-status-bar-style" content="default">` in your `index.html` for a full-screen launch. iOS Safari never fires `beforeinstallprompt`: show "Share, then Add to Home Screen".

## Install button

```tsx
import { useInstallPrompt } from '@pyreon/zero/client'

function InstallButton() {
  const install = useInstallPrompt()
  return (
    <Show when={() => install.canInstall() && !install.isInstalled()}>
      <button onClick={() => install.prompt()}>Install app</button>
    </Show>
  )
}
```

Call `useInstallPrompt()` in the root layout: the browser fires `beforeinstallprompt` once per page load, and an event fired while no caller is mounted is missed. `prompt()` resolves `'accepted' | 'dismissed' | 'unavailable'`. Only Chromium browsers offer the prompt.

## Update banner

```tsx
import { useServiceWorkerUpdate } from '@pyreon/zero/client'

function UpdateBanner() {
  const update = useServiceWorkerUpdate()
  return (
    <Show when={() => update.updateReady()}>
      <button onClick={() => update.apply()}>New version available. Reload</button>
    </Show>
  )
}
```

A new worker waits by default, so a running page never has its asset set swapped underneath it. `apply()` activates it and reloads **this tab**; other open tabs keep the old page until they reload. The worker deletes the previous version's precache on activation, so an old tab that lazy-loads a chunk it never fetched needs that chunk on your server. `pwa.skipWaiting: true` activates immediately, with the same caveat for running tabs. The browser checks for a new `sw.js` on every navigation inside the scope (registration uses `updateViaCache: 'none'`); `registration.update()` forces a check for a long-lived tab.

## Offline indicator

```tsx
import { useOnline } from '@pyreon/hooks'

function OfflineBanner() {
  const online = useOnline()
  return (
    <Show when={() => !online()}>
      <p>You are offline. Changes are saved and sent later.</p>
    </Show>
  )
}
```

`navigator.onLine` is a hint, not proof: `true` only means a network interface is up. A captive portal, a dead backend or a firewall still reads as online. Nothing in Pyreon combines it with a reachability probe; if you need one, `fetch` a tiny `HEAD` endpoint with a timeout and treat failure as offline.

## Persist the query cache (offline reads)

```tsx
import { QueryClient } from '@pyreon/query'
import { createSyncStoragePersister, PersistQueryClientProvider } from '@pyreon/query/persist'

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, gcTime: 24 * 3_600_000 } } })
const persister = createSyncStoragePersister({ storage: localStorage })

export function Root() {
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: 24 * 3_600_000 }}>
      <App />
    </PersistQueryClientProvider>
  )
}
```

After a reload with no network, `useQuery` shows the restored data and its fetch stays paused (`fetchStatus: 'paused'`); it refetches when the connection returns. `gcTime` must be at least `maxAge`, or restored entries are collected early. `localStorage` is synchronous, about 5 MB per origin and throws when full; for larger caches use `createAsyncStoragePersister` over an async, IndexedDB-backed storage. Do not persist private data on a shared device without a `buster` or a cleared cache on sign-out (`persister.removeClient()`).

## Queued writes (offline mutations)

A mutation made offline pauses instead of failing. To make it survive a reload, give it a `mutationKey` and register its function at **module load** (functions cannot be serialised):

```ts
client.setMutationDefaults(['add-item'], {
  mutationFn: (name: string) => fetch('/api/items', { method: 'POST', body: JSON.stringify({ name }) }),
  onSuccess: () => client.invalidateQueries({ queryKey: ['items'] }),
})

const add = useMutation({ mutationKey: ['add-item'] }) // note: an options object, not a function
add.mutate('milk')
```

`<PersistQueryClientProvider>` persists a paused mutation (as TanStack does) and, while its request is in flight, a mutation whose `mutationKey` has a function registered with `setMutationDefaults` (as above), until it settles. It resumes them when restoration settles, including on a page that loads online (when no offline-to-online event will ever fire). A mutation marked `meta: { persist: false }`, or whose variables do not survive JSON, is never persisted. The full rule is on the [query page](/docs/query).

What is promised, and what is not:

- Paused mutations are STARTED in creation order when the connection returns, but run concurrently. Give related mutations the same `scope: { id: 'items' }` to run them one after another.
- Delivery is at-least-once. A tab that closes mid-request keeps the mutation persisted, so the next page sends it again, even if the server had already received it. Make the endpoint idempotent: send a client-generated id in the variables and ignore repeats.
- Two open tabs never both send one mutation: a tab takes over another tab's mutation only after that tab has closed (Web Locks). Without Web Locks, an in-flight mutation is not persisted at all. A page holds no Web Lock unless it owns a pending mutation, so it stays eligible for the back/forward cache.
- A reload aborts an in-flight request; the mutation stays stored and the reloaded page sends it.
- Mark a mutation `meta: { persist: false }` when its variables are secrets (a sign-in), so they are never written to `localStorage`, not even while it is paused offline.
- A `File` or `Blob` is not persisted (it would come back as `{}`): upload it first and send its id.
- A mutation that fails (the server rejects it, or `retry` is used up) has settled and leaves storage; the error reaches `onError` and the mutation's `error` state. Use `retry` for transient failures.
- No retry queue or backoff beyond TanStack's `retry` option (`0` for mutations by default).
- No conflict handling. Two devices writing the same record is last write wins at your API. For real merge semantics use a local-first store: [`@pyreon/sync`](/docs/sync) (CRDT, `persistViaIndexedDB`) replaces this whole section instead of layering on it.
- `networkMode: 'always'` skips pausing and sends immediately (use it for requests that work without internet, such as a local API).

## Dev and preview on one origin

A worker registered by `vite preview` on `localhost:4173` does not touch `localhost:5173`, but reusing a port (or a deployed worker on a dev domain) leaves the old worker serving cached modules over HMR. Dev never registers a worker, and cannot remove one. Clear it once with `unregisterServiceWorkers()` from the dev entry, or DevTools, Application, Service Workers, Unregister:

```ts
import { unregisterServiceWorkers } from '@pyreon/zero/client'
if (import.meta.env.DEV) void unregisterServiceWorkers()
```

## Deliberately not provided

- **Background Sync and Periodic Background Sync**: Chromium-only, so the "queued writes" would behave differently per browser. The paused-mutation queue above works everywhere the page is open.
- **Push notifications** from the service worker: out of scope for `zero({ pwa })` (the native `usePush` hook is separate).
- **A runtime caching framework**: only navigations (network-first) and hashed assets (cache-first) are handled. API responses, images and fonts outside `/assets/` are left to the browser; cache API data with the persisted query cache instead.
- **A Workbox dependency**: the worker is a small generated file with no runtime imports.

## Anti-pattern

```tsx
// BROKEN — a persisted mutation has no function after a reload
const add = useMutation({ mutationFn: (name: string) => post(name) })
```

A function cannot be serialised. The paused mutation is stored with its variables and `mutationKey` only, so after a reload there is nothing to run. Use a `mutationKey` plus `client.setMutationDefaults(key, { mutationFn })` at module load.

```tsx
// ALSO BROKEN — a signed-in page replayed to the next visitor
// Cache-Control: public   on HTML that varies by cookie
```

The worker only replays navigations that say `Cache-Control: public` and do not vary by user state. Never mark per-user HTML public to make it available offline.

## Related

- Pattern: `data-fetching` — `useQuery` and `useMutation` basics
- Pattern: `ssr-safe-hooks` — why the install and update hooks are inert on the server
- Reference: `registerServiceWorker`, `useServiceWorkerUpdate`, `useInstallPrompt`, `unregisterServiceWorkers` in `@pyreon/zero`; `PersistQueryClientProvider` in `@pyreon/query/persist`
- Reference: `@pyreon/sync` for local-first data with real merge semantics
