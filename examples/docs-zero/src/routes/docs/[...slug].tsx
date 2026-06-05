import { type ComponentFn, lazy, onMount } from '@pyreon/core'
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
//
// Mobile drawer wiring: the sidebar is a slide-in overlay on small
// viewports. The hamburger button (in <Header>) toggles the drawer
// signal; clicking a sidebar link auto-closes the drawer via
// onNavigate; pressing Esc also closes it.
export default function DocPage() {
  const params = useParams() as unknown as { slug: string | string[] }
  const raw = params.slug
  const slug = Array.isArray(raw) ? raw.join('/') : raw

  const headings = signal<PageHeading[]>([])
  const notFound = signal(false)
  const drawerOpen = signal(false)

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen()) drawerOpen.set(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
      <button
        type="button"
        class="docs-mobile-toggle"
        aria-label="Open navigation menu"
        onClick={() => drawerOpen.set(true)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span>Menu</span>
      </button>
      <div
        class={() =>
          drawerOpen()
            ? 'docs-sidebar-wrap docs-sidebar-wrap--open'
            : 'docs-sidebar-wrap'
        }
      >
        <div
          class="docs-sidebar-backdrop"
          aria-hidden="true"
          onClick={() => drawerOpen.set(false)}
        />
        <Sidebar
          currentSlug={slug}
          onNavigate={() => drawerOpen.set(false)}
        />
      </div>
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
