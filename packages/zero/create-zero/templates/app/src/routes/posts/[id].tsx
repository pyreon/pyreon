import { useHead } from "@pyreon/head"
import { useLoaderData } from "@pyreon/router"
import type { LoaderContext } from "@pyreon/zero"
import { Link } from "@pyreon/zero/link"

interface Post {
  id: number
  title: string
  excerpt: string
  body: string
  author: string
  date: string
}

const POSTS: Record<string, Post> = {
  "1": {
    id: 1,
    title: "Getting Started with Pyreon Zero",
    excerpt: "Learn how to build your first app.",
    body: "Pyreon Zero makes it incredibly easy to build modern web applications. Start by creating a new project with `bun create zero my-app`, then drop your first route file into `src/routes/`. The file-based router automatically picks up new files and generates the route tree for you.\n\nEvery route can export a `loader` for server-side data fetching, a `guard` for navigation protection, and `meta` for SEO metadata. The component itself uses JSX with Pyreon's signal-based reactivity — no virtual DOM overhead, just surgical DOM updates.",
    author: "Zero Team",
    date: "2026-03-01",
  },
  "2": {
    id: 2,
    title: "Understanding Signals",
    excerpt: "Deep dive into fine-grained reactivity.",
    body: "Signals are the foundation of Pyreon's reactivity system. Unlike the virtual DOM approach used by React, signals track exactly which DOM nodes depend on which pieces of state. When a signal changes, only the precise text nodes or attributes that reference it are updated.\n\nThis means your app does zero diffing, zero reconciliation, and zero unnecessary re-renders. A counter component that updates a number on screen? Only that one text node is touched. Everything else stays completely untouched.",
    author: "Zero Team",
    date: "2026-03-05",
  },
  "3": {
    id: 3,
    title: "Server-Side Rendering Made Simple",
    excerpt: "Pick the right strategy for every page.",
    body: "Zero supports four rendering strategies out of the box: SSR (server-side rendering), SSG (static site generation), ISR (incremental static regeneration), and SPA (single-page application). You can set a default mode in your config and override it per-route.\n\nSSR renders fresh HTML on every request. SSG pre-renders pages at build time. ISR combines both — serving cached static pages while revalidating in the background. SPA skips server rendering entirely for fully client-side pages.",
    author: "Zero Team",
    date: "2026-03-08",
  },
  "4": {
    id: 4,
    title: "Deploying to Production",
    excerpt: "From build to production with any platform.",
    body: "Zero's adapter system makes deployment straightforward. Choose your target platform — Node.js, Bun, Vercel, Cloudflare Workers, or Netlify — and Zero generates the right output for that platform.\n\nThe Node adapter creates a standalone HTTP server. The Bun adapter leverages Bun.serve() for maximum performance. The static adapter exports a fully pre-rendered site ready for any CDN or static hosting platform.",
    author: "Zero Team",
    date: "2026-03-10",
  },
  "5": {
    id: 5,
    title: "Optimizing Performance",
    excerpt: "Built-in performance features.",
    body: "Zero includes a comprehensive performance toolkit. The font plugin automatically optimizes Google Fonts with preconnect hints and font-display:swap. The <Image> component provides lazy loading with IntersectionObserver, responsive srcset, and blur-up placeholders.\n\nThe <Link> component prefetches routes on hover or viewport entry, making navigation feel instant. Built-in cache middleware sets optimal Cache-Control headers — immutable caching for hashed assets, stale-while-revalidate for pages.",
    author: "Zero Team",
    date: "2026-03-12",
  },
}

export async function loader(ctx: LoaderContext) {
  await new Promise((r) => setTimeout(r, 50))
  const post = POSTS[ctx.params.id]
  if (!post) throw new Error("Post not found")
  return { post }
}

export default function PostDetail() {
  const data = useLoaderData<{ post: Post }>()
  const post = data.post

  useHead({
    title: `${post.title} — Pyreon Zero`,
    meta: [{ name: "description", content: post.excerpt }],
  })

  return (
    <article class="post-detail">
      <Link
        href="/posts"
        style="color: var(--c-text-muted); font-size: 0.85rem; display: inline-block; margin-bottom: var(--space-lg);"
      >
        ← Back to Posts
      </Link>

      <h1>{post.title}</h1>

      <div class="post-meta">
        <span>{post.author}</span>
        <span>{post.date}</span>
      </div>

      <div class="post-body">
        {post.body.split("\n\n").map((paragraph) => (
          <p style="margin-bottom: var(--space-lg);">{paragraph}</p>
        ))}
      </div>
    </article>
  )
}
