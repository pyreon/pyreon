import { defineAction } from '@pyreon/zero/actions'

export const echo = defineAction(async (ctx) => ({ echoed: (ctx.json as { msg: string }).msg }))
