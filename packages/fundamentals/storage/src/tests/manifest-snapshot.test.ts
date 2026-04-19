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
        getItem: (key: string) => decrypt(localStorage.getItem(key)),
        setItem: (key: string, value: string) => localStorage.setItem(key, encrypt(value)),
        removeItem: (key: string) => localStorage.removeItem(key),
      }
      const useEncrypted = createStorage(encryptedBackend)
      const secret = useEncrypted('api-key', '')
      \`\`\`

      > **SSR safety**: Browser-backed hooks (\`useStorage\`, \`useSessionStorage\`, \`useIndexedDB\`) return the default value on the server. \`useCookie\` is SSR-readable via \`setCookieSource()\` which reads from the request headers.
      >
      > **Cross-tab sync**: Only \`useStorage\` (localStorage) syncs across tabs via \`storage\` events. \`useSessionStorage\` is per-tab. Cookies and IndexedDB have no built-in cross-tab notification.
      >
      > **IndexedDB async init**: The IndexedDB hook initializes synchronously with the default value, then hydrates asynchronously. Components reading the value in their first render see the default — the value updates reactively once the IDB read completes.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(4)
    expect(record['storage/useStorage']!.notes).toContain('localStorage')
    expect(record['storage/useStorage']!.mistakes?.split('\n').length).toBe(3)
  })
})
