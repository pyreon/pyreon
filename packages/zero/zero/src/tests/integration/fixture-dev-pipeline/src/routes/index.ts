import { h } from '@pyreon/core'
import { defineAction } from '@pyreon/zero/actions'
import { shared } from '../actions'

// Declared on the public home page: gated by the home page's (empty) chain.
export const echo = defineAction(async (ctx) => ({ echoed: (ctx.json as { msg: string }).msg }))

export default function Home() {
  return h('h1', { 'data-action': echo.actionId, 'data-shared': shared.actionId }, 'home')
}
