
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  profile: z.object({ bio: z.string() }).optional(),
}))
