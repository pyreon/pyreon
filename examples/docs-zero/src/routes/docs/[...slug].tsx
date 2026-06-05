import { type ComponentFn, lazy } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useParams } from '@pyreon/router'
import { getEntry } from '@pyreon/zero-content'
import { Sidebar } from '../../components/Sidebar'
import { Toc } from '../../components/Toc'
import { PageMeta } from '../../components/PageMeta'

interface PageHeading {
  level: number
  text: string
  slug: string
}

// Reads from `virtual:zero-content/collections`. The sidebar comes from
// the static SIDEBAR config (sidebar-config.ts), not the entry list —
// matches the curated grouping the legacy VitePress site shipped.
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
    <div class="docs-page">
      <Sidebar currentSlug={slug} />
      <article class="docs-content">
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
