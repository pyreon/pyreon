/**
 * Phase 5 probe — SERVER-ONLY loader module. The sentinel string below is
 * the bundle-exclusion gate's discriminator: it must appear in the SERVER
 * bundle and in NO client asset (verify-modes asserts both). Reads the
 * request cookie to prove server loaders get the real request on both SSR
 * renders and `/_pyreon/data` single-fetch navigations.
 */
export async function serverLoader(ctx: { request?: Request }) {
  const cookie = ctx.request?.headers.get('cookie') ?? 'no-cookie'
  return {
    secret: 'SERVER_ONLY_SENTINEL_q7x9',
    sawCookie: cookie.includes('probe=') ? 'yes' : 'no',
  }
}
