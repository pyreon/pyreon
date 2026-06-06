// ─── @pyreon/zero-content main entry ──────────────────────────────────────
//
// Client-safe exports only. The Vite plugin lives at
// `@pyreon/zero-content/plugin` (Node-only — pulls in remark/unified/etc).

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/zero-content
// instances in the same heap. Diagnostic; not load-bearing.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

// ─── Config helpers ────────────────────────────────────────────────────────

export {
  defineConfig,
  defineCollection,
  defineComponents,
  mergeComponents,
} from './config'

// ─── Route helpers — content-collection-shaped routes ─────────────────────
//
// `defineContentRoute('docs')` collapses the docs-zero Suspense
// boilerplate into one call. See `route-helpers.tsx` for the full
// rationale (PR-A audit H1).
export { defineContentRoute } from './route-helpers'
export type { DefineContentRouteOptions } from './route-helpers'

// ─── Built-in components ───────────────────────────────────────────────────
//
// Auto-available in every `.md` file — referenced by name without an
// import. Emitted by the matching remark plugins (callout, codegroup,
// shiki). Re-exported here so consumers can also use them directly in
// `.tsx` (e.g. for a custom layout that wraps content with a Callout).

export { Callout } from './components/Callout'
export type { CalloutProps, CalloutType } from './components/Callout'
export { CodeGroup } from './components/CodeGroup'
export type { CodeGroupProps } from './components/CodeGroup'
export { CodeBlock } from './components/CodeBlock'
export type { CodeBlockProps } from './components/CodeBlock'
export { Sidebar, groupEntries } from './components/Sidebar'
export type { SidebarEntry, SidebarProps } from './components/Sidebar'
export { Toc, filterHeadings } from './components/Toc'
export type { TocProps } from './components/Toc'

// ─── Search ────────────────────────────────────────────────────────────────

export {
  _resetSearchForTesting,
  loadSearchIndex,
  Search,
  useSearch,
} from './search/search-runtime'
export type {
  SearchCatalog,
  SearchProps,
  UseSearchOptions,
  UseSearchResult,
} from './search/search-runtime'

// ─── Runtime queries (getCollection / getEntry / getEntries) ──────────────
//
// Read from the plugin-emitted `virtual:zero-content/collections`
// module — the virtual module imports `_setRegistry` from here at app
// boot.

export {
  _getRegistry,
  _listCollections,
  _resetRegistryForTesting,
  _setRegistry,
  getCollection,
  getEntries,
  getEntry,
} from './runtime'
export type { CollectionRegistry, CollectionRuntime } from './runtime'

// ─── Types ────────────────────────────────────────────────────────────────

export type {
  CollectionDefinition,
  CollectionEntry,
  CollectionSchemas,
  ComponentsRegistry,
  ContentConfig,
  ContentModule,
  Heading,
} from './types'
