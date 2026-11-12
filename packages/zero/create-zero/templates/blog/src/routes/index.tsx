import { For } from "@pyreon/core"
import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { posts } from "../lib/posts"

export const meta = {
  title: "Blog",
  description: "A statically-rendered Pyreon Zero blog.",
}

export default function Home() {
  useHead({
    title: meta.title,
    meta: [{ name: "description", content: meta.description }],
  })

  // Show the 5 most recent posts on the homepage
  const recent = posts.slice(0, 5)

  return (
    <>
      <h1>Blog</h1>
      <p>Recent writing, statically rendered. Subscribe via <a href="/api/rss">RSS</a>.</p>

      <ul class="post-list">
        <For each={recent} by={(post) => post.slug}>{(post) => (
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
                <For each={post.tags} by={(t) => t}>{(t) => (
                  <span class="tag">#{t}</span>
                )}</For>
              </div>
            ) : null}
          </li>
        )}</For>
      </ul>

      {posts.length > recent.length ? (
        <p>
          <Link href="/blog">View all {posts.length} posts →</Link>
        </p>
      ) : null}
    </>
  )
}
