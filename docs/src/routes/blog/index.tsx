import { h, Suspense } from '@pyreon/core'
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import { RouterLink } from '@pyreon/router'
// Side-effect import — populates the collection registry for the SSG render.
import 'virtual:zero-content/collections'
import {
  BLOG_DESCRIPTION,
  BLOG_TITLE,
  COVER_HEIGHT,
  COVER_WIDTH,
  displayDate,
  getPublishedPosts,
  isoDay,
  SITE_ORIGIN,
} from '../../blog/posts'

/**
 * `/blog` — published posts, newest first. Async body inside `<Suspense>`,
 * the same shape `defineContentRoute` uses for `/docs/*`: the SSG render
 * awaits it, so the static HTML carries the full list.
 */
const PostList = (async (): Promise<VNodeChild> => {
  const posts = await getPublishedPosts()
  if (posts.length === 0) {
    return <p class="blog-index__empty">No posts yet.</p>
  }
  return (
    <ol class="blog-index__list">
      {posts.map((post) => (
        <li class="blog-card">
          <RouterLink to={`/blog/${post.slug}`} class="blog-card__link">
            <img
              class="blog-card__cover"
              src={post.data.cover}
              alt=""
              width={COVER_WIDTH}
              height={COVER_HEIGHT}
              loading="lazy"
            />
            <div class="blog-card__text">
              <time class="blog-card__date" datetime={isoDay(post.data.date)}>
                {displayDate(post.data.date)}
              </time>
              <h2 class="blog-card__title">{post.data.title}</h2>
              <p class="blog-card__description">{post.data.description}</p>
            </div>
          </RouterLink>
        </li>
      ))}
    </ol>
  )
}) as unknown as ComponentFn

export default function BlogIndexPage() {
  useHead({
    title: BLOG_TITLE,
    meta: [
      { name: 'description', content: BLOG_DESCRIPTION },
      { property: 'og:url', content: `${SITE_ORIGIN}/blog` },
      { property: 'og:title', content: BLOG_TITLE },
      { property: 'og:description', content: BLOG_DESCRIPTION },
    ],
    link: [{ rel: 'canonical', href: `${SITE_ORIGIN}/blog` }],
  })
  return (
    <div class="blog-index">
      <header class="blog-index__header">
        <h1>Blog</h1>
        <p>{BLOG_DESCRIPTION}</p>
        <p class="blog-index__feed">
          <a href="/blog/rss.xml">Subscribe via RSS</a>
        </p>
      </header>
      <Suspense fallback={h('p', { class: 'blog-index__loading' })}>
        <PostList />
      </Suspense>
    </div>
  )
}
