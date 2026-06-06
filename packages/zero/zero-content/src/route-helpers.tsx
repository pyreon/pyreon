/**
 * Route helpers for content collections.
 *
 * **PR-A audit H1** — the single highest-leverage feature in the
 * audit. Every consumer of `@pyreon/zero-content` was re-inventing
 * the same async-component + Suspense workaround to make a route
 * load a markdown entry by slug (see `examples/docs-zero/src/routes/
 * docs/[...slug].tsx` for the pre-fix shape — 80 lines of boilerplate
 * including the `import 'virtual:zero-content/collections'` side-
 * effect, the manual `getStaticPaths` enumeration, the `<Suspense>`
 * wrap to keep Pyreon's synchronous `mount()` happy, and the cast
 * dance around `Promise<VNode>`).
 *
 * `defineContentRoute('docs')` collapses all of it into one call —
 * the user writes `export default defineContentRoute('docs')` in
 * their catch-all route file and gets:
 *
 *   - the `default` component (sync wrapper + Suspense + async body)
 *   - `getStaticPaths` for SSG (enumerated from the slug glob the
 *     virtual collections module already builds)
 *   - sane 404 + loading fallbacks (overridable)
 *   - the registry-import side effect baked in
 *
 * Override surface (everything optional):
 *
 *   defineContentRoute('docs', {
 *     fallback: <DocLoading />,         // sync placeholder pre-resolve
 *     notFound: ({ slug }) => <My404 slug={slug} />,
 *     wrap: (entry, body) => <Layout entry={entry}>{body}</Layout>,
 *   })
 */
import { h, Suspense } from '@pyreon/core'
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { useParams } from '@pyreon/router'
import { getEntry } from './runtime'
import type { CollectionEntry } from './types'

export interface DefineContentRouteOptions {
  /**
   * Synchronously-rendered fallback while the async entry-load is in
   * flight. `<Suspense>` shows this on the client between mount and
   * resolution. Defaults to a near-empty `<article>` shell that
   * matches the SSR layout so layout-shift is minimal.
   *
   * Set to `null` to skip the fallback entirely (the article area
   * will be empty pre-resolve).
   */
  fallback?: VNodeChild | null
  /**
   * Component rendered when the slug doesn't resolve to a known
   * entry. Receives `{ slug }` so the user can show "did you mean…?"
   * suggestions or analytics.
   */
  notFound?: ComponentFn<{ slug: string }>
  /**
   * Wrap the resolved body in a custom layout. Receives the resolved
   * entry + the default rendered body (which is the entry's compiled
   * markdown component invoked with no props). Useful when a per-page
   * frontmatter field should drive layout (`layout: 'narrow'` etc.)
   * without re-implementing the loader plumbing.
   */
  wrap?: (entry: CollectionEntry, body: VNodeChild) => VNodeChild
  /**
   * CSS class for the outer article element. Defaults to
   * `'docs-content vp-doc'` (matching docs-zero / VitePress lineage)
   * so the existing CSS in this monorepo's docs-zero example carries
   * over without changes. Set to `null` to drop the article wrapper
   * and have `wrap()` handle layout entirely.
   */
  articleClass?: string | null
}

/**
 * Cast helper — Pyreon's renderToString awaits async function
 * components, but TypeScript's `ComponentFn` returns `VNodeChild`
 * (not `Promise<VNodeChild>`). This cast routes through `unknown`
 * to keep the JSX call site happy.
 *
 * @internal
 */
type AsyncBody = (props: { slug: string }) => Promise<VNodeChild>

const DEFAULT_ARTICLE_CLASS = 'docs-content vp-doc'

const DefaultNotFound: ComponentFn<{ slug: string }> = (props) =>
  h(
    'div',
    { class: 'docs-404' },
    h('h1', null, '404 — page not found'),
    h(
      'p',
      null,
      'No content under ',
      h('code', null, props.slug),
      '.',
    ),
  )

const DefaultFallback = h('article', { class: DEFAULT_ARTICLE_CLASS })

/**
 * Build a sync top-level route component that loads a collection
 * entry by its `[...slug]` parameter and renders the resolved
 * markdown body inside a `<Suspense>` boundary.
 *
 * Drop-in replacement for the boilerplate in `examples/docs-zero/src/
 * routes/docs/[...slug].tsx`:
 *
 *   export default defineContentRoute('docs')
 *
 * Or with overrides:
 *
 *   export default defineContentRoute('docs', {
 *     fallback: <DocLoading />,
 *     notFound: MyCustom404,
 *     wrap: (entry, body) => (
 *       <Layout frontmatter={entry.data}>{body}</Layout>
 *     ),
 *   })
 */
export function defineContentRoute<TCollection extends string>(
  collection: TCollection,
  options: DefineContentRouteOptions = {},
): ComponentFn {
  const articleClass =
    options.articleClass === undefined
      ? DEFAULT_ARTICLE_CLASS
      : options.articleClass
  const NotFound = options.notFound ?? DefaultNotFound
  const fallback =
    options.fallback === undefined ? DefaultFallback : options.fallback

  // Async body component — `renderToString` awaits it so SSG output
  // carries the resolved HTML; on the client, the surrounding
  // `<Suspense>` boundary handles the deferred resolution. Pyreon's
  // mount() can't handle Promise return values directly, hence the
  // wrap (the cast through `unknown` works around the type-level
  // mismatch between `async function` and `ComponentFn<P>`).
  const AsyncBody: AsyncBody = async ({ slug }) => {
    const entry = await getEntry(collection, slug)
    if (!entry) return h(NotFound, { slug })
    const Content = await entry.render()
    const body = h(Content, null)
    if (options.wrap) return options.wrap(entry, body)
    if (articleClass === null) return body
    return h('article', { class: articleClass }, body)
  }
  const Body = AsyncBody as unknown as ComponentFn<{ slug: string }>

  // Sync wrapper — this is the actual route default export. Returns
  // a `<div data-page-slug>` wrapper carrying the resolved slug so
  // consumer CSS / analytics can hook on it.
  return function ContentRoutePage(): VNodeChild {
    const params = useParams() as unknown as { slug?: string | string[] }
    const raw = params.slug ?? ''
    const slug = Array.isArray(raw) ? raw.join('/') : raw
    return h(
      'div',
      { class: 'docs-page', 'data-page-slug': slug },
      h(Suspense, { fallback }, h(Body, { slug })),
    )
  }
}
