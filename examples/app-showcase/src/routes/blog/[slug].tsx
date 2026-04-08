import { useHead } from '@pyreon/head'
import { useLoaderData } from '@pyreon/router'
import type { LoaderContext } from '@pyreon/zero'
import { BlockRenderer } from '../../sections/blog/BlockRenderer'
import { findPost } from '../../sections/blog/content/posts'
import type { Post } from '../../sections/blog/content/types'
import { formatDate } from '../../sections/blog/format'
import {
  BackLink,
  NotFoundCard,
  NotFoundText,
  NotFoundTitle,
  PostArticle,
  PostHeader,
  PostMeta,
  PostMetaSeparator,
  PostTitle,
  TagChip,
  TagsRow,
} from '../../sections/blog/styled'

interface PostData {
  /** Resolved post, or null when the slug doesn't match anything. */
  post: Post | null
  /** Slug from the URL — used for the og:url and the not-found message. */
  slug: string
}

/**
 * Loader runs at SSR/SSG time on the server and again on client-side
 * navigation. The slug comes from the route params (`/blog/[slug]`).
 *
 * Returning `post: null` instead of throwing lets the page render a
 * styled 404 card without the full router error boundary kicking in,
 * which is friendlier when you arrive from an out-of-date link.
 */
export async function loader({ params }: LoaderContext): Promise<PostData> {
  const slug = params.slug ?? ''
  const post = findPost(slug)
  return { post: post ?? null, slug }
}

/**
 * Default head meta — overridden per-post inside the component via
 * `useHead`, but having a `meta` export gives the loader-less render
 * a baseline title until the post resolves.
 */
export const meta = {
  title: 'Post — Pyreon Blog',
}

/**
 * Declare the route's intended render mode. Zero's route generator
 * reads this and emits a static import for the component (since SSG
 * doesn't need lazy loading at runtime). When Zero's SSG pipeline
 * lands the prerender list will come from `vite.config.ts` via
 * `zero({ ssg: { paths: ... } })`.
 */
export const renderMode = 'ssg' as const

export default function PostDetailPage() {
  const data = useLoaderData<PostData>()

  // Per-post head meta. Reactive so a client-side navigation between
  // two posts (e.g. via a "next post" link) updates the title and
  // open-graph tags without a full reload.
  useHead(() => {
    const post = data.post
    if (!post) {
      return {
        title: 'Post not found — Pyreon Blog',
        meta: [{ name: 'robots', content: 'noindex' }],
      }
    }
    return {
      title: `${post.title} — Pyreon Blog`,
      meta: [
        { name: 'description', content: post.excerpt },
        { name: 'author', content: post.author },
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: post.title },
        { property: 'og:description', content: post.excerpt },
        ...(post.ogImage ? [{ property: 'og:image', content: post.ogImage }] : []),
        { property: 'article:published_time', content: post.date },
        { property: 'article:author', content: post.author },
        ...post.tags.map((tag) => ({ property: 'article:tag', content: tag })),
      ],
    }
  })

  if (!data.post) {
    return (
      <PostArticle>
        <BackLink to="/blog">← Back to blog</BackLink>
        <NotFoundCard>
          <NotFoundTitle>Post not found</NotFoundTitle>
          <NotFoundText>
            No post matches the slug "{data.slug}". It may have been renamed or removed.
          </NotFoundText>
        </NotFoundCard>
      </PostArticle>
    )
  }

  const post = data.post
  return (
    <PostArticle>
      <BackLink to="/blog">← Back to blog</BackLink>
      <PostHeader>
        <PostTitle>{post.title}</PostTitle>
        <PostMeta>
          <span>{formatDate(post.date)}</span>
          <PostMetaSeparator>·</PostMetaSeparator>
          <span>{post.readMinutes} min read</span>
          <PostMetaSeparator>·</PostMetaSeparator>
          <span>{post.author}</span>
        </PostMeta>
        <TagsRow>
          {post.tags.map((tag) => (
            <TagChip>{tag}</TagChip>
          ))}
        </TagsRow>
      </PostHeader>

      <BlockRenderer blocks={post.body} />
    </PostArticle>
  )
}
