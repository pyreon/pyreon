import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'
import { registerErrorHandler } from '@pyreon/core'
import { layout } from './routes/_layout'

// Surface silently swallowed component errors in dev
registerErrorHandler((ctx) => {
  console.error(`[Pyreon Error] <${ctx.component}> ${ctx.phase}:`, ctx.error)
})

startClient({ routes, layout })
