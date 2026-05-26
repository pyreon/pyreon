import { useHead } from '@pyreon/head'
import { useI18n } from '@pyreon/i18n'
import { toast } from '@pyreon/toast'
import { Link } from '@pyreon/zero/link'
import { computed } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { createDocument, download } from '@pyreon/document'
import { useBookmarksModel, type Bookmark } from '../lib/bookmarks'

/**
 * Bookmarks page — exercises:
 *  - `@pyreon/state-tree` (BookmarksModel — schema-mode with chainable views/actions)
 *  - `@pyreon/toast`      (notification on remove/clear)
 *  - `@pyreon/dnd`        (useSortable — pointer-drag reorder of the list)
 *  - `@pyreon/document`   (export bookmarks to PDF / Markdown via builder)
 *
 * Persistence is installed app-wide via `installBookmarksPersistence()`
 * in `_layout.tsx` so bookmarks added on `/item/:id` reach localStorage
 * regardless of which route the user is currently on. See
 * `../lib/bookmarks.ts` for the storage + cross-tab sync code.
 *
 * Reorder strategy: `useSortable` emits a freshly-ordered array via
 * `onReorder`; we feed it back into the state-tree via `model.reorder()`
 * which preserves bookmark identity via the IDs.
 *
 * Export strategy: `@pyreon/document` builds a structured document via
 * the chainable `createDocument()` API, then `download()` dispatches to
 * the right renderer based on extension (`.pdf` → PDF, `.md` → markdown).
 */
export default function BookmarksPage() {
  const { t } = useI18n()
  useHead(() => ({ title: `${t('nav.bookmarks')} — Hacker News (Pyreon)` }))

  const model = useBookmarksModel()

  // useSortable expects a signal of items + a `by` key extractor.
  // We adapt the state-tree's items() to a computed-signal shape.
  const items = computed(() => model.items() as Bookmark[])

  const sortable = useSortable<Bookmark>({
    items,
    by: (b) => String(b.id),
    onReorder: (next) => {
      model.reorder(next.map((b) => b.id))
      toast.info('Bookmarks reordered')
    },
  })

  // ── PDF / Markdown export via @pyreon/document ───────────────────────────
  const exportBookmarks = async (filename: string) => {
    const list = items()
    if (list.length === 0) {
      toast.error('No bookmarks to export')
      return
    }
    try {
      const doc = createDocument({ title: 'My HN Bookmarks' })
        .heading('My HN Bookmarks')
        .text(`Exported ${new Date().toLocaleString()} — ${list.length} stories`)
        .divider()
      for (const [i, b] of list.entries()) {
        doc.heading(`${i + 1}. ${b.title}`, { level: 3 })
        if (b.url) doc.link(b.url, { href: b.url })
        doc.text(
          `${b.domain ? `Domain: ${b.domain} · ` : ''}Added ${new Date(
            b.addedAt,
          ).toLocaleDateString()}`,
        )
      }
      await download(doc.build(), filename)
      toast.success(`Exported to ${filename}`)
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <section class="bookmarks-page">
      <header class="bookmarks-header">
        <h1>{() => t('nav.bookmarks')}</h1>
        {() => {
          const count = model.count() as number
          return count > 0 ? <span class="bookmarks-count">{count} saved</span> : null
        }}
        {() => {
          const count = model.count() as number
          return count > 0 ? (
            <button
              type="button"
              class="link-btn"
              onClick={() => {
                model.clear()
                toast.success('Cleared all bookmarks')
              }}
            >
              clear all
            </button>
          ) : null
        }}
        {() => {
          const count = model.count() as number
          return count > 0 ? (
            <>
              <button
                type="button"
                class="link-btn"
                onClick={() => exportBookmarks('bookmarks.md')}
                data-testid="export-md"
              >
                export .md
              </button>
              <button
                type="button"
                class="link-btn"
                onClick={() => exportBookmarks('bookmarks.pdf')}
                data-testid="export-pdf"
              >
                export .pdf
              </button>
            </>
          ) : null
        }}
      </header>

      {() => {
        const list = items()
        if (list.length === 0)
          return <div class="feed-state">{t('bookmarks.empty')}</div>
        return (
          <ol
            ref={sortable.containerRef}
            class="story-list bookmarks-sortable"
            style="list-style: none; padding: 0"
          >
            {list.map((b, i) => (
              <li
                ref={sortable.itemRef(String(b.id))}
                key={String(b.id)}
                class="story-row bookmark-row"
                data-bookmark-id={b.id}
                data-active={() =>
                  sortable.activeId() === String(b.id) ? 'true' : 'false'
                }
                data-over-edge={() =>
                  sortable.overId() === String(b.id) ? sortable.overEdge() ?? '' : ''
                }
              >
                <span class="story-rank drag-handle" aria-label="drag to reorder">
                  ⋮⋮
                </span>
                <span class="story-rank">{i + 1}.</span>
                <BookmarkBody bookmark={b} />
              </li>
            ))}
          </ol>
        )
      }}

      <p class="bookmarks-hint">{() => t('bookmarks.dragHint')}</p>
    </section>
  )
}

function BookmarkBody(props: { bookmark: Bookmark }) {
  const model = useBookmarksModel()
  const { t } = useI18n()
  const b = props.bookmark
  return (
    <div class="story-body">
      <div class="story-title">
        {b.url.startsWith('http') ? (
          <a href={b.url} target="_blank" rel="noreferrer" class="story-link">
            {b.title}
          </a>
        ) : (
          <Link href={`/item/${b.id}`} class="story-link">
            {b.title}
          </Link>
        )}
        {b.domain && <span class="story-domain"> ({b.domain})</span>}
      </div>
      <div class="story-meta">
        <span>added {new Date(b.addedAt).toLocaleDateString()}</span>
        <span> | </span>
        <Link href={`/item/${b.id}`} class="story-comments">
          discuss
        </Link>
        <span> | </span>
        <button
          type="button"
          class="link-btn"
          onClick={() => {
            model.remove(b.id)
            toast.info(t('item.unbookmark'))
          }}
        >
          {() => t('item.unbookmark')}
        </button>
      </div>
    </div>
  )
}
