import type { GetStaticPaths } from '@pyreon/zero/server'
import { useHead } from '@pyreon/head'
import { Link } from '@pyreon/zero/link'
import { useRoute } from '@pyreon/router'
import { postBySlug, postSlugs } from '../../lib/posts'

/**
 * Enumerate the dynamic route's `:slug` values at build time. The SSG
 * plugin expands `/blog/:slug` × this list into one prerendered HTML file
 * per post (`dist/blog/<slug>/index.html`). Without this export, the
 * dynamic route is silently skipped during SSG auto-detect — only the
 * static `/blog` index would be prerendered.
 */
export const getStaticPaths: GetStaticPaths<{ slug: string }> = () =>
  postSlugs().map((slug) => ({ params: { slug } }))

/**
 * Build-time ISR — revalidate every hour. The SSG plugin emits this
 * value into `dist/_pyreon-revalidate.json` keyed by every concrete
 * prerendered URL (`/blog/welcome`, `/blog/why-signals`, etc.). When a
 * managed host's deploy adapter triggers `adapter.revalidate(path)`,
 * the platform regenerates the matching HTML file on the next request.
 *
 * **Must be an inline literal** (`3600` or `false`) — the build-time
 * extractor doesn't follow identifier references or arithmetic
 * expressions. `pyreon/revalidate-not-pure-literal` catches violations
 * at lint time.
 */
export const revalidate = 3600

export default function PostPage() {
  // useRoute() returns an accessor — call it to read the resolved route.
  const route = useRoute()
  const slug = route().params.slug
  const post = slug ? postBySlug(slug) : undefined

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
      { name: 'description', content: post.description },
      { property: 'og:title', content: post.title },
      { property: 'og:description', content: post.description },
      { property: 'og:type', content: 'article' },
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
