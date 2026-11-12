import { island } from '@pyreon/zero'

/**
 * The docs' islands. A docs page is static HTML like every marketing page
 * (`site/render-mode.ts`): the reading shell, the Markdown and the selling
 * slots render on the server only, and these are the parts that run in the
 * browser. Each is small, takes JSON props, and hydrates when it is needed:
 *
 *   - search: at idle, because ⌘K / Ctrl+K / "/" must work before any click.
 *   - the drawer, page actions, "helpful?", demo tabs: on first interaction
 *     (the click that woke them is replayed).
 *   - code copy, code-group tabs, heading anchors, the TOCs' scroll-spy and
 *     the sidebar's scroll position: one island per page at idle, working
 *     over the static markup (one delegated listener, no per-block
 *     hydration, no props).
 *
 * Declarations stay literal `island(() => import(…), {…})` calls so
 * `@pyreon/vite-plugin` puts them in the islands registry.
 */

/** The sidebar's search box: owns the shortcut and the search dialog. */
export const DocsSearchIsland = island(() => import('./search-box'), { name: 'DocsSearch', hydrate: 'idle' })

/** "Browse docs" and the drawer below 960px. */
export const DocsDrawerIsland = island(() => import('./drawer'), { name: 'DocsDrawer', hydrate: 'interaction' })

/** Edit this page · Copy as Markdown · Ask your AI. */
export const DocsActionsIsland = island(() => import('./actions'), { name: 'DocsActions', hydrate: 'interaction' })

/** "Was this page helpful?" */
export const DocsHelpfulIsland = island(() => import('./helpful'), { name: 'DocsHelpful', hydrate: 'interaction' })

/** Code copy, code-group tabs, heading anchors, TOC scroll-spy, the sidebar's scroll position. Renders nothing. */
export const DocsEnhanceIsland = island(() => import('./enhance'), { name: 'DocsEnhance', hydrate: 'idle' })

/** Preview / Code tabs of a product's live demo (the demo itself is its own island). */
export const DemoTabsIsland = island(() => import('./sell/DemoTabs'), { name: 'DocsDemoTabs', hydrate: 'interaction' })

/** `<Example file="./examples/…" />`: a live example. Hydrates at idle; `<Example>` itself loads the example file when it nears the viewport (400px ahead). */
export const ExampleIsland = island(() => import('./example'), { name: 'DocsExample', hydrate: 'idle' })

/** `<Playground code="…" />`: an editable snippet running in a sandboxed iframe. */
export const PlaygroundIsland = island(() => import('./playground'), { name: 'DocsPlayground', hydrate: 'visible' })
