import { useParams } from '@pyreon/router'
import { getEntry } from '@pyreon/zero-content'
import type { GetStaticPaths } from '@pyreon/zero/server'
// Side-effect import — populates the @pyreon/zero-content collection
// registry. `entry-client.ts` does the same for runtime; SSG render
// time needs it too because the route module is evaluated in the
// inner SSR build's module graph (which doesn't go through
// entry-client). With user-plugins forwarding (fixed in @pyreon/zero),
// the content plugin's `virtual:zero-content/collections` resolveId
// hook is available in the SSG inner build.
import 'virtual:zero-content/collections'
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
 * Catch-all docs route — renders as an ASYNC component so the SSG
 * renderer awaits `getEntry()` + `entry.render()` BEFORE producing
 * the article HTML. `renderToString` from `@pyreon/runtime-server`
 * awaits async components per its documented contract; this is the
 * canonical way to pre-resolve content at SSG time.
 *
 * Result: the prerendered HTML carries the full article body (text,
 * headings, code blocks, MDX components) inline — no client-side
 * fill-in needed for SEO / first paint / no-JS users.
 *
 * The sidebar / chrome is mounted by `_layout.tsx`; this route only
 * renders the article body + the right-rail TOC + the page footer
 * (edit-on-github + last updated). Keeps the layout stable across
 * landing → docs navigation.
 */
export default async function DocPage() {
  const params = useParams() as unknown as { slug: string | string[] }
  const raw = params.slug
  const slug = Array.isArray(raw) ? raw.join('/') : raw

  const entry = await getEntry('docs', slug)

  if (!entry) {
    return (
      <div class="docs-page" data-page-slug={slug}>
        <article class="docs-content vp-doc">
          <div class="docs-404">
            <h1>404 — page not found</h1>
            <p>
              No content under <code>{slug}</code>.
            </p>
          </div>
        </article>
      </div>
    )
  }

  const Content = await entry.render()
  const headings = (entry.headings ?? []) as PageHeading[]

  return (
    <div class="docs-page" data-page-slug={slug}>
      <article class="docs-content vp-doc">
        <Content />
        <PageMeta slug={slug} />
      </article>
      <Toc headings={() => headings} />
    </div>
  )
}
