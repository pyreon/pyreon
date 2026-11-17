import { h } from '@pyreon/core'
import { RouterLink, useLoaderData } from '@pyreon/router'

interface Post {
  id: number
  title: string
}

/**
 * Posts list page — uses route loader to fetch data.
 */
export default function PostsPage() {
  const posts = useLoaderData<Post[]>()

  return h('div', { 'data-testid': 'posts-page' },
    h('h1', null, 'Posts'),
    h('div', { class: 'post-list' },
      ...(posts ?? []).map((post) =>
        h('div', { class: 'post-item', 'data-testid': 'post-item', key: post.id },
          h(RouterLink, { to: `/posts/${post.id}` }, post.title),
        ),
      ),
    ),
  )
}

export async function loader() {
  const posts: Post[] = [
    { id: 1, title: 'Getting Started with Pyreon' },
    { id: 2, title: 'Signal-Based Reactivity' },
    { id: 3, title: 'SSR with Zero' },
  ]
  return posts
}

export const meta = {
  title: 'Posts — SSR Showcase',
}
