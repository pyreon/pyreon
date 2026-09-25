/**
 * A5 probe — a page that imports a server action, so the action module is
 * in the CLIENT graph and the handler-stripping transform has something to
 * strip. See `src/features/probe-action.ts`.
 */
import { h } from '@pyreon/core'
import { probeAction } from '../features/probe-action'

export default function ActionProbePage() {
  return h(
    'button',
    { 'data-testid': 'action-probe', onClick: () => void probeAction() },
    'Run action',
  )
}
