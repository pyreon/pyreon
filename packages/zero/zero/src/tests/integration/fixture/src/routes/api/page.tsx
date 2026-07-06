import { h } from '@pyreon/core'

// PZ-11 — a PAGE route under the /api/ prefix. `isApiRoute` only claims
// `.ts`/`.js` files inside `api/`, so this `.tsx` file scans as a regular
// page route at `/api/page`. Exercises the dev SSR middleware's `/api/*`
// carve-out: the skip must NOT swallow a MATCHING page route (production
// parity — the production SSR handler has no /api skip).
export default function ApiPrefixPage() {
  return h('h1', null, 'Page under api prefix')
}
