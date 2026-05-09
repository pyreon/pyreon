import { h, Show } from '@pyreon/core'
import { useLoaderData } from '@pyreon/router'

interface Post {
  id: number
  title: string
  body: string
}

const POSTS: Post[] = [
  { id: 1, title: 'Getting Started with Pyreon', body: 'Pyreon is the fastest signal-based UI framework.' },
  { id: 2, title: 'Signal-Based Reactivity', body: 'Signals provide fine-grained reactivity with zero overhead.' },
  { id: 3, title: 'SSR with Zero', body: 'Zero is the full-stack meta-framework for Pyreon.' },
]

/**
 * Single post page — uses route loader.
 */
export default function PostPage() {
  const data = useLoaderData<Post | null>()

  return h('div', { 'data-testid': 'post-page' },
    h(Show, {
      when: () => data != null,
      fallback: h('p', null, 'Post not found'),
    },
      () => {
        const post = data as Post
        return h('article', null,
          h('h1', { 'data-testid': 'post-title' }, post.title),
          h('p', { 'data-testid': 'post-body' }, post.body),
        )
      },
    ),
  )
}

export async function loader({ params }: { params: Record<string, string> }) {
  const id = Number(params.id)
  return POSTS.find((p) => p.id === id) ?? null
}

// PR H follow-up — enumerates concrete post IDs for SSG. Combined with
// `zero({ i18n })`, the SSG plugin produces the cross-product:
// 3 IDs × N locales paths. Lets the verify-modes ssg-i18n cell assert
// dynamic-route × locale composition (the unit test in
// i18n-routing.test.ts covers it at the function level; this gates it
// at the dist-filesystem level).
export function getStaticPaths() {
  return POSTS.map((p) => ({ params: { id: String(p.id) } }))
}

export const meta = {
  title: 'Post — SSR Showcase',
}
