/** Server-only loader: never shipped to the client bundle. */
export async function serverLoader(ctx: { request?: Request }) {
  const cookie = ctx.request?.headers.get('cookie') ?? ''
  return { secret: 'EDGE_SERVER_ONLY_SENTINEL', sawCookie: cookie.includes('probe=1') ? 'yes' : 'no' }
}
