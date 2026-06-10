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
  isBrandedComponentsRegistry,
  mergeComponents,
} from './config'
export { COMPONENTS_BRAND } from './types'

// ─── Route helpers — content-collection-shaped routes ─────────────────────
//
// `defineContentRoute('docs')` collapses the docs Suspense
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
// PR-M audit M6+M7+M8 — math, mermaid, details
export { Details } from './components/Details'
export type { DetailsProps } from './components/Details'
// <Example file="./..." share="key"> — Pyreon-native docs DX primitive.
// Loads a real `.tsx` file inline (NOT iframe). Two `<Example>` calls
// with the same `share` key get the SAME signal — cross-Example
// reactive state. The registry is populated by the consumer at startup
// via `registerExamples(import.meta.glob('./examples/**/*.tsx'))`.
export { Example } from './components/Example'
export type { ExampleProps } from './components/Example'
export {
  _exampleCount,
  _exampleKeys,
  _resetExampleRegistry,
  registerExamples,
} from './components/example-registry'
export {
  _hasSharedSignal,
  _sharedSignalCount,
  clearAllSharedSignals,
  getOrCreateSharedSignal,
} from './components/shared-signal-registry'
export { Math } from './components/Math'
export type { MathProps } from './components/Math'
export { Mermaid } from './components/Mermaid'
export type { MermaidProps } from './components/Mermaid'
// PR-K — extended built-in component set (audit H2 + H14)
export { APICard, deriveApiId } from './components/APICard'
export type { APICardProps } from './components/APICard'
export {
  CompatMatrix,
  renderCompatCell,
} from './components/CompatMatrix'
export type {
  CompatCellValue,
  CompatMatrixProps,
} from './components/CompatMatrix'
export {
  PackageBadge,
  renderInstallRows,
} from './components/PackageBadge'
export type {
  PackageBadgeProps,
  PackageManager,
} from './components/PackageBadge'
export { buildSrcdoc, Playground } from './components/Playground'
export type { PlaygroundProps } from './components/Playground'
export { PropTable } from './components/PropTable'
export type { PropRow, PropTableProps } from './components/PropTable'
export { Tabs } from './components/Tabs'
export type { TabsProps } from './components/Tabs'
// PR-F audit H7 — `<Image>` re-exported as a built-in so the emit-jsx
// local-image rewrite resolves via `virtual:zero-content/components`.
export { Image } from './components/Image'
export {
  defineSidebar,
  groupEntries,
  groupsFromConfig,
  Sidebar,
} from './components/Sidebar'
export type {
  SidebarConfig,
  SidebarConfigGroup,
  SidebarConfigItem,
  SidebarEntry,
  SidebarProps,
} from './components/Sidebar'
export { filterHeadings, Toc } from './components/Toc'
export type { TocProps } from './components/Toc'
// PR-I — navigation widgets (audit M9 + M10)
export { PrevNext, resolvePrevNext } from './components/PrevNext'
export type { PrevNextProps } from './components/PrevNext'
export {
  Breadcrumbs,
  buildBreadcrumbs,
  humanize,
} from './components/Breadcrumbs'
export type { BreadcrumbCrumb, BreadcrumbsProps } from './components/Breadcrumbs'
// PR-I — per-page layout override (audit M11)
export { resolvePageLayout } from './frontmatter-layout'
export type {
  ContentLayout,
  ContentLayoutRegistry,
  ResolvedPageLayout,
  ResolvePageLayoutArgs,
} from './frontmatter-layout'

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
export type {
  CollectionRegistry,
  CollectionRuntime,
  GetCollectionOptions,
} from './runtime'
// PR-J — cross-collection references (audit M14)
export {
  isReference,
  reference,
  resolveReference,
  resolveReferences,
} from './references'
export type { Reference } from './references'

// ─── SEO + build outputs (PR-L audit M19) ─────────────────────────────────
//
// Pure builders for sitemap.xml / RSS 2.0 / llms.txt. Callable from
// any build script — no Vite plugin coupling. The plugin's
// `seo: { ... }` option auto-emits these into `dist/` at build close
// when configured.
export {
  generateSitemap,
  joinUrl,
} from './seo/sitemap'
export type {
  GenerateSitemapArgs,
  SitemapPage,
} from './seo/sitemap'
export { generateRssFeed, toRfc822 } from './seo/rss'
export type { GenerateRssFeedArgs, RssItem } from './seo/rss'
export { generateLlmsTxt } from './seo/llms-txt'
export type {
  GenerateLlmsTxtArgs,
  LlmsTxtPage,
  LlmsTxtSection,
} from './seo/llms-txt'

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
