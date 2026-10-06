
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  comments: z.array(z.object({ text: z.string() })).optional(),
}))
