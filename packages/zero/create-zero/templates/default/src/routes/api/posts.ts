import type { ApiContext } from "@pyreon/zero"

/**
 * API route example — /api/posts
 *
 * API routes are plain .ts files in src/routes/api/ that export
 * HTTP method handlers: GET, POST, PUT, PATCH, DELETE, OPTIONS.
 *
 * They run on the server and return Response objects directly.
 */

const POSTS = [
  { id: 1, title: "Getting Started with Pyreon Zero", published: true },
  { id: 2, title: "Understanding Signals", published: true },
  { id: 3, title: "Server-Side Rendering Made Simple", published: false },
]

export function GET(_ctx: ApiContext) {
  return Response.json(POSTS.filter((p) => p.published))
}

export async function POST(ctx: ApiContext) {
  const body = (await ctx.request.json()) as {
    title: string
    published?: boolean
  }

  if (!body.title) {
    return Response.json({ error: "Title is required" }, { status: 400 })
  }

  const post = {
    id: POSTS.length + 1,
    title: body.title,
    published: body.published ?? false,
  }

  POSTS.push(post)
  return Response.json(post, { status: 201 })
}
