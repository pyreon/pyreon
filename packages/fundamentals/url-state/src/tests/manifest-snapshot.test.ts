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

      Reactive URL search-param state for Pyreon. Each search parameter is a signal synced with the browser URL. Supports single-param mode (\`useUrlState("page", 1)\`) and schema mode (\`useUrlState({ page: 1, sort: "name" })\`). Auto-coerces types (numbers, booleans, arrays), uses \`replaceState\` to avoid history spam, supports configurable debounce for high-frequency updates, and is SSR-safe (signals initialize to the default value on the server — it does NOT read the request URL; reads \`window.location\` on the client).

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
      // No typeof window checks needed in your components
      \`\`\`

      > **Note**: Type coercion is based on the default value: \`useUrlState("page", 1)\` coerces \`?page=2\` to number \`2\`. \`useUrlState("page", "1")\` keeps it as string \`"1"\`. Always provide the right type as default.
      >
      > **History**: Uses \`replaceState\` by default — no history entries per update. This prevents the back button from stepping through every intermediate value during typing.
      >
      > **SSR**: SSR-safe out of the box. On the SERVER it does NOT read the request URL — every signal initializes to its default value (no popstate listener, no history calls). On the CLIENT it reads from \`window.location.search\`. No environment checks needed in component code. If a param must be present in the server-rendered HTML (e.g. SEO of a filtered list), seed the render from your route/loader layer instead.
      >
      > **Debounce**: For high-frequency updates (search inputs, sliders), pass \`{ debounce: 300 }\` to coalesce URL writes. Without debounce, every keystroke triggers a replaceState call. The signal itself updates synchronously — only the URL write is delayed.
      >
      > **Cross-hook sync**: Two \`useUrlState("page", 1)\` calls in different components are independent signals bound to the same param — and they stay in sync. When one writes, the other re-reads the URL and updates (firing its \`onChange\`). No store lifting required.
      >
      > **Batch**: Wrap several \`.set()\` calls in \`batchUrlUpdates(() => { … })\` to collapse a multi-param update into ONE history entry — critical with \`replace: false\`, where N un-batched writes would push N back-stack entries. Signal values update synchronously inside the batch; debounce is bypassed.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(3)
  })
})
