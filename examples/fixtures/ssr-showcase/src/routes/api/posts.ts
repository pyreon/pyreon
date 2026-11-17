import type { ApiContext } from '@pyreon/zero/api-routes'

/**
 * API route — in-memory post store.
 * GET returns all posts, POST adds a new one.
 */

interface Post {
  id: number
  title: string
  body: string
}

const posts: Post[] = [
  { id: 1, title: 'Getting Started with Pyreon', body: 'Pyreon is the fastest signal-based UI framework.' },
  { id: 2, title: 'Signal-Based Reactivity', body: 'Signals provide fine-grained reactivity with zero overhead.' },
  { id: 3, title: 'SSR with Zero', body: 'Zero is the full-stack meta-framework for Pyreon.' },
]

let nextId = 4

export function GET(_ctx: ApiContext) {
  return Response.json(posts)
}

export async function POST(ctx: ApiContext) {
  const body = await ctx.request.json() as { title: string; body: string }
  const post: Post = { id: nextId++, title: body.title, body: body.body }
  posts.push(post)
  return Response.json(post, { status: 201 })
}
