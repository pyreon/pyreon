import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/url-state',
  title: 'URL State',
  tagline:
    'URL-synced state — useUrlState(key, default) or schema mode, auto type coercion, SSR-safe',
  description:
    'Reactive URL search-param state for Pyreon. Each search parameter is a signal synced with the browser URL. Supports single-param mode (`useUrlState("page", 1)`) and schema mode (`useUrlState({ page: 1, sort: "name" })`). Auto-coerces types (numbers, booleans, arrays), uses `replaceState` to avoid history spam, supports configurable debounce for high-frequency updates, and is SSR-safe (reads from request URL on server).',
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
const search = useUrlState('q', '', { debounceMs: 300 })
// typing "hello" fires one URL update after 300ms pause, not 5

// Router integration — uses router.replace() when available
import { useRouter } from '@pyreon/router'
const router = useRouter()
setUrlRouter(router)  // now useUrlState uses router.replace() internally

// SSR-safe — reads from request URL on server, window.location on client
// No typeof window checks needed in your components`,
  features: [
    'useUrlState(key, default) — single-param signal synced to URL',
    'useUrlState(schema) — multi-param schema mode',
    'Auto type coercion for numbers, booleans, arrays',
    'replaceState by default (no history spam)',
    'Configurable debounce for high-frequency updates',
    'SSR-safe — reads request URL on server',
    'setUrlRouter() for @pyreon/router integration',
  ],
  api: [
    {
      name: 'useUrlState',
      kind: 'hook',
      signature:
        '<T>(key: string, defaultValue: T, options?: UrlStateOptions) => UrlStateSignal<T>',
      summary:
        'Create a reactive signal synced to a URL search parameter. Type is inferred from the default value — numbers, booleans, strings, and arrays are auto-coerced. Uses `replaceState` by default (no history entries). Returns a `UrlStateSignal<T>` with `.set()`, `.reset()`, and `.remove()`. Schema mode overload: `useUrlState({ page: 1, sort: "name" })` creates multiple synced signals from a single call. SSR-safe — reads from the request URL on server.',
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
        'Using pushState behavior (adds history entries per keystroke) — useUrlState defaults to replaceState; if you pass `{ replaceState: false }` on a high-frequency input, the browser back button breaks',
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
  ],
  gotchas: [
    'Type coercion is based on the default value: `useUrlState("page", 1)` coerces `?page=2` to number `2`. `useUrlState("page", "1")` keeps it as string `"1"`. Always provide the right type as default.',
    {
      label: 'History',
      note: 'Uses `replaceState` by default — no history entries per update. This prevents the back button from stepping through every intermediate value during typing.',
    },
    {
      label: 'SSR',
      note: 'SSR-safe out of the box. On the server, reads from the request URL. On the client, reads from `window.location.search`. No environment checks needed in component code.',
    },
    {
      label: 'Debounce',
      note: 'For high-frequency updates (search inputs, sliders), pass `{ debounceMs: 300 }` to batch URL updates. Without debounce, every keystroke triggers a replaceState call.',
    },
  ],
})
