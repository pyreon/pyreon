import IndexContent, {
  headings as indexHeadings,
} from '../../content/docs/index.md'
import { PageMeta } from '../../components/PageMeta'
import { Toc } from '../../components/Toc'

/**
 * Bare `/docs` landing route — explicit because zero's catch-all
 * `[...slug]` doesn't match empty segments, so without this file
 * `/docs` would 404. Imports `src/content/docs/index.md` directly
 * (synchronously), which keeps the page sync and SSG-safe (no async
 * function component, no hydration handshake needed).
 */
interface PageHeading {
  level: number
  text: string
  slug: string
}

export default function DocsIndexPage() {
  const headings = (indexHeadings ?? []) as PageHeading[]
  return (
    <div class="docs-page" data-page-slug="">
      <article class="docs-content vp-doc">
        <IndexContent />
        <PageMeta slug="" />
      </article>
      <Toc headings={() => headings} />
    </div>
  )
}
