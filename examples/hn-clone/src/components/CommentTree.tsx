import { Link } from '@pyreon/zero/link'
import type { Comment } from '../lib/api'

export interface CommentTreeProps {
  comment: Comment
}

export default function CommentTree(props: CommentTreeProps) {
  const c = props.comment
  return (
    <article class="comment" data-level={c.level}>
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
      {c.comments.length > 0 && (
        <div class="comment-children">
          {c.comments.map((child) => (
            <CommentTree comment={child} />
          ))}
        </div>
      )}
    </article>
  )
}
