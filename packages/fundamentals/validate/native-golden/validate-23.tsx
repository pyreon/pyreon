
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  posts: z.array(z.object({
    title: z.string(),
    views: z.number(),
  })),
}))
