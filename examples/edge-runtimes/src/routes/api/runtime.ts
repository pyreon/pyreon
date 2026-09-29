import type { ApiContext } from '@pyreon/zero/api-routes'

declare const EdgeRuntime: string | undefined

/**
 * Names the runtime actually executing the request. The edge smokes assert
 * on this so a smoke that silently fell back to Node cannot pass.
 */
function detectRuntime(): string {
  const g = globalThis as { Deno?: unknown; navigator?: { userAgent?: string } }
  if (typeof EdgeRuntime === 'string') return 'edge-runtime'
  if (g.Deno !== undefined) return 'deno'
  if (g.navigator?.userAgent === 'Cloudflare-Workers') return 'workerd'
  return 'other'
}

export function GET(ctx: ApiContext) {
  return Response.json({ runtime: detectRuntime(), path: ctx.url.pathname })
}

export async function POST(ctx: ApiContext) {
  const body = (await ctx.request.json()) as { echo?: string }
  return Response.json({ echo: body.echo ?? null }, { status: 201 })
}
