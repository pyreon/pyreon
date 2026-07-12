import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/url-state',
  title: 'URL State',
  tagline:
    'URL-synced state — useUrlState(key, default) or schema mode, auto type coercion, SSR-safe',
  description:
    'Reactive URL search-param state for Pyreon. Each search parameter is a signal synced with the browser URL. Supports single-param mode (`useUrlState("page", 1)`) and schema mode (`useUrlState({ page: 1, sort: "name" })`). Auto-coerces types (numbers, booleans, arrays), uses `replaceState` to avoid history spam, supports configurable debounce for high-frequency updates, and is SSR-safe (signals initialize to the default value on the server — it does NOT read the request URL; reads `window.location` on the client).',
  category: 'universal',
  longExample: `import { useUrlState, setUrlRouter } from '@pyreon/url-state'
import { signal } from '@pyreon/reactivity'

// Single parameter — type inferred from default value
const page = useUrlState('page', 1)
page()        // 1 (number, auto-coerced from ?page=1)
page.set(2)   // URL → ?page=2 via replaceState
page.reset()  // removes ?page, signal returns default (1)
page.remove() // removes ?page entirely

// Schema mode — multiple params from a single call
const filters = useUrlState({ q: '', sort: 'name', desc: false })
filters.q.set('hello')       // ?q=hello&sort=name&desc=false
filters.sort.set('date')     // ?q=hello&sort=date&desc=false
filters.desc.set(true)       // ?q=hello&sort=date&desc=true

// Array parameters with repeated keys
const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
tags.set(['typescript', 'pyreon'])  // ?tags=typescript&tags=pyreon

// Debounce for high-frequency updates (e.g. search input)
const search = useUrlState('q', '', { debounce: 300 })
// typing "hello" fires one URL update after 300ms pause, not 5

// Batch — collapse a multi-param update into ONE history entry
import { batchUrlUpdates } from '@pyreon/url-state'
batchUrlUpdates(() => {
  filters.q.set('hello')
  filters.sort.set('date')
})  // one replaceState, not two

// Cross-hook sync — two signals bound to the same key stay in sync
const a = useUrlState('page', 1)
const b = useUrlState('page', 1)
a.set(5)  // b() is now 5 too, and b's onChange fires

// Router integration — uses router.replace() when available
import { useRouter } from '@pyreon/router'
const router = useRouter()
setUrlRouter(router)  // now useUrlState uses router.replace() internally

// SSR-safe — initializes to the default on the server, reads window.location on the client
// No typeof window checks needed in your components`,
  features: [
    'useUrlState(key, default) — single-param signal synced to URL',
    'useUrlState(schema) — multi-param schema mode',
    'Auto type coercion for numbers, booleans, arrays',
    'replaceState by default (no history spam)',
    'Configurable debounce for high-frequency updates',
    'Cross-hook sync — two signals bound to the same param stay in sync',
    'batchUrlUpdates() — coalesce a multi-param update into ONE history entry',
    'clearOnDefault: false — keep a param in the URL at its default value',
    'SSR-safe — initializes to the default on the server (reads the URL on the client)',
    'setUrlRouter() for @pyreon/router integration',
  ],
  api: [
    {
      name: 'useUrlState',
      kind: 'hook',
      signature:
        '<T>(key: string, defaultValue: T, options?: UrlStateOptions) => UrlStateSignal<T>',
      summary:
        'Create a reactive signal synced to a URL search parameter. Type is inferred from the default value — numbers, booleans, strings, and arrays are auto-coerced. Uses `replaceState` by default (no history entries). Returns a `UrlStateSignal<T>` with `.set()`, `.reset()`, and `.remove()`. Schema mode overload: `useUrlState({ page: 1, sort: "name" })` creates multiple synced signals from a single call. SSR-safe — initializes to the default value on the server (does NOT read the request URL).',
      example: `// Single param:
const page = useUrlState('page', 1)
page()        // 1
page.set(2)   // URL → ?page=2

// Schema mode:
const { q, sort } = useUrlState({ q: '', sort: 'name' })
q.set('hello')  // ?q=hello&sort=name

// Array with repeated keys:
const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
tags.set(['a', 'b'])  // ?tags=a&tags=b`,
      mistakes: [
        'Using pushState behavior (adds history entries per keystroke) — useUrlState defaults to replaceState; if you pass `{ replace: false }` on a high-frequency input, the browser back button breaks',
        'Forgetting the default value — the type is inferred from it and determines the auto-coercion strategy (number default = coerce to number, boolean default = coerce to boolean)',
        'Reading useUrlState in a non-reactive scope at component setup — the signal reads the URL once; wrap in a reactive scope to track URL changes',
        'Calling setUrlRouter before the router is available — SSR renders may not have a router instance yet',
      ],
      seeAlso: ['setUrlRouter'],
    },
    {
      name: 'setUrlRouter',
      kind: 'function',
      signature: '(router: UrlRouter) => void',
      summary:
        'Configure useUrlState to use a @pyreon/router instance for URL updates instead of raw `history.replaceState`. When set, URL changes go through the router\'s navigation system, ensuring route guards, middleware, and scroll management integrate correctly.',
      example: `import { useRouter } from '@pyreon/router'
import { setUrlRouter } from '@pyreon/url-state'

const router = useRouter()
setUrlRouter(router)
// Now useUrlState uses router.replace() internally`,
      seeAlso: ['useUrlState'],
    },
    {
      name: 'batchUrlUpdates',
      kind: 'function',
      signature: '<T>(fn: () => T) => T',
      summary:
        'Collapse several `useUrlState` writes into ONE history entry. Every `.set()` / `.reset()` / `.remove()` invoked inside `fn` is coalesced into a single `history.replaceState` / `pushState` (or one `router.replace`). Signal values still update synchronously — only the URL write is deferred to the end of the batch. Signal notifications are also batched, so subscribers reading several params re-run once, and debounce is bypassed. Critical with `replace: false`: without batching, an N-param update pushes N history entries, so the back button steps through each intermediate state. If any write requested `replace: false`, the single batched write uses `pushState`; otherwise `replaceState`.',
      example: `import { useUrlState, batchUrlUpdates } from '@pyreon/url-state'

const { page, q, sort } = useUrlState({ page: 1, q: '', sort: 'name' })

// One history entry for the whole "apply filters" action:
batchUrlUpdates(() => {
  page.set(1)
  q.set('hello')
  sort.set('date')
}) // → ?q=hello&sort=date (one replaceState)`,
      seeAlso: ['useUrlState'],
    },
  ],
  gotchas: [
    'Type coercion is based on the default value: `useUrlState("page", 1)` coerces `?page=2` to number `2`. `useUrlState("page", "1")` keeps it as string `"1"`. Always provide the right type as default.',
    {
      label: 'History',
      note: 'Uses `replaceState` by default — no history entries per update. This prevents the back button from stepping through every intermediate value during typing.',
    },
    {
      label: 'SSR',
      note: 'SSR-safe out of the box. On the SERVER it does NOT read the request URL — every signal initializes to its default value (no popstate listener, no history calls). On the CLIENT it reads from `window.location.search`. No environment checks needed in component code. If a param must be present in the server-rendered HTML (e.g. SEO of a filtered list), seed the render from your route/loader layer instead.',
    },
    {
      label: 'Debounce',
      note: 'For high-frequency updates (search inputs, sliders), pass `{ debounce: 300 }` to coalesce URL writes. Without debounce, every keystroke triggers a replaceState call. The signal itself updates synchronously — only the URL write is delayed.',
    },
    {
      label: 'Cross-hook sync',
      note: 'Two `useUrlState("page", 1)` calls in different components are independent signals bound to the same param — and they stay in sync. When one writes, the other re-reads the URL and updates (firing its `onChange`). No store lifting required.',
    },
    {
      label: 'Batch',
      note: 'Wrap several `.set()` calls in `batchUrlUpdates(() => { … })` to collapse a multi-param update into ONE history entry — critical with `replace: false`, where N un-batched writes would push N back-stack entries. Signal values update synchronously inside the batch; debounce is bypassed.',
    },
  ],
})
