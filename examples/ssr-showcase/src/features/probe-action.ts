/**
 * A5 probe — a server action whose HANDLER carries a sentinel. zero's Vite
 * plugin must strip the handler (and imports only it uses) from the client
 * bundle; verify-modes asserts the sentinel is in the server bundle and in
 * NO client asset.
 */
import { defineAction } from '@pyreon/zero/actions'

export const probeAction = defineAction(async () => {
  return { secret: 'ACTION_HANDLER_SENTINEL_z3k8' }
})
