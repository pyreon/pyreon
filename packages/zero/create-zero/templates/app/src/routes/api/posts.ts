import type { ApiContext } from '@pyreon/zero/api-routes'

/**
 * API route example — /api/posts
 *
 * API routes are plain .ts files in src/routes/api/ that export
 * HTTP method handlers: GET, POST, PUT, PATCH, DELETE, OPTIONS.
 *
 * They run on the server and return Response objects directly.
 */

const POSTS = [
  { id: 1, title: 'Getting Started with Pyreon Zero', published: true },
  { id: 2, title: 'Understanding Signals', published: true },
  { id: 3, title: 'Server-Side Rendering Made Simple', published: false },
]

export function GET(_ctx: ApiContext) {
  return Response.json(POSTS.filter((p) => p.published))
}

/**
 * Check the request body at runtime. A type annotation on `request.json()`
 * asserts nothing: a client can send anything. Swap in a `@pyreon/validate`
 * schema once the shape grows.
 */
function parseNewPost(body: unknown): { title: string; published: boolean } | null {
  if (typeof body !== 'object' || body === null) return null
  const { title, published } = body as Record<string, unknown>
  if (typeof title !== 'string' || title.trim() === '') return null
  if (published !== undefined && typeof published !== 'boolean') return null

  return { title: title.trim(), published: published ?? false }
}

export async function POST(ctx: ApiContext) {
  const body = parseNewPost(await ctx.request.json())

  if (!body) {
    return Response.json(
      { error: 'Expected { title: string, published?: boolean }' },
      { status: 400 },
    )
  }

  const post = {
    id: POSTS.length + 1,
    title: body.title,
    published: body.published,
  }

  POSTS.push(post)

  return Response.json(post, { status: 201 })
}
