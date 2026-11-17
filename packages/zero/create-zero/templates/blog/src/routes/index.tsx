import { Suspense } from '@pyreon/core'
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import { PostList } from '@pyreon/zero-content/blog'
import { Link } from '@pyreon/zero/link'

import { blog } from '../blog'

export const meta = {
  title: 'Blog',
  description: 'A statically-rendered Pyreon Zero blog.',
}

/**
 * The five newest posts. An async component under <Suspense>: the static
 * build awaits it, so the HTML already holds the list.
 */
const RecentPosts = (async (): Promise<VNodeChild> => {
  const posts = await blog.getPosts()
  return (
    <>
      <PostList
        posts={posts.slice(0, 5)}
        coverSize={blog.config.coverSize}
      />
      {posts.length > 5 ? (
        <p>
          <Link href="/blog">View all {posts.length} posts →</Link>
        </p>
      ) : null}
    </>
  )
}) as unknown as ComponentFn

export default function Home() {
  useHead({
    title: meta.title,
    meta: [{ name: 'description', content: meta.description }],
  })

  return (
    <>
      <h1>Blog</h1>
      <p>
        Recent writing, statically rendered. Subscribe via <a href="/blog/rss.xml">RSS</a>.
      </p>
      <Suspense fallback={null}>
        <RecentPosts />
      </Suspense>
    </>
  )
}
