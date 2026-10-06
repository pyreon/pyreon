
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  items: z.array(z.object({ k: z.string() })),
}))
