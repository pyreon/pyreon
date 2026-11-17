/**
 * A5 probe — a page that declares a server action whose HANDLER carries a
 * sentinel. The page is in the CLIENT graph, so zero's Vite plugin must strip
 * the handler (and imports only it uses) from the client bundle; verify-modes
 * asserts the sentinel is in the server bundle and in NO client asset.
 *
 * The action lives in the page module on purpose: with route middleware in
 * the app, an action is gated as the page that declares it, and one that no
 * page declares (a shared `features/*.ts` module) is refused with 403.
 */
import { h } from '@pyreon/core'
import { defineAction } from '@pyreon/zero/actions'

export const probeAction = defineAction(async () => {
  return { secret: 'ACTION_HANDLER_SENTINEL_z3k8' }
})

export default function ActionProbePage() {
  return h(
    'button',
    { 'data-testid': 'action-probe', onClick: () => void probeAction() },
    'Run action',
  )
}
