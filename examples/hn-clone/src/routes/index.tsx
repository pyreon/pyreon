import { useQuery } from '@pyreon/query'
import { useHead } from '@pyreon/head'
import { Link } from '@pyreon/zero/link'
import { useTypedSearchParams } from '@pyreon/router'
import StoryRow from '../components/StoryRow'
import { fetchFeed } from '../lib/api'

export default function TopStories() {
  useHead({
    title: 'Top Stories — Hacker News (Pyreon)',
    meta: [{ name: 'description', content: 'A Hacker News clone built with @pyreon/zero' }],
  })

  const [search] = useTypedSearchParams({ page: 'number' })
  const page = () => Math.max(1, search().page || 1)

  const query = useQuery(() => ({
    queryKey: ['feed', 'news', page()],
    queryFn: () => fetchFeed('news', page()),
  }))

  return (
    <section class="feed">
      {() => {
        if (query.isPending()) return <div class="feed-state">Loading top stories…</div>
        if (query.isError())
          return <div class="feed-state error">Failed to load: {String(query.error())}</div>
        const stories = query.data() ?? []
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
                <Link href={`/?page=${p - 1}`} prefetch="hover">
                  ‹ prev
                </Link>
              ) : (
                <span class="disabled">‹ prev</span>
              )}
              <span class="page-indicator"> · page {p} · </span>
              <Link href={`/?page=${p + 1}`} prefetch="hover">
                more ›
              </Link>
            </>
          )
        }}
      </nav>
    </section>
  )
}
