import { useLoaderData } from '@pyreon/router'

/**
 * Data from the `.server.ts` sibling: rendered in-process on the server, and
 * single-fetched from `/_pyreon/data` on a client navigation.
 */
export default function SecretPage() {
  const data = useLoaderData<{ secret: string; sawCookie: string }>()
  return (
    <div data-testid="secret-page">
      <p data-testid="secret-value">{data?.secret ?? 'none'}</p>
      <p data-testid="cookie-flag">{data?.sawCookie ?? 'unknown'}</p>
    </div>
  )
}

/** Route middleware — zero's per-route auth hook; must guard the data endpoint too. */
export const middleware = (ctx: { req: Request }) => {
  if (ctx.req.headers.get('x-edge-auth') === 'deny') return new Response('Unauthorized', { status: 401 })
  return undefined
}
