import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { useParams } from "@pyreon/router"
import { postBySlug, postSlugs } from "../../lib/posts"

/**
 * Tells the SSG plugin which slugs to pre-render. Without this, the dynamic
 * route would only be reachable client-side at build time.
 */
export const ssgPaths = () => postSlugs().map((slug) => `/blog/${slug}`)

export default function PostPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const post = postBySlug(slug)

  if (!post) {
    return (
      <>
        <h1>Post not found</h1>
        <p>
          No post with slug <code>{slug}</code>.
        </p>
        <p>
          <Link href="/blog">← Back to all posts</Link>
        </p>
      </>
    )
  }

  useHead({
    title: post.title,
    meta: [
      { name: "description", content: post.description },
      { property: "og:title", content: post.title },
      { property: "og:description", content: post.description },
      { property: "og:type", content: "article" },
    ],
  })

  const Body = post.Component

  return (
    <article>
      <header class="post-header">
        <h1>{post.title}</h1>
        <div class="post-meta">{post.date}</div>
        {post.tags && post.tags.length > 0 ? (
          <div class="tags">
            {post.tags.map((t) => (
              <span class="tag">#{t}</span>
            ))}
          </div>
        ) : null}
      </header>

      <Body />

      <hr />

      <p>
        <Link href="/blog">← Back to all posts</Link>
      </p>
    </article>
  )
}
