import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — url-state snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/url-state — URL-synced state — useUrlState(key, default) or schema mode, auto type coercion, SSR-safe. Type coercion is based on the default value: \`useUrlState("page", 1)\` coerces \`?page=2\` to number \`2\`. \`useUrlState("page", "1")\` keeps it as string \`"1"\`. Always provide the right type as default."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/url-state — URL State

      Reactive URL search-param state for Pyreon. Each search parameter is a signal synced with the browser URL. Supports single-param mode (\`useUrlState("page", 1)\`) and schema mode (\`useUrlState({ page: 1, sort: "name" })\`). Auto-coerces types (numbers, booleans, arrays), uses \`replaceState\` to avoid history spam, supports configurable debounce for high-frequency updates, and is SSR-safe (reads from request URL on server).

      \`\`\`typescript
      import { useUrlState, setUrlRouter } from '@pyreon/url-state'
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
      // No typeof window checks needed in your components
      \`\`\`

      > **Note**: Type coercion is based on the default value: \`useUrlState("page", 1)\` coerces \`?page=2\` to number \`2\`. \`useUrlState("page", "1")\` keeps it as string \`"1"\`. Always provide the right type as default.
      >
      > **History**: Uses \`replaceState\` by default — no history entries per update. This prevents the back button from stepping through every intermediate value during typing.
      >
      > **SSR**: SSR-safe out of the box. On the server, reads from the request URL. On the client, reads from \`window.location.search\`. No environment checks needed in component code.
      >
      > **Debounce**: For high-frequency updates (search inputs, sliders), pass \`{ debounceMs: 300 }\` to batch URL updates. Without debounce, every keystroke triggers a replaceState call.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(2)
  })
})
