import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { posts } from "../../lib/posts"

export const meta = {
  title: "All posts",
  description: "Every post on this blog, newest first.",
}

export default function BlogIndex() {
  useHead({
    title: meta.title,
    meta: [{ name: "description", content: meta.description }],
  })

  return (
    <>
      <h1>All posts</h1>
      <p>{posts.length} posts in total.</p>

      <ul class="post-list">
        {posts.map((post) => (
          <li>
            <h2 class="post-title">
              <Link href={`/blog/${post.slug}`} prefetch="hover">
                {post.title}
              </Link>
            </h2>
            <div class="post-meta">{post.date}</div>
            <p class="post-summary">{post.description}</p>
            {post.tags && post.tags.length > 0 ? (
              <div class="tags">
                {post.tags.map((t) => (
                  <span class="tag">#{t}</span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}
