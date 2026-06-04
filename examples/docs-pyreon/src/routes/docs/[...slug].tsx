import { type ComponentFn, lazy } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useParams } from '@pyreon/router'
import { getEntry } from '@pyreon/zero-content'
import 'virtual:zero-content/collections'
import { Sidebar } from '../../components/Sidebar'
import { Toc } from '../../components/Toc'

/**
 * Dynamic markdown page renderer — migrated to @pyreon/zero-content
 * (PR 7 of the rollout). Instead of a hand-rolled `import.meta.glob`,
 * we go through `getEntry('docs', slug)` which reads from the
 * plugin-emitted `virtual:zero-content/collections` registry.
 *
 * Side-effect import of `virtual:zero-content/collections` boots the
 * registry at app load — the virtual module calls `_setRegistry` on
 * its top-level scope.
 */

interface PageHeading {
  level: number
  text: string
  id: string
}

interface ZeroContentHeading {
  level: number
  text: string
  slug: string
}

export default function DocPage() {
  // fs-router types `useParams` as `Record<string, string>` even though
  // catch-all routes deliver an array. Narrow via a runtime cast.
  const params = useParams() as unknown as { slug: string | string[] }
  const raw = params.slug
  const slug = Array.isArray(raw) ? raw.join('/') : raw

  const headings = signal<PageHeading[]>([])
  const notFound = signal(false)

  const PageBody = lazy<Record<string, never>>(async () => {
    const entry = await getEntry('docs', slug)
    if (!entry) {
      notFound.set(true)
      // Return a synthetic empty page; the parent renders the 404 UI.
      const Empty: ComponentFn<Record<string, never>> = () => null
      return { default: Empty }
    }
    // zero-content's Heading shape uses `slug`; the local Toc expects
    // `id`. Map between the two — the slug IS the rendered element's
    // id (both come from the same slugify pass at build time).
    const fromZeroContent = entry.headings as ZeroContentHeading[]
    headings.set(
      fromZeroContent.map((h) => ({ level: h.level, text: h.text, id: h.slug })),
    )
    const Component = await entry.render()
    return { default: Component as ComponentFn<Record<string, never>> }
  })

  return (
    <div class="app-shell">
      <Sidebar />
      <main>
        {() => notFound() ? (
          <article class="content">
            <h1>404 — page not found</h1>
            <p>
              No content under <code>{slug}</code>. Drop a file at{' '}
              <code>src/content/docs/{slug}.md</code> and it'll show up here.
            </p>
          </article>
        ) : (
          <PageBody />
        )}
      </main>
      <Toc headings={() => headings()} />
    </div>
  )
}
