import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'

// fs-router emits `_layout.tsx` as a parent route in the matched chain.
// Passing `layout` to `startClient` is redundant (and contributes to
// the double-mount bug-shape PR #349 partially fixed for ssr-showcase).
// Mirroring the ssr-showcase entry-client pattern post-#349.
startClient({ routes })
