import type { ComponentFn } from '@pyreon/core'
import { Suspense } from '@pyreon/core'
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
 * Async body component — `renderToString` awaits it per the documented
 * contract so the SSG output carries the full article HTML inline (SEO
 * + first paint + no-JS users). On the client, it's wrapped in
 * `<Suspense>` below so the async resolution can settle into a
 * fallback without crashing the synchronous `mount()`.
 *
 * Returning a pure-async function as the top-level route component
 * would crash the client with `Cannot read properties of undefined
 * (reading 'ref')` because `mount()` is synchronous and treats the
 * returned Promise as a VNode. The Suspense wrapper at the route
 * level is the indirection that makes both ends work.
 */
// Re-exported as `Body` (typed as a regular ComponentFn) below so it
// can be invoked in JSX without TS complaining about `Promise<VNode>`.
async function DocBody({ slug }: { slug: string }) {
  const entry = await getEntry('docs', slug)
  if (!entry) {
    return (
      <div class="docs-404">
        <h1>404 — page not found</h1>
        <p>
          No content under <code>{slug}</code>.
        </p>
      </div>
    )
  }
  const Content = await entry.render()
  const headings = (entry.headings ?? []) as PageHeading[]
  // PageMeta + TOC share `headings`; render both here so the async
  // resolution covers everything that depends on the entry.
  return (
    <>
      <article class="docs-content vp-doc">
        <Content />
        <PageMeta slug={slug} />
      </article>
      <Toc headings={() => headings} />
    </>
  )
}

/**
 * Catch-all docs route — sync wrapper that delegates to the async
 * `<DocBody>` inside a `<Suspense>` boundary. Sync return lets the
 * client's `mount()` handle the component normally; the inner async
 * call is the part `renderToString` awaits at SSG time AND the
 * Suspense boundary covers on the client until the resolution lands.
 *
 * The sidebar / chrome is mounted by `_layout.tsx`; this route only
 * renders the article body + the right-rail TOC + the page footer
 * (edit-on-github + last updated).
 */
const Body = DocBody as unknown as ComponentFn<{ slug: string }>

export default function DocPage() {
  const params = useParams() as unknown as { slug: string | string[] }
  const raw = params.slug
  const slug = Array.isArray(raw) ? raw.join('/') : raw

  return (
    <div class="docs-page" data-page-slug={slug}>
      <Suspense fallback={<article class="docs-content vp-doc" />}>
        {/* Cast: async components return `Promise<VNode>` at the type
            level; Pyreon's runtime awaits them so they behave as
            ordinary components inside JSX. */}
        <Body slug={slug} />
      </Suspense>
    </div>
  )
}
