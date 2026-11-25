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

// `add`: every page is a `<route>/index.html` directory, which a static host
// serves at `/<route>/`. The router's default (`strip`) wrote `/<route>`, a URL
// the host answers only with a redirect, and the address bar flipped between
// the two forms as the workbench and the router each wrote their own.
startClient({ routes, trailingSlash: 'add' })
