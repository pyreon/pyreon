import { useQuery } from '@pyreon/query'
import { useHead } from '@pyreon/head'
import { Link } from '@pyreon/zero/link'
import { useTypedSearchParams } from '@pyreon/router'
import StoryRow from './StoryRow'
import type { FeedKind } from '../lib/api'
import { fetchFeed } from '../lib/api'

export interface FeedPageProps {
  kind: FeedKind
  title: string
  pathBase: string
}

export default function FeedPage(props: FeedPageProps) {
  useHead({
    title: `${props.title} — Hacker News (Pyreon)`,
  })

  const [search] = useTypedSearchParams({ page: 'number' })
  const page = () => Math.max(1, search().page || 1)

  const query = useQuery(() => ({
    queryKey: ['feed', props.kind, page()],
    queryFn: () => fetchFeed(props.kind, page()),
  }))

  return (
    <section class="feed">
      {() => {
        if (query.isPending()) return <div class="feed-state">Loading…</div>
        if (query.isError())
          return <div class="feed-state error">Failed to load: {String(query.error())}</div>
        const stories = query.data() ?? []
        if (stories.length === 0) return <div class="feed-state">No stories.</div>
        const offset = (page() - 1) * 30
        return (
          <ol class="story-list">
            {stories.map((s, i) => (
              <StoryRow story={s} rank={offset + i + 1} />
            ))}
          </ol>
        )
      }}

      <nav class="pagination">
        {() => {
          const p = page()
          return (
            <>
              {p > 1 ? (
                <Link href={`${props.pathBase}${p > 2 ? `?page=${p - 1}` : ''}`} prefetch="hover">
                  ‹ prev
                </Link>
              ) : (
                <span class="disabled">‹ prev</span>
              )}
              <span class="page-indicator"> · page {p} · </span>
              <Link href={`${props.pathBase}?page=${p + 1}`} prefetch="hover">
                more ›
              </Link>
            </>
          )
        }}
      </nav>
    </section>
  )
}
