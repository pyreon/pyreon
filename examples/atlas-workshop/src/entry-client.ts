import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'
import { registerErrorHandler } from '@pyreon/core'

// Surface silently swallowed component errors in dev
registerErrorHandler((ctx) => {
  console.error(`[Pyreon Error] <${ctx.component}> ${ctx.phase}:`, ctx.error)
})

// fs-router emits `_layout.tsx` as a parent route in the matched chain.
// Passing `layout` to `startClient` is redundant and causes a double-mount
// (3x `nav.sidebar` + 3x `main.content` after hydration mismatch).
// Mirroring the ssr-showcase / ui-showcase / app-showcase entry-client pattern.
startClient({ routes })
