import type {
  CollectionEntry,
  CollectionSchemas,
  ContentModule,
  Heading,
} from './types'

// ─── Runtime queries — getCollection / getEntry / getEntries ───────────────
//
// These run in user code (server-side SSG render OR client-side data
// loaders) and read from the Vite-plugin-generated virtual module
// `virtual:zero-content/collections`. That module exposes a glob map of
// every entry per collection plus the collection metadata.
//
// Why a virtual module: Vite resolves `import.meta.glob` at build time
// into a static dependency graph. The plugin doesn't need to KNOW the
// files in advance — `import.meta.glob` does the discovery at consumer
// build time. The virtual module is the runtime bridge that tells the
// query API which collections exist and how to load each entry.

/**
 * Per-collection runtime metadata. The plugin emits one of these per
 * `defineCollection({...})` call in `content.config.ts`. The `loaders`
 * map is the result of an `import.meta.glob` walk over the collection's
 * file path; each loader returns the compiled `ContentModule`.
 */
export interface CollectionRuntime<TData = Record<string, unknown>> {
  /** Collection name (the key in `defineConfig({ collections: {...} })`). */
  name: string
  /** `'pages'` or `'data'`. */
  type: 'pages' | 'data'
  /** Loader map: slug → async loader. Populated from `import.meta.glob`. */
  loaders: Record<string, () => Promise<ContentModule<TData>>>
}

/**
 * Registry shape served by `virtual:zero-content/collections`. Keys are
 * collection names; values are the runtime metadata.
 */
export type CollectionRegistry = Record<string, CollectionRuntime<unknown>>

let _registry: CollectionRegistry | null = null

/**
 * Wire the runtime to the plugin-emitted virtual module. Called once at
 * app boot from the user's entry file — or, more commonly, by the
 * virtual module itself which auto-calls `_setRegistry` during its top
 * level.
 *
 * @internal exported for the virtual module
 */
export function _setRegistry(registry: CollectionRegistry): void {
  _registry = registry
}

/**
 * Get the active registry — throws if the virtual module hasn't been
 * imported yet. The error names the missing setup step so the failure
 * is self-explanatory.
 *
 * @internal exported for testing
 */
export function _getRegistry(): CollectionRegistry {
  if (_registry === null) {
    throw new Error(
      '[@pyreon/zero-content] No content collection registry available. Did you import "virtual:zero-content/collections" at app boot, or is the plugin not registered?',
    )
  }
  return _registry
}

/**
 * Returns every entry in the named collection. The frontmatter (`data`)
 * is typed from the collection's zod schema via the augmented
 * `CollectionSchemas` interface (generated to `.pyreon/content-types.d.ts`).
 *
 * Each entry exposes a `render()` loader — call it to get the compiled
 * page component. The renderer is async because content modules are
 * lazy-loaded by default (Vite splits them into per-route chunks).
 */
/**
 * PR-J audit M13 — options accepted by `getCollection`.
 *
 *   - `includeDrafts`: when `false` (default in PRODUCTION builds),
 *     entries whose frontmatter has `draft: true` are skipped. In dev
 *     mode the default flips to `true` so authors can preview drafts.
 *     Pass an explicit boolean to override.
 *
 *   - `filter`: optional predicate run against each entry's data —
 *     return `false` to drop it. Useful for tag-based listings,
 *     date-range filters, etc.
 */
export interface GetCollectionOptions<TData = Record<string, unknown>> {
  includeDrafts?: boolean
  filter?: (entry: CollectionEntry<TData>) => boolean
}

