import { useHead } from "@pyreon/head"
import { useLoaderData } from "@pyreon/router"
import type { LoaderContext } from "@pyreon/zero"
import { Link } from "@pyreon/zero/link"

interface Post {
  id: number
  title: string
  excerpt: string
}

const POSTS: Post[] = [
  {
    id: 1,
    title: "Getting Started with Pyreon Zero",
    excerpt: "Learn how to build your first app with file-based routing, SSR, and signals.",
  },
  {
    id: 2,
    title: "Understanding Signals",
    excerpt: "Deep dive into fine-grained reactivity — how signals replace the virtual DOM.",
  },
  {
    id: 3,
    title: "Server-Side Rendering Made Simple",
    excerpt: "SSR, SSG, ISR — pick the right strategy for every page in your app.",
  },
  {
    id: 4,
    title: "Deploying to Production",
    excerpt: "From bun build to production with Node, Bun, Vercel, or Cloudflare adapters.",
  },
  {
    id: 5,
    title: "Optimizing Performance",
    excerpt:
      "Font loading, image optimization, smart caching, and link prefetching out of the box.",
  },
]

export async function loader(_ctx: LoaderContext) {
  // Simulate network delay — in a real app, fetch from a database or API
  await new Promise((r) => setTimeout(r, 100))
  return { posts: POSTS }
}

export default function PostsIndex() {
  const data = useLoaderData<{ posts: Post[] }>()

  useHead({
    title: "Posts — Pyreon Zero",
    meta: [
      {
        name: "description",
        content: "Example posts showcasing Zero's data loading.",
      },
    ],
  })

  return (
    <>
      <div class="page-header">
        <span class="badge">Data Loading</span>
        <h1 style="margin-top: var(--space-md);">Posts</h1>
        <p>
          Each post is loaded via a <code>loader</code> function — server-side data fetching that
          runs before the route renders.
        </p>
        <Link href="/posts/new" class="btn" style="margin-top: var(--space-md);">
          + New Post
        </Link>
      </div>

      <div class="posts-grid">
        {data.posts.map((post) => (
          <Link href={`/posts/${post.id}`} class="card post-card" prefetch="hover">
            <span class="post-id">#{post.id}</span>
            <div>
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>

      <div class="code-block" style="max-width: 520px; margin: var(--space-2xl) auto 0;">
        <div class="code-block-header">
          <span>posts/index.tsx</span>
        </div>
        <pre>
          <code>
            <span class="cm">{"// Export a loader — runs on the server"}</span>
            <span class="kw">export async function</span> <span class="fn">loader</span>(ctx) {"{"}
            <span class="kw">const</span> posts = <span class="kw">await</span> db.posts.
            <span class="fn">findMany</span>()
            <span class="kw">return</span> {"{"} posts {"}"}
            {"}"}
            <span class="cm">{"// Access data in the component"}</span>
            <span class="kw">const</span> data = <span class="fn">useLoaderData</span>()
          </code>
        </pre>
      </div>
    </>
  )
}
