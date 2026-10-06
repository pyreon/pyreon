
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  meta: z.object({ id: z.string() }),
}))
