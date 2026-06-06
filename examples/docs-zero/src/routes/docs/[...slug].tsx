import { defineContentRoute } from '@pyreon/zero-content'
import type { GetStaticPaths } from '@pyreon/zero/server'
// Side-effect import — populates the @pyreon/zero-content collection
// registry. `entry-client.ts` does the same for runtime; SSG render
// time needs it too because the route module is evaluated in the
// inner SSR build's module graph (which doesn't go through
// entry-client).
import 'virtual:zero-content/collections'
import { h } from '@pyreon/core'
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
 * Catch-all docs route — built from `defineContentRoute('docs')` so
 * the loader plumbing + Suspense + 404 + article wrapper are all
 * provided by the helper. We pass a `wrap` callback to extend the
 * rendered body with the page meta (edit-on-GitHub + last updated)
 * AND the right-rail TOC.
 *
 * Pre-fix (PR-A audit H1) this file was ~80 lines including the
 * async DocBody dance + Suspense cast. The helper makes it ~30.
 */
export default defineContentRoute('docs', {
  wrap: (entry, body) => {
    const headings = (entry.headings ?? []) as PageHeading[]
    const slug = entry.slug
    return h(
      'div',
      { class: 'docs-route' },
      h(
        'article',
        { class: 'docs-content vp-doc' },
        body,
        h(PageMeta, { slug }),
      ),
      h(Toc, { headings: () => headings }),
    )
  },
  // `wrap` provides the article wrapper itself, so disable the
  // helper's default `<article>` so we don't get nested wrappers.
  articleClass: null,
})
