
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  profile: z.object({
    name: z.string().min(2).max(50),
    nickname: z.string().optional(),
    age: z.number().min(0),
  }),
}))
