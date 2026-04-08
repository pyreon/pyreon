import { useHead } from '@pyreon/head'
import { useLoaderData } from '@pyreon/router'
import { useUrlState } from '@pyreon/url-state'
import type { LoaderContext } from '@pyreon/zero'
import { allTags, posts } from '../../sections/blog/content/posts'
import type { Post } from '../../sections/blog/content/types'
import { formatDate } from '../../sections/blog/format'
import {
  BlogLead,
  BlogMain,
  BlogPage,
  BlogSidebar,
  BlogTitle,
  EmptyCard,
  EmptyText,
  PostCard,
  PostCardExcerpt,
  PostCardMeta,
  PostCardTitle,
  PostList,
  SidebarLabel,
  SidebarSection,
  TagButton,
  TagChip,
  TagCount,
  TagsRow,
} from '../../sections/blog/styled'

interface BlogIndexData {
  posts: Post[]
  allTags: string[]
}

/**
 * Loader runs server-side at SSR/SSG time and client-side on
 * navigation. For an in-memory blog the loader is synchronous, but the
 * shape (`async ({ params, query, signal }) => data`) matches what
 * you'd write against a real CMS or fetch endpoint.
 */
export async function loader(_ctx: LoaderContext): Promise<BlogIndexData> {
  return { posts, allTags }
}

/**
 * Default head meta for the blog index. Per-post detail pages override
 * this in their own `meta` export and via `useHead`.
 */
export const meta = {
  title: 'Blog — Pyreon App Showcase',
  description: 'Notes on signals, routing, styling, and shipping with Pyreon Zero.',
}

/**
 * Declare the intended render mode. Zero's route generator reads this
 * to decide between `lazy()` (SSR/SPA) and a static import (SSG/build-
 * time prerender). Today the static-import branch is wired; the actual
 * prerender pipeline is still in flight, so the route runs as SSR/SPA
 * at request time and as static at build time once that lands.
 */
export const renderMode = 'ssg' as const

export default function BlogIndexPage() {
  const data = useLoaderData<BlogIndexData>()
  const tag = useUrlState('tag', '')

  // Reactive head — the og:url and canonical link update when the
  // tag filter changes so shared URLs stay accurate.
  useHead(() => {
    const activeTag = tag()
    return {
      title: activeTag ? `Posts tagged "${activeTag}" — Pyreon Blog` : 'Pyreon Blog',
      meta: [
        {
          name: 'description',
          content: activeTag
            ? `Pyreon posts in the "${activeTag}" category.`
            : 'Notes on signals, routing, styling, and shipping with Pyreon Zero.',
        },
        { property: 'og:type', content: 'website' },
        {
          property: 'og:title',
          content: activeTag ? `Posts tagged "${activeTag}"` : 'Pyreon Blog',
        },
      ],
    }
  })

  const visible = (): Post[] => {
    const active = tag()
    if (!active) return data.posts
    return data.posts.filter((p) => p.tags.includes(active))
  }

  // Tag → count map, computed from the loader data so it doesn't
  // recompute per render.
  const tagCounts = new Map<string, number>()
  for (const post of data.posts) {
    for (const t of post.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }

  return (
    <BlogPage>
      <BlogSidebar>
        <SidebarSection>
          <SidebarLabel>Topics</SidebarLabel>
          <TagButton type="button" onClick={() => tag.set('')} $active={!tag()}>
            <span>All posts</span>
            <TagCount>{data.posts.length}</TagCount>
          </TagButton>
          {data.allTags.map((name) => (
            <TagButton type="button" onClick={() => tag.set(name)} $active={tag() === name}>
              <span>{name}</span>
              <TagCount>{tagCounts.get(name) ?? 0}</TagCount>
            </TagButton>
          ))}
        </SidebarSection>
      </BlogSidebar>

      <BlogMain>
        <BlogTitle>Pyreon Blog</BlogTitle>
        <BlogLead>
          Notes on signals, routing, styling, and shipping with Pyreon Zero. Filter by tag in
          the sidebar — every state change is reflected in the URL.
        </BlogLead>

        {() => {
          const list = visible()
          if (list.length === 0) {
            return (
              <EmptyCard>
                <EmptyText>No posts match the current filter.</EmptyText>
              </EmptyCard>
            )
          }
          return (
            <PostList>
              {list.map((post) => (
                <PostCard to={`/blog/${post.slug}`}>
                  <PostCardMeta>
                    <span>{formatDate(post.date)}</span>
                    <span>·</span>
                    <span>{post.readMinutes} min read</span>
                    <span>·</span>
                    <span>{post.author}</span>
                  </PostCardMeta>
                  <PostCardTitle>{post.title}</PostCardTitle>
                  <PostCardExcerpt>{post.excerpt}</PostCardExcerpt>
                  <TagsRow>
                    {post.tags.map((tagName) => (
                      <TagChip>{tagName}</TagChip>
                    ))}
                  </TagsRow>
                </PostCard>
              ))}
            </PostList>
          )
        }}
      </BlogMain>
    </BlogPage>
  )
}
