import { useQuery } from '@pyreon/query'
import { useHead } from '@pyreon/head'
import { Link } from '@pyreon/zero/link'
import { useRoute } from '@pyreon/router'
import { useClipboard, useToggle, useBreakpoint } from '@pyreon/hooks'
import { useI18n } from '@pyreon/i18n'
import { toast } from '@pyreon/toast'
import { CodeEditor, createEditor } from '@pyreon/code'
import { computed } from '@pyreon/reactivity'
import { onUnmount } from '@pyreon/core'
import { usePermissions } from '@pyreon/permissions'
import { useBookmarksModel, type Bookmark } from '../../lib/bookmarks'
import CommentTree from '../../components/CommentTree'
import VirtualizedComments from '../../components/VirtualizedComments'
import { fetchItem } from '../../lib/api'

const VIRTUALIZE_THRESHOLD = 50

export default function Item() {
  const route = useRoute()
  const { t } = useI18n()
  const can = usePermissions()
  const id = () => route().params.id ?? ''

  const query = useQuery(() => ({
    queryKey: ['item', id()],
    queryFn: () => fetchItem(id()),
  }))

  useHead(() => {
    const data = query.data()
    return {
      title: data?.title
        ? `${data.title} | Hacker News (Pyreon)`
        : 'Loading… | Hacker News (Pyreon)',
    }
  })

  // Hooks integration ──────────────────────────────────────────────────────
  const clipboard = useClipboard({ timeout: 2000 })
  const jsonOpen = useToggle(false)
  const breakpoint = useBreakpoint()
  const bookmarks = useBookmarksModel()

  // CodeMirror editor for the raw JSON view — initialized lazily once the
  // user toggles it open. Keeps the initial-load cost zero.
  let editor: ReturnType<typeof createEditor> | null = null
  onUnmount(() => {
    editor?.dispose()
  })

  const jsonText = computed(() => {
    const data = query.data()
    return data ? JSON.stringify(data, null, 2) : ''
  })

  const ensureEditor = () => {
    if (editor) return editor
    // `computed()` returns a callable accessor, NOT a Signal — so it has
    // no `.peek()`. Call it directly to read the cached value without
    // subscribing (we're outside any tracking scope here anyway).
    editor = createEditor({
      value: jsonText(),
      language: 'json',
      readOnly: true,
      theme: 'dark',
      lineNumbers: true,
    })
    return editor
  }

  const isBookmarked = computed(() => {
    const data = query.data()
    if (!data) return false
    return bookmarks.has(data.id) as boolean
  })

  const handleShare = async () => {
    const url = window.location.href
    const ok = await clipboard.copy(url)
    if (ok) toast.success(t('item.shared'))
  }

  const handleBookmark = () => {
    const data = query.data()
    if (!data) return
    if (isBookmarked()) {
      bookmarks.remove(data.id)
      toast.info(t('item.unbookmark'))
    } else {
      // The HN API returns `null` for missing fields on some kinds (jobs,
      // polls). Coerce to strings so the schema's `z.string()` validator
      // doesn't reject the add — the bookmark is a UX-level pin, not a
      // canonical entity.
      const bookmark: Bookmark = {
        id: data.id,
        title: data.title ?? '(untitled)',
        url: data.url ?? '',
        domain: data.domain,
        addedAt: Date.now(),
      }
      bookmarks.add(bookmark)
      toast.success(t('item.bookmark'))
    }
  }

  const handleToggleJson = () => {
    if (!jsonOpen.value()) ensureEditor()
    jsonOpen.toggle()
  }

  return (
    <section class="item-detail">
      {() => {
        if (query.isPending()) return <div class="feed-state">{t('feed.loading')}</div>
        if (query.isError())
          return (
            <div class="feed-state error">{t('feed.error', { error: String(query.error()) })}</div>
          )
        const item = query.data()
        if (!item) return <div class="feed-state">Story not found.</div>

        return (
          <>
            <header class="item-header">
              <h1 class="item-title">
                {item.url.startsWith('http') ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
                {item.domain && <span class="story-domain"> ({item.domain})</span>}
              </h1>
              <div class="item-meta">
                {item.type !== 'job' && (
                  <>
                    <span>
                      {t(item.points === 1 ? 'story.points_one' : 'story.points_other', {
                        n: item.points ?? 0,
                      })}
                    </span>
                    <span> by </span>
                    {item.user && (
                      <Link href={`/user/${item.user}`} class="story-user">
                        {item.user}
                      </Link>
                    )}
                    <span> {item.time_ago}</span>
                    <span> | </span>
                  </>
                )}
                <span class="item-comment-count">
                  {t(item.comments_count === 1 ? 'story.comments_one' : 'story.comments_other', {
                    n: item.comments_count,
                  })}
                </span>
              </div>

              <div class="item-actions">
                <button
                  type="button"
                  class="link-btn"
                  onClick={handleShare}
                  title="Copy URL to clipboard"
                >
                  {() => (clipboard.copied() ? '✓ copied' : t('item.share'))}
                </button>
                <span> | </span>
                <button type="button" class="link-btn" onClick={handleBookmark}>
                  {() => (isBookmarked() ? t('item.unbookmark') : t('item.bookmark'))}
                </button>
                <span> | </span>
                <button type="button" class="link-btn" onClick={handleToggleJson}>
                  {() => (jsonOpen.value() ? 'hide JSON' : t('item.viewJson'))}
                </button>
                {() =>
                  can('admin') ? (
                    <>
                      <span> | </span>
                      <button
                        type="button"
                        class="link-btn"
                        onClick={() => toast.success('Admin: flagged for review')}
                      >
                        flag
                      </button>
                    </>
                  ) : null
                }
                <span class="breakpoint-debug">[{() => breakpoint()}]</span>
              </div>

              {item.content && <div class="item-content" innerHTML={item.content} />}
            </header>

            {() =>
              jsonOpen.value() && editor ? (
                <div class="raw-json">
                  <h3>Raw JSON</h3>
                  <CodeEditor
                    instance={editor}
                    style="border: 1px solid #333; border-radius: 4px; min-height: 240px; max-height: 480px"
                  />
                </div>
              ) : null
            }

            {item.comments.length === 0 ? (
              <div class="feed-state">No comments yet.</div>
            ) : item.comments_count >= VIRTUALIZE_THRESHOLD ? (
              <VirtualizedComments comments={item.comments} />
            ) : (
              <div class="comment-thread">
                {item.comments.map((c) => (
                  <CommentTree comment={c} />
                ))}
              </div>
            )}
          </>
        )
      }}
    </section>
  )
}
