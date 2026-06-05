import { type ComponentFn, lazy } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useParams } from '@pyreon/router'
import { getCollection, getEntry } from '@pyreon/zero-content'
import { Sidebar } from '../../components/Sidebar'
import { Toc } from '../../components/Toc'

interface PageHeading {
  level: number
  text: string
  slug: string
}

interface NavEntry {
  title: string
  slug: string
}

// Reads from `virtual:zero-content/collections`. The registry is booted
// via the side-effect import in entry-client.ts.
export default function DocPage() {
  const params = useParams() as unknown as { slug: string | string[] }
  const raw = params.slug
  const slug = Array.isArray(raw) ? raw.join('/') : raw

  const headings = signal<PageHeading[]>([])
  const nav = signal<NavEntry[]>([])
  const notFound = signal(false)

  // Build the sidebar nav on every page load. Cheap — getCollection
  // reads from the in-memory registry.
  void (async () => {
    const entries = await getCollection('docs')
    nav.set(
      entries.map((entry) => ({
        title: String(entry.data.title ?? entry.slug),
        slug: entry.slug,
      })),
    )
  })()

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
      <Sidebar entries={() => nav()} currentSlug={slug} />
      <article class="docs-content">
        {() => notFound() ? (
          <div class="docs-404">
            <h1>404 — page not found</h1>
            <p>
              No content under <code>{slug}</code>.
            </p>
          </div>
        ) : (
          <PageBody />
        )}
      </article>
      <Toc headings={() => headings()} />
    </div>
  )
}
