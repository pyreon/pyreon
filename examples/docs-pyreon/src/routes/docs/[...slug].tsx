import { type ComponentFn, lazy } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useParams } from '@pyreon/router'
import { Sidebar } from '../../components/Sidebar'
import { Toc } from '../../components/Toc'

/**
 * Dynamic markdown page renderer.
 *
 * Pyreon's fs-router maps `/docs/anything/here` → `slug = 'anything/here'`.
 * We `lazy()`-import the matching `content/*.md` file; each import resolves
 * to the TSX module that `markdown-to-pyreon.ts` emitted, with a `meta`
 * export carrying the heading list for the right-rail TOC.
 *
 * Vite needs the import to be statically analyzable, so we use a glob
 * import map and route through it at runtime.
 */

interface PageHeading {
  level: number
  text: string
  id: string
}
interface PageModule {
  default: ComponentFn<Record<string, never>>
  meta: { title: string; description?: string; slug: string; headings: PageHeading[] }
}

// Statically-analyzable glob — Vite produces a record keyed by paths
// under `src/content/`. The compiled markdown module shape is asserted
// via `as` because the glob types vite emits don't carry our `meta`.
const pages = import.meta.glob('../../content/**/*.md') as unknown as Record<
  string,
  () => Promise<PageModule>
>

function resolveLoader(slug: string): (() => Promise<PageModule>) | null {
  const candidates = [`../../content/${slug}.md`, `../../content/${slug}/index.md`]
  for (const c of candidates) if (pages[c]) return pages[c]!
  return null
}

export default function DocPage() {
  // fs-router types `useParams` as `Record<string, string>` even though
  // catch-all routes deliver an array. Narrow via a runtime cast.
  const params = useParams() as unknown as { slug: string | string[] }
  const raw = params.slug
  const slug = Array.isArray(raw) ? raw.join('/') : raw
  const loader = resolveLoader(slug)

  if (!loader) {
    return (
      <div class="app-shell">
        <Sidebar />
        <main>
          <article class="content">
            <h1>404 — page not found</h1>
            <p>
              No content under <code>{slug}</code>. Drop a file at{' '}
              <code>src/content/{slug}.md</code> and it'll show up here.
            </p>
          </article>
        </main>
        <aside class="toc" />
      </div>
    )
  }

  // lazy() expects `() => Promise<{ default: ComponentFn<P> }>`. Our
  // page modules also carry a `meta` export — wrap the loader so the
  // shape lazy sees is exactly what it expects, and read `meta` from a
  // separate then() into a signal that drives the TOC.
  const headings = signal<PageHeading[]>([])
  loader().then((mod) => {
    headings.set(mod.meta.headings)
  })
  const PageBody = lazy<Record<string, never>>(async () => {
    const mod = await loader()
    return { default: mod.default }
  })

  return (
    <div class="app-shell">
      <Sidebar />
      <main>
        <PageBody />
      </main>
      <Toc headings={() => headings()} />
    </div>
  )
}
