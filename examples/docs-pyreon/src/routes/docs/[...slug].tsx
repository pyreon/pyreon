import { lazy } from '@pyreon/core'
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

// Statically-analyzable glob — Vite produces a `Record<string, () => Promise<Module>>`
// keyed by absolute paths under `src/content/`.
const pages = import.meta.glob('../../content/**/*.md', { eager: false }) as Record<
  string,
  () => Promise<{
    default: () => unknown
    meta: { title: string; description?: string; slug: string; headings: { level: number; text: string; id: string }[] }
  }>
>

function resolveLoader(slug: string) {
  // Match `src/content/<slug>.md` or `src/content/<slug>/index.md`
  const candidates = [
    `../../content/${slug}.md`,
    `../../content/${slug}/index.md`,
  ]
  for (const c of candidates) {
    if (pages[c]) return pages[c]!
  }
  return null
}

export default function DocPage() {
  const params = useParams<{ slug: string | string[] }>()
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

  const PageBody = lazy(loader)

  // Headings come from the lazy chunk's `meta` export — fetch once on
  // load and feed it into the TOC. Until it resolves the TOC is empty,
  // which is fine (no flash since the chunk loads sub-100ms in dev).
  let headings: { level: number; text: string; id: string }[] = []
  loader().then((mod) => {
    headings = mod.meta.headings
  })

  return (
    <div class="app-shell">
      <Sidebar />
      <main>
        <PageBody />
      </main>
      <Toc headings={headings} />
    </div>
  )
}
