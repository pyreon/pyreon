import { type ComponentFn, lazy } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useParams } from '@pyreon/router'
import { getEntry } from '@pyreon/zero-content'
import type { GetStaticPaths } from '@pyreon/zero/server'
import { PageMeta } from '../../components/PageMeta'
import { Toc } from '../../components/Toc'

interface PageHeading {
  level: number
  text: string
  slug: string
}

/**
 * Enumerate every docs slug at build time so the SSG plugin emits a
 * per-page HTML file (`dist/docs/<slug>/index.html`). Without this,
 * `mode: 'ssg'` would silently skip the dynamic catch-all route and
 * every deep URL would 404 on the static host.
 *
 * Uses `import.meta.glob` directly — NOT `getCollection('docs')` —
 * because the SSG plugin's inner SSR sub-build (`buildSsrBundle` in
 * `@pyreon/zero/src/ssr-build-shared.ts:229`) only registers
 * `[pyreon(), zeroPlugin()]` and does NOT propagate user plugins
 * like `@pyreon/zero-content`. So the virtual collection registry
 * `virtual:zero-content/collections` is unresolvable at build-time
 * SSG enumeration. `import.meta.glob` is Vite-native and works in
 * both the inner SSR build and the client build.
 *
 * Follow-up: extend `buildSsrBundle` to merge user plugins from the
 * outer Vite config so `getCollection()` works at SSG time too. Until
 * then, dynamic routes have to enumerate via glob.
 *
 * Catch-all routes (`[...slug]`) accept slashes in the param:
 * `{ params: { slug: 'patterns/data-fetching' } }` resolves to the
 * URL `/docs/patterns/data-fetching`.
 */
// `import.meta.glob` with NO query — gives just the path-keyed map. The
// loaders are lazy-evaluated (we never call them), so this only walks
// the directory at config-time and the markdown files are never
// pre-imported. The `Object.keys` enumeration is what drives the SSG
// path list. Same Vite primitive `@pyreon/zero-content` uses internally
// in `renderVirtualCollections`.
const slugGlob = import.meta.glob('../../content/docs/**/*.md')
export const getStaticPaths: GetStaticPaths<{ slug: string }> = () => {
  return Object.keys(slugGlob)
    .map((p) =>
      p
        .replace('../../content/docs/', '')
        .replace(/\.(md|mdx)$/, ''),
    )
    .map((slug) => ({ params: { slug } }))
}

// Reads from `virtual:zero-content/collections`. The sidebar / chrome
// is mounted by `_layout.tsx`; this route only renders the article
// body + the right-rail TOC + the page footer (edit-on-github + last
// updated). Keeps the layout stable across landing → docs navigation.
export default function DocPage() {
  const params = useParams() as unknown as { slug: string | string[] }
  const raw = params.slug
  const slug = Array.isArray(raw) ? raw.join('/') : raw

  const headings = signal<PageHeading[]>([])
  const notFound = signal(false)

  const PageBody = lazy<Record<string, never>>(async () => {
    const entry = await getEntry('docs', slug)
    if (!entry) {
      notFound.set(true)
      const Empty: ComponentFn<Record<string, never>> = () => null
      return { default: Empty }
    }
    headings.set(entry.headings as PageHeading[])
    const Component = await entry.render()
    return { default: Component as ComponentFn<Record<string, never>> }
  })

  return (
    <div class="docs-page" data-page-slug={() => slug}>
      <article class="docs-content vp-doc">
        {() =>
          notFound() ? (
            <div class="docs-404">
              <h1>404 — page not found</h1>
              <p>
                No content under <code>{slug}</code>.
              </p>
            </div>
          ) : (
            <>
              <PageBody />
              <PageMeta slug={slug} />
            </>
          )
        }
      </article>
      <Toc headings={() => headings()} />
    </div>
  )
}
