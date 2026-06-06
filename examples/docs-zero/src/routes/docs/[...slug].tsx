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
 * per-page HTML file (`dist/docs/<slug>/index.html`). Uses
 * `import.meta.glob` to walk the markdown directory at config-time —
 * loaders are NOT called, only the keys are enumerated.
 *
 * Catch-all routes (`[...slug]`) accept slashes in the param:
 * `{ params: { slug: 'patterns/data-fetching' } }` resolves to the
 * URL `/docs/patterns/data-fetching`.
 */
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

/**
 * Catch-all docs route.
 *
 * Renders the SSG shell synchronously + loads markdown content via
 * `lazy()` after hydration. The prerendered HTML carries the full
 * page chrome (header, sidebar, footer) but the article body is
 * blank — it fills in client-side once `getEntry` + `entry.render()`
 * resolve.
 *
 * **Known limitation**: an `async function DocPage()` (which
 * `renderToString` would await) WOULD pre-render the body, but the
 * SSG inner build's chunked markdown modules don't resolve the
 * `virtual:zero-content/components` re-export of built-in components
 * (`CodeBlock`, `Callout`, etc.) — they appear as undefined free
 * variables at module-eval, producing `ReferenceError: CodeBlock is
 * not defined`. The framework gap is in `@pyreon/zero`'s inner-build
 * bundling of dynamically-imported chunks that reference virtual
 * modules served by user plugins. Tracked as a follow-up; the
 * client-side fill-in here is the deliberate workaround for the bake
 * window.
 */
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
