/**
 * Production-truth probe (ssr-node / isr-node e2e): a loader that throws.
 * The server must answer 500 AND log the failure with the `[Pyreon]` prefix
 * and the request path — production errors used to be silent.
 */
import { h } from '@pyreon/core'

export const loader = () => {
  throw new Error('BOOM_PROBE_loader_failed')
}

export default function BoomPage() {
  return h('p', { 'data-testid': 'boom-page' }, 'unreachable')
}
