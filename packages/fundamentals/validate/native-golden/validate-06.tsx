import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const userSchema = zodSchema(z.object({
  name: z.string().min(2).optional(),
  addr: z.object({ city: z.string() }),
  tags: z.array(z.string().url()),
  rows: z.array(z.object({ q: z.number() })),
}))
