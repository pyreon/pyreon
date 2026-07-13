import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — storage snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/storage — Reactive client-side storage — localStorage, sessionStorage, cookies, IndexedDB. Browser-backed hooks (\`useStorage\`, \`useSessionStorage\`, \`useIndexedDB\`) return the default value on the server. \`useCookie\` is SSR-readable via \`setCookieSource()\` which reads from the request headers."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/storage — Reactive Storage

      Signal-backed persistence for Pyreon. Every stored value is a reactive signal that persists writes automatically to the underlying storage backend. \`useStorage\` (localStorage, cross-tab synced), \`useSessionStorage\`, \`useCookie\` (SSR-readable, configurable expiry), \`useIndexedDB\` (large data, debounced writes), and \`useMemoryStorage\` (ephemeral, SSR-safe). All hooks return \`StorageSignal<T>\` which extends \`Signal<T>\` with \`.remove()\`. \`createStorage(backend)\` enables custom backends (encrypted, remote, etc.). SSR-safe — browser-API hooks return the default value on the server.

      \`\`\`typescript
      import { useStorage, useSessionStorage, useCookie, useIndexedDB, useMemoryStorage, createStorage } from '@pyreon/storage'

      // localStorage — persistent, cross-tab synced via storage events:
      const theme = useStorage('theme', 'light')
      theme()            // 'light' — reactive signal read
      theme.set('dark')  // updates signal + writes to localStorage
      theme.remove()     // removes from storage, resets to default

      // sessionStorage — per-tab, cleared on tab close:
      const filter = useSessionStorage('filter', { query: '', page: 1 })
      filter.set({ query: 'search', page: 2 })

      // Cookie — SSR-readable, configurable expiry:
      const locale = useCookie('locale', 'en', {
        maxAge: 365 * 86400,  // 1 year
        path: '/',
        sameSite: 'lax',
      })

      // IndexedDB — large data, debounced writes:
      const draft = useIndexedDB('article-draft', {
        title: '',
        body: '',
        tags: [] as string[],
      })

      // Memory storage — ephemeral, SSR-safe fallback:
      const temp = useMemoryStorage('temp-data', { count: 0 })

      // Custom backend — encrypted, remote, etc.:
      const encryptedBackend = {
        get: (key: string) => decrypt(localStorage.getItem(key)),
        set: (key: string, value: string) => localStorage.setItem(key, encrypt(value)),
        remove: (key: string) => localStorage.removeItem(key),
      }
      const useEncrypted = createStorage(encryptedBackend)
      const secret = useEncrypted('api-key', '')
      \`\`\`

      > **SSR safety**: Browser-backed hooks (\`useStorage\`, \`useSessionStorage\`, \`useIndexedDB\`) return the default value on the server. \`useCookie\` is SSR-readable via \`setCookieSource()\` which reads from the request headers.
      >
      > **Cross-tab sync**: Only \`useStorage\` (localStorage) syncs across tabs via \`storage\` events. \`useSessionStorage\` is per-tab. Cookies and IndexedDB have no built-in cross-tab notification.
      >
      > **IndexedDB async init**: The IndexedDB hook initializes synchronously with the default value, then hydrates asynchronously. Components reading the value in their first render see the default — the value updates reactively once the IDB read completes. Init/read/write failures are routed to \`onError\`.
      >
      > **Versioned migration**: Set \`version\` to store values inside a small JSON envelope carrying the schema version; a later load with a HIGHER \`version\` runs \`migrate(oldValue, fromVersion)\` to transform the old shape. A legacy value written before versioning (no envelope) is treated as version \`0\`. Migration is applied on read AND on cross-tab sync (the entry's options travel with it), so a tab holding the old shape upgrades when a newer tab writes.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    // 7 entries: useStorage, useCookie, useSessionStorage, useMemoryStorage,
    // useIndexedDB, setCookieSource, createStorage
    expect(Object.keys(record).length).toBe(7)
    expect(record['storage/useStorage']!.notes).toContain('localStorage')
    expect(record['storage/useStorage']!.mistakes?.split('\n').length).toBe(5)
  })
})
