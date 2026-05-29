import { useVirtualizer } from '@pyreon/virtual'
import { signal } from '@pyreon/reactivity'
import { Link } from '@pyreon/zero/link'
import type { Comment } from '../lib/api'

interface FlatComment {
  id: number
  level: number
  user: string | null
  time_ago: string
  content: string
}

/**
 * Flatten a nested comment tree into a list of `FlatComment` rows. Each
 * row keeps its `level` (indentation depth). Suitable for virtualization
 * via `@pyreon/virtual` — the DOM only renders visible rows, no matter
 * how deeply nested or how many total comments.
 */
function flatten(comments: Comment[], out: FlatComment[] = [], baseLevel = 0): FlatComment[] {
  for (const c of comments) {
    out.push({
      id: c.id,
      level: c.level ?? baseLevel,
      user: c.user,
      time_ago: c.time_ago,
      content: c.content,
    })
    if (c.comments.length > 0) {
      flatten(c.comments, out, (c.level ?? baseLevel) + 1)
    }
  }
  return out
}

export interface VirtualizedCommentsProps {
  comments: Comment[]
}

/**
 * Virtualized flat-comment list — exercises `@pyreon/virtual` against a
 * real workload. Only renders the visible rows; the rest are layout-only
 * placeholders via the `totalSize` spacer pattern.
 *
 * Trade-off (documented): virtualization sacrifices the deep visual
 * nesting of the recursive `CommentTree` for O(visible) DOM nodes.
 * `data-level` is still set on each row so the CSS can indent it, but
 * scroll-jumping between deep replies is no longer possible.
 */
export default function VirtualizedComments(props: VirtualizedCommentsProps) {
  const flat = flatten(props.comments)
  const parentRef = signal<HTMLElement | null>(null)

  const virt = useVirtualizer(() => ({
    count: flat.length,
    getScrollElement: () => parentRef(),
    estimateSize: () => 120,
    overscan: 6,
  }))

  return (
    <div class="virtualized-comments">
      <div class="virtualized-comments-header">
        <strong>{flat.length} comments</strong>
        <span class="virt-hint"> (virtualized — only visible rows in DOM)</span>
      </div>
      <div
        ref={(el: HTMLElement | null) => parentRef.set(el)}
        class="virt-scroll"
        style="height: 600px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px"
      >
        <div style={() => `height: ${virt.totalSize()}px; width: 100%; position: relative`}>
          {() =>
            virt.virtualItems().map((row) => {
              const c = flat[row.index]
              if (!c) return null
              return (
                <article
                  key={String(row.key)}
                  class="comment"
                  data-level={c.level}
                  style={`
                    position: absolute;
                    top: 0;
                    left: 0;
                    transform: translateY(${row.start}px);
                    width: 100%;
                    padding-left: ${c.level * 18}px;
                  `}
                >
                  <header class="comment-meta">
                    {c.user ? (
                      <Link href={`/user/${c.user}`} class="comment-user">
                        {c.user}
                      </Link>
                    ) : (
                      <span class="comment-user deleted">[deleted]</span>
                    )}
                    <span class="comment-time"> {c.time_ago}</span>
                  </header>
                  <div class="comment-body" innerHTML={c.content} />
                </article>
              )
            })
          }
        </div>
      </div>
    </div>
  )
}
