import { defineAction } from '@pyreon/zero/actions'
import { db } from './db'

export const createPost = defineAction(async (ctx) => {
  return db.save({ json: ctx.json, secret: 'HANDLER_BODY_MARKER' })
})
