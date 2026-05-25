import { useQuery } from '@pyreon/query'
import { useHead } from '@pyreon/head'
import { Link } from '@pyreon/zero/link'
import { useRoute } from '@pyreon/router'
import CommentTree from '../../components/CommentTree'
import { fetchItem } from '../../lib/api'

export default function Item() {
  const route = useRoute()
  const id = () => route().params.id

  const query = useQuery(() => ({
    queryKey: ['item', id()],
    queryFn: () => fetchItem(id()),
  }))

  useHead({
    title: () => {
      const data = query.data()
      return data?.title
        ? `${data.title} | Hacker News (Pyreon)`
        : 'Loading… | Hacker News (Pyreon)'
    },
  })

  return (
    <section class="item-detail">
      {() => {
        if (query.isPending()) return <div class="feed-state">Loading story…</div>
        if (query.isError())
          return <div class="feed-state error">Failed to load: {String(query.error())}</div>
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
                    <span>{item.points} points</span>
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
                  {item.comments_count} {item.comments_count === 1 ? 'comment' : 'comments'}
                </span>
              </div>
              {item.content && (
                <div class="item-content" innerHTML={item.content} />
              )}
            </header>

            {item.comments.length > 0 ? (
              <div class="comment-thread">
                {item.comments.map((c) => (
                  <CommentTree comment={c} />
                ))}
              </div>
            ) : (
              <div class="feed-state">No comments yet.</div>
            )}
          </>
        )
      }}
    </section>
  )
}
