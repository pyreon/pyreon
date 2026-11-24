/**
 * The workbench app's client entry.
 *
 * Under `atlas dev` the browser-verify bridge is installed first, on the
 * page's own module graph (see `./verify-bridge`). A build folds the branch
 * away, so a deployed site never carries it.
 */
import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'
import { installVerifyBridge } from './verify-bridge'

if (import.meta.env.DEV) installVerifyBridge()

startClient({ routes })
