import { h } from '@pyreon/core'
import { defineContentRoute } from '@pyreon/zero-content'
import type { GetStaticPaths } from '@pyreon/zero/server'
// Side-effect import — populates the collection registry for the SSG render
// (see routes/docs/[...slug].tsx).
import 'virtual:zero-content/collections'
import { RouterLink } from '@pyreon/router'
import { PyreonNotFound } from '../../components/PyreonNotFound'
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  displayDate,
  getPublishedPosts,
  isoDay,
  type PostData,
  SITE_ORIGIN,
} from '../../blog/posts'

/**
 * One page per PUBLISHED post. Drafts and posts dated after the build are
 * not in the bundle, so they get no page here and `/blog/<slug>` falls
 * through to the not-found view on the client as well.
 */
export const getStaticPaths: GetStaticPaths<{ slug: string }> = async () => {
  const posts = await getPublishedPosts()
  for (const post of posts) {
    if (post.data.slug !== post.slug) {
      throw new Error(
        `[docs/blog] src/content/blog/${post.slug}.md declares slug "${post.data.slug}". Rename the file or fix the frontmatter so the two match — the URL comes from the file name.`,
      )
    }
  }
  return posts.map((post) => ({ params: { slug: post.slug } }))
}

export default defineContentRoute('blog', {
  articleClass: null,
  notFound: () => h(PyreonNotFound, null),
  head: (entry) => {
    const data = entry.data as unknown as PostData
    const url = `${SITE_ORIGIN}/blog/${entry.slug}`
    const image = `${SITE_ORIGIN}${data.cover}`
    return {
      title: `${data.title} | Pyreon blog`,
      meta: [
        { name: 'description', content: data.description },
        { property: 'og:type', content: 'article' },
        { property: 'og:url', content: url },
        { property: 'og:title', content: data.title },
        { property: 'og:description', content: data.description },
        { property: 'og:image', content: image },
        { property: 'og:image:width', content: String(COVER_WIDTH) },
        { property: 'og:image:height', content: String(COVER_HEIGHT) },
        { property: 'og:image:alt', content: data.title },
        { property: 'article:published_time', content: isoDay(data.date) },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: data.title },
        { name: 'twitter:description', content: data.description },
        { name: 'twitter:image', content: image },
        { name: 'twitter:image:alt', content: data.title },
      ],
      link: [{ rel: 'canonical', href: data.canonical ?? url }],
    }
  },
  wrap: (entry, body) => {
    const data = entry.data as unknown as PostData
    return (
      <article class="blog-post">
        <header class="blog-post__header">
          <RouterLink to="/blog" class="blog-post__back">
            ← All posts
          </RouterLink>
          <h1 class="blog-post__title">{data.title}</h1>
          <p class="blog-post__meta">
            <time datetime={isoDay(data.date)}>{displayDate(data.date)}</time>
            {(data.tags ?? []).length > 0 ? (
              <span class="blog-post__tags">
                {(data.tags ?? []).map((tag) => (
                  <span class="blog-tag">#{tag}</span>
                ))}
              </span>
            ) : null}
          </p>
        </header>
        <img
          class="blog-post__cover"
          src={data.cover}
          alt=""
          width={COVER_WIDTH}
          height={COVER_HEIGHT}
        />
        <div class="docs-content vp-doc blog-post__body">{body}</div>
        <footer class="blog-post__footer">
          <RouterLink to="/blog">← All posts</RouterLink>
          <a href="/blog/rss.xml">RSS feed</a>
        </footer>
      </article>
    )
  },
})