export async function getCollection<K extends keyof CollectionSchemas & string>(
  name: K,
  options?: GetCollectionOptions<CollectionSchemas[K]>,
): Promise<CollectionEntry<CollectionSchemas[K]>[]>
export async function getCollection(
  name: string,
  options?: GetCollectionOptions,
): Promise<CollectionEntry<Record<string, unknown>>[]>
export async function getCollection(
  name: string,
  options?: GetCollectionOptions,
): Promise<CollectionEntry[]> {
  const collection = _getRegistry()[name]
  if (!collection) {
    const available = Object.keys(_getRegistry()).sort().join(', ') || '(none)'
    throw new Error(
      `[@pyreon/zero-content] Collection "${name}" is not defined. Available collections: ${available}.`,
    )
  }
  const slugs = Object.keys(collection.loaders).sort()
  const entries = await Promise.all(
    slugs.map(async (slug): Promise<CollectionEntry> => {
      const mod = await collection.loaders[slug]!()
      return {
        slug: mod.slug ?? slug,
        data: mod.frontmatter as Record<string, unknown>,
        render: async () => mod.default,
        headings: mod.headings ?? [],
      }
    }),
  )
  // PR-J audit M13 — draft filtering. The default is environment-aware:
  // production builds skip drafts (so a `draft: true` page can be
  // staged in source without leaking to a public deploy); dev mode
  // shows them so authors preview their work-in-progress freely.
  const includeDrafts =
    options?.includeDrafts
    ?? (typeof process !== 'undefined'
      ? process.env['NODE_ENV'] !== 'production'
      : true)
  let result = entries
  if (!includeDrafts) {
    result = result.filter((e) => e.data['draft'] !== true)
  }
  if (options?.filter) {
    result = result.filter(options.filter)
  }
  return result
}

/**
 * Returns one entry from a collection by slug, or `undefined` if not
 * present. Slug match is exact — case-sensitive, no trailing-slash
 * normalisation.
 */
export async function getEntry<K extends keyof CollectionSchemas & string>(
  name: K,
  slug: string,
): Promise<CollectionEntry<CollectionSchemas[K]> | undefined>
export async function getEntry(
  name: string,
  slug: string,
): Promise<CollectionEntry<Record<string, unknown>> | undefined>
export async function getEntry(
  name: string,
  slug: string,
): Promise<CollectionEntry | undefined> {
  const collection = _getRegistry()[name]
  if (!collection) return undefined
  const loader = collection.loaders[slug]
  if (!loader) return undefined
  const mod = await loader()
  return {
    slug: mod.slug ?? slug,
    data: mod.frontmatter as Record<string, unknown>,
    render: async () => mod.default,
    headings: mod.headings ?? [],
  }
}

/**
 * Returns multiple entries by slug. Missing slugs are silently
 * filtered. Useful for related-content widgets ("see also...").
 */
export async function getEntries<K extends keyof CollectionSchemas & string>(
  name: K,
  slugs: string[],
): Promise<CollectionEntry<CollectionSchemas[K]>[]>
export async function getEntries(
  name: string,
  slugs: string[],
): Promise<CollectionEntry<Record<string, unknown>>[]>
export async function getEntries(
  name: string,
  slugs: string[],
): Promise<CollectionEntry[]> {
  const collection = _getRegistry()[name]
  if (!collection) return []
  const entries = await Promise.all(
    slugs.map(async (slug): Promise<CollectionEntry | null> => {
      const loader = collection.loaders[slug]
      if (!loader) return null
      const mod = await loader()
      return {
        slug: mod.slug ?? slug,
        data: mod.frontmatter as Record<string, unknown>,
        render: async () => mod.default,
        headings: mod.headings ?? [],
      }
    }),
  )
  return entries.filter((entry): entry is CollectionEntry => entry !== null)
}

/**
 * Returns the runtime metadata of every registered collection. Useful
 * for build-time tooling (sitemap generation, listing all collections,
 * etc.).
 *
 * @internal exported for testing + tooling
 */
export function _listCollections(): string[] {
  return Object.keys(_getRegistry()).sort()
}

/**
 * Reset the registry for tests. Production code never calls this; the
 * registry is intentionally per-process and lives for the build.
 *
 * @internal exported for testing
 */
export function _resetRegistryForTesting(): void {
  _registry = null
}

/**
 * Re-exports the public types for ergonomic consumer use. Apps import
 * these alongside `getCollection` etc.
 */
export type { CollectionEntry, ContentModule, Heading }
