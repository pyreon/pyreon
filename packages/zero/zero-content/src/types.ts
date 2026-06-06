import type { ComponentFn } from '@pyreon/core'

// ─── Public type surface for @pyreon/zero-content ──────────────────────────
//
// All cross-module types live here so the runtime, plugin, and config
// helpers can reference the same names without circular imports.

/**
 * Heading record extracted from a markdown page — drives the
 * right-rail TOC. Slug is the anchor target after auto-anchoring.
 */
export interface Heading {
  level: number
  text: string
  slug: string
}

/**
 * The shape of a compiled markdown module after `@pyreon/zero-content`'s
 * Vite transform. Every `.md` / `.mdx` file under a routed collection
 * resolves to this shape via the auto-generated catch-all route.
 */
export interface ContentModule<TFrontmatter = Record<string, unknown>> {
  /** Pyreon component that renders the page body. */
  default: ComponentFn<Record<string, never>>
  /** Frontmatter, validated against the collection's zod schema. */
  frontmatter: TFrontmatter
  /** Heading list for the page (level 2-3). */
  headings: Heading[]
  /** Stable slug derived from the file path (e.g. `docs/zero`). */
  slug: string
}

/**
 * Per-collection definition. Resolved by the Vite plugin at build time
 * to drive content discovery, route generation, and type emission.
 */
export interface CollectionDefinition<TSchema = unknown> {
  /**
   * `'pages'` collections produce file-system routes (zero's fs-router
   * picks up the auto-generated catch-all). `'data'` collections are
   * queryable via `getCollection` / `getEntry` but produce no routes.
   */
  type: 'pages' | 'data'
  /**
   * Default `'src/content/<collection-name>'` when omitted. Resolved
   * relative to the Vite root.
   */
  path?: string
  /**
   * Zod schema that frontmatter is validated against at build. The
   * inferred shape becomes the type of `entry.data` everywhere.
   */
  schema: TSchema
  /**
   * Per-collection MDX component overrides. Merged on top of the
   * top-level `components` from `defineConfig`, which is itself
   * merged on top of the auto-discovered `src/mdx/` set.
   */
  components?: ComponentsRegistry
  /**
   * Whether to include this collection's entries in the search index.
   * Default: `true` for `type: 'pages'`, `false` for `type: 'data'`.
   */
  searchable?: boolean
}

/**
 * Top-level configuration shape returned from `defineConfig`.
 */
export interface ContentConfig {
  collections: Record<string, CollectionDefinition>
  /**
   * Default components available in every markdown file unless
   * overridden by a collection-level `components`.
   */
  components?: ComponentsRegistry
  /**
   * Override the default `src/mdx` convention scan path.
   * Default: `'src/mdx'` (relative to Vite root).
   */
  mdxDir?: string
}

/**
 * Runtime symbol attached to every `defineComponents({...})` return.
 * The plugin checks for this symbol on every `components:` value it
 * sees so a raw `{...}` object passed by mistake fails loudly at
 * config-load time instead of being silently accepted.
 *
 * Pre-fix (PR-A audit C4) the brand existed in types only — the
 * manifest promised "the plugin can refuse raw objects" but no
 * runtime check ever fired. Now `validateComponentsRegistry` (called
 * from the plugin) reads this symbol and emits an actionable error.
 *
 * Registered via `Symbol.for` so multiple package instances (rare, but
 * possible under workspace hoisting edge cases) all share the same
 * symbol identity.
 */
export const COMPONENTS_BRAND = Symbol.for('pyreon:zero-content:components-registry')

/**
 * The shape returned by `defineComponents({...})`. Carries both a
 * type-level brand (so a raw `{...}` literal doesn't fit the
 * `ComponentsRegistry` parameter at compile time) AND the runtime
 * symbol above (so the plugin can detect a `{...}` that bypassed
 * the type check via `as ComponentsRegistry`).
 */
declare const componentsBrand: unique symbol
export type ComponentsRegistry = Record<string, ComponentFn<any>> & {
  readonly [componentsBrand]?: true
}

/**
 * Public augmentation point for `getCollection<K>` / `getEntry<K>` to
 * know the typed shape of each collection's frontmatter. The Vite
 * plugin generates `.pyreon/content-types.d.ts` that augments this
 * interface with one entry per `defineCollection` call.
 *
 * Out of the box this interface is empty; the generated file fills it
 * in. Consumers that want to provide types without running the plugin
 * (rare) can augment it manually.
 */
export interface CollectionSchemas {
  // Augmented by `.pyreon/content-types.d.ts` — generated per project.
}

/**
 * Per-entry shape returned by `getEntry` and `getCollection`.
 */
export interface CollectionEntry<TData = Record<string, unknown>> {
  /** Path-derived slug, e.g. `'docs/zero'` (no leading slash, no extension). */
  slug: string
  /** Frontmatter parsed + validated against the collection's schema. */
  data: TData
  /** Lazy component loader. Returns the rendered page component. */
  render: () => Promise<ComponentFn<Record<string, never>>>
  /** Heading list for the page (level 2-3). */
  headings: Heading[]
}
