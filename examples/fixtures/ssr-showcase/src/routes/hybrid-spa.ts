/**
 * Phase 2 probe — a route that declares `renderMode = 'spa'` inside this
 * SSR-mode app: the opt-this-route-out-of-SSR hatch. The server responds
 * with the CSR shell (no server render); the client mounts fresh and runs
 * the loader on the cold-start path. The e2e asserts the RAW response
 * carries no page markup while the hydrated DOM does.
 */
import { h } from '@pyreon/core'
import { state } from '@pyreon/core/plain'

export const renderMode = 'spa'

let clicks = state(0)

export default function HybridSpaPage() {
  return h(
    'div',
    { 'data-testid': 'hybrid-spa-page' },
    h('h1', null, 'Hybrid SPA'),
    h(
      'button',
      {
        'data-testid': 'hybrid-spa-inc',
        onClick: () => { clicks = clicks + 1 },
      },
      'inc',
    ),
    h('span', { 'data-testid': 'hybrid-spa-count' }, () => String(clicks)),
  )
}
