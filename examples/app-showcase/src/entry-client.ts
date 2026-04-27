import { startClient } from '@pyreon/zero/client'
import { routes } from 'virtual:zero/routes'

// fs-router emits `_layout.tsx` as a parent route in the matched chain.
// Passing `layout` to `startClient` is redundant. Mirroring the
// ssr-showcase entry-client pattern post-PR #349.
startClient({ routes })
